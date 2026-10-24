import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import {
  cancelClientRuntimeJob, checkClientRuntimeRateLimit, deleteClientRecord, enqueueClientRuntimeJob,
  insertClientRecord, recordClientAudit, refundClientRuntimeRateLimit, selectClientRecords, updateClientRecord,
} from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { clientCapabilityEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { clientWorkspaceJobConfigured } from "@/lib/clientCloudRunJobs";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import {
  RUFLO_DEFAULT_PRESET, RUFLO_PRESETS, RUFLO_TOPOLOGIES, normalizeRufloAgent, normalizeRufloSwarm,
  rufloAgentTask, rufloRoster, rufloSchemaMissing,
} from "@/lib/clientRufloAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SWARMS = "client_ruflo_swarms";
const AGENTS = "client_ruflo_agents";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function session() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return null;
  if (!clientCapabilityEnabled("orchestration") || !clientCapabilityEnabled("text-agents")) return null;
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  return tenantSlug ? { userId: user.id, tenantSlug } : null;
}

function fail(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, {
    status,
    headers: { "cache-control": "private, no-store", ...(code === "runtime_rate_limited" ? { "Retry-After": "900" } : {}) },
  });
}

function done(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status, headers: { "cache-control": "private, no-store" } });
}

export async function GET(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("ruflo-read", 240, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const swarmId = new URL(request.url).searchParams.get("swarmId")?.trim() ?? "";

  if (swarmId) {
    if (!UUID_RE.test(swarmId)) return fail("ruflo_input_invalid", 400);
    const agents = await selectClientRecords(AGENTS, {
      tenant_slug: `eq.${user.tenantSlug}`, swarm_id: `eq.${swarmId}`,
      retention_expires_at: `gt.${new Date().toISOString()}`, order: "position.asc", limit: "20",
    });
    if (!agents.ok) return fail("ruflo_read_failed", 502);
    return done({ configured: true, agents: agents.records.map(normalizeRufloAgent) });
  }

  const swarms = await selectClientRecords(SWARMS, {
    tenant_slug: `eq.${user.tenantSlug}`, retention_expires_at: `gt.${new Date().toISOString()}`,
    order: "created_at.desc", limit: "50",
  });
  if (!swarms.ok) {
    return rufloSchemaMissing(swarms.status)
      ? done({ configured: false, reason: "ruflo_schema_missing", swarms: [], presets: presetSummary() })
      : fail("ruflo_read_failed", 502);
  }
  return done({ configured: true, swarms: swarms.records.map(normalizeRufloSwarm), presets: presetSummary() });
}

function presetSummary() {
  return Object.entries(RUFLO_PRESETS).map(([key, preset]) => ({
    key, label: preset.label, blurb: preset.blurb, agents: preset.roster.length,
  }));
}

/** Launches a swarm: the roster is written up front so the board is visible immediately. */
export async function POST(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  if (!clientProviderCallsEnabled()) return fail("provider_calls_require_approval", 403);
  const limit = await checkClientRuntimeRateLimit("ruflo-write", 12, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const objective = typeof body.objective === "string" ? body.objective.trim().slice(0, 4000) : "";
  if (!objective) return fail("ruflo_input_invalid", 400);
  if (containsClientSecretLike(objective)) return fail("secret_like_input_rejected", 400);
  const preset = typeof body.preset === "string" && RUFLO_PRESETS[body.preset] ? body.preset : RUFLO_DEFAULT_PRESET;
  const topology = typeof body.topology === "string" && (RUFLO_TOPOLOGIES as readonly string[]).includes(body.topology)
    ? body.topology : "hierarchical";

  const provider = process.env.CLIENT_WORKSPACE_PROVIDER?.trim().toLowerCase() || "openrouter";
  const policy = clientProviderRequestAllowed(provider, process.env.CLIENT_WORKSPACE_MODEL?.trim() || null);
  if (!policy.ok) return fail(policy.error, policy.status);

  const roster = rufloRoster(preset);
  const swarmId = randomUUID();
  const stored = await insertClientRecord(SWARMS, {
    id: swarmId,
    tenant_slug: user.tenantSlug,
    created_by: user.userId,
    objective,
    topology,
    preset,
    provider: policy.provider,
    model: policy.model,
    agent_count: roster.length,
  });
  if (!stored.ok) return fail(stored.status === 404 ? "ruflo_schema_missing" : "ruflo_write_failed", stored.status === 404 ? 503 : 502);

  // Write the roster before queuing, so the member sees the full team idle
  // rather than an empty swarm that fills in from nothing.
  const agentRows = roster.map((entry, index) => ({
    tenant_slug: user.tenantSlug,
    swarm_id: swarmId,
    agent_type: entry.type,
    name: entry.name,
    task: rufloAgentTask(entry, objective),
    position: index,
  }));
  const agentsStored = await insertClientRecord(AGENTS, agentRows);
  if (!agentsStored.ok) {
    await updateClientRecord(SWARMS, { id: `eq.${swarmId}`, tenant_slug: `eq.${user.tenantSlug}` }, { status: "failed", error_code: "ruflo_roster_write_failed" });
    return fail("ruflo_roster_write_failed", 502);
  }

  const jobId = await enqueueClientRuntimeJob({
    capability: "ruflo-swarm",
    provider: policy.provider,
    model: policy.model,
    idempotencyKey: `ruflo-swarm-${swarmId}`,
    inputMetadata: {
      rufloSwarmId: swarmId,
      objective,
      preset,
      provider: policy.provider,
      model: policy.model,
    },
  });
  if (!jobId) {
    await updateClientRecord(SWARMS, { id: `eq.${swarmId}`, tenant_slug: `eq.${user.tenantSlug}` }, { status: "failed", error_code: "ruflo_job_store_failed" });
    return fail("ruflo_job_store_failed", 502);
  }
  await updateClientRecord(SWARMS, { id: `eq.${swarmId}`, tenant_slug: `eq.${user.tenantSlug}` }, { job_id: jobId });

  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug: user.tenantSlug, path: clientWorkspaceJobConfigured() ? "dispatch" : "jobs" });
  if (!task.ok) {
    const taskError = task.error ?? "task_enqueue_failed";
    await cancelClientRuntimeJob(jobId, taskError);
    await refundClientRuntimeRateLimit("ruflo-write", 900);
    await updateClientRecord(SWARMS, { id: `eq.${swarmId}`, tenant_slug: `eq.${user.tenantSlug}` }, { status: "failed", error_code: taskError.slice(0, 120) });
    return fail(taskError, task.status >= 500 ? 503 : task.status);
  }
  await recordClientAudit("ruflo.swarm_launched", { preset, agents: roster.length });
  return done({ swarmId, jobId, agents: roster.length, status: "queued" }, 202);
}

export async function DELETE(request: Request) {
  const user = await session();
  if (!user) return fail("not_authenticated", 401);
  const limit = await checkClientRuntimeRateLimit("ruflo-write", 12, 900);
  if (!limit.ok) return fail("runtime_limit_unavailable", 503);
  if (!limit.allowed) return fail("runtime_rate_limited", 429);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!UUID_RE.test(id)) return fail("ruflo_input_invalid", 400);
  const removed = await deleteClientRecord(SWARMS, { id: `eq.${id}`, tenant_slug: `eq.${user.tenantSlug}` });
  if (!removed.ok) return fail("ruflo_delete_failed", 502);
  await recordClientAudit("ruflo.swarm_deleted", {});
  return done({});
}
