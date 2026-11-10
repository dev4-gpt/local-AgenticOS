import { createPrivateKey, type KeyObject } from "node:crypto";
import { NextResponse } from "next/server";
import { adapterJsonError, adapterRouteGate, NO_STORE, readJsonObject } from "@/lib/adapterRouteGate";
import { handleAdapterTaskStart } from "@/lib/adapterTaskRequest";
import { RECENT_LIMIT, handleAdapterTaskRead } from "@/lib/adapterTaskStatus";
import { startAdapterTaskWithGrant } from "@/lib/adapterTaskStarter";
import { currentClientCredentialManager } from "@/lib/clientAuth";
import { recordClientAudit, selectClientRecords, workerRpc } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

/** The host's Ed25519 signing key, or null when it is missing or of another kind. */
function signingKey(): KeyObject | null {
  const pem = process.env.ADAPTER_TOKEN_SIGNING_KEY_PEM?.trim();
  if (!pem) return null;
  try {
    const key = createPrivateKey(pem);
    return key.asymmetricKeyType === "ed25519" ? key : null;
  } catch {
    return null;
  }
}

// What the Adapters page shows (any active member): with no query, the tasks it may offer, whether this person may start one,
// and the latest starts; with ?adapterId=&taskId=, that task's state and a short summary of its result, read from the adapter.
export async function GET(request: Request) {
  const gate = await adapterRouteGate("adapter-task-read", 60);
  if (!gate.ok) return gate.response;
  if (process.env.ADAPTER_MODEL_CALLS_ENABLED !== "true") return adapterJsonError("model_calls_disabled", 403);
  const result = await handleAdapterTaskRead(new URL(request.url).searchParams, {
    env: {
      tenantSlug: gate.tenantSlug,
      privateKey: signingKey(),
      tasksJson: process.env.ADAPTER_TASKS_JSON,
      endpointsJson: process.env.ADAPTER_ENDPOINTS,
      allowLoopback: process.env.ADAPTER_ALLOW_LOOPBACK === "true",
    },
    isManager: currentClientCredentialManager,
    readRecent: () => selectClientRecords("client_runtime_audit_events", {
      tenant_slug: `eq.${gate.tenantSlug}`, event_type: "eq.tenant.adapter.task_started", select: "metadata,created_at", order: "created_at.desc", limit: String(RECENT_LIMIT),
    }),
  });
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}

// An owner or admin starts an adapter task (ADR-020; ProofMint rounds first). Off unless the adapter host and model calls are
// both switched on; which adapters and tasks, and each task's budget, come only from the host's own settings.
export async function POST(request: Request) {
  const gate = await adapterRouteGate("adapter-task-start", 10);
  if (!gate.ok) return gate.response;
  if (process.env.ADAPTER_MODEL_CALLS_ENABLED !== "true") return adapterJsonError("model_calls_disabled", 403);
  const body = await readJsonObject(request, MAX_BODY_BYTES);
  const result = await handleAdapterTaskStart(body, {
    env: {
      tenantSlug: gate.tenantSlug,
      workerToken: process.env.CLIENT_WORKER_TOKEN?.trim() ?? "",
      privateKey: signingKey(),
      capUsd: Number(process.env.CLIENT_BUDGET_CAP ?? Number.NaN),
      hostBaseUrl: process.env.CLIENT_RUNTIME_BASE_URL,
      tasksJson: process.env.ADAPTER_TASKS_JSON,
      endpointsJson: process.env.ADAPTER_ENDPOINTS,
      allowlistJson: process.env.ADAPTER_MODEL_ALLOWLIST_JSON,
      allowLoopback: process.env.ADAPTER_ALLOW_LOOPBACK === "true",
    },
    isManager: currentClientCredentialManager,
    rpc: workerRpc,
    start: startAdapterTaskWithGrant,
    audit: recordClientAudit,
  });
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}
