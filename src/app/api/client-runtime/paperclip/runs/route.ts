import { randomUUID } from "node:crypto";
import { cancelClientRuntimeJob, enqueueClientRuntimeJob, recordClientAudit, refundClientRuntimeRateLimit } from "@/lib/clientDataPlane";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { clientWorkspaceJobConfigured } from "@/lib/clientCloudRunJobs";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import { workspaceTerminalEvents } from "@/lib/clientWorkspaceExecution";
import {
  PAPERCLIP_TABLES,
  UUID_RE,
  ensurePaperclipCompany,
  insertPaperclipRow,
  paperclipError,
  paperclipJson,
  paperclipReadLimit,
  paperclipSession,
  paperclipWriteLimit,
  readPaperclipAgents,
  readPaperclipIssue,
  readPaperclipProjects,
  readPaperclipRuns,
  updatePaperclipRow,
} from "@/lib/clientPaperclipData";
import { paperclipRunPrompt } from "@/lib/clientPaperclipAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipReadLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const runs = await readPaperclipRuns(session.tenantSlug);
  if (!runs.ok) {
    return runs.schemaMissing
      ? paperclipJson({ configured: false, reason: "paperclip_schema_missing", runs: [] })
      : paperclipError("paperclip_read_failed", 502);
  }
  return paperclipJson({ configured: true, runs: runs.rows });
}

/**
 * Dispatches an agent run against a build issue. This is the hosted equivalent
 * of a Paperclip agent picking up an issue and shipping a build: it reserves a
 * durable run row, queues the approved Cloud Run Job lane, and lets the worker
 * commit the artifact and settle the run.
 */
export async function POST(request: Request) {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  if (!clientProviderCallsEnabled()) return paperclipError("provider_calls_require_approval", 403);
  const limit = await paperclipWriteLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const issueId = typeof body.issueId === "string" ? body.issueId.trim() : "";
  if (!UUID_RE.test(issueId)) return paperclipError("paperclip_run_input_invalid", 400);

  const issue = await readPaperclipIssue(session.tenantSlug, issueId);
  if (!issue) return paperclipError("paperclip_issue_not_found", 404);
  if (issue.executionState === "queued" || issue.executionState === "running") return paperclipError("paperclip_run_already_active", 409);

  const [company, agents, projects] = await Promise.all([
    ensurePaperclipCompany(session.tenantSlug),
    readPaperclipAgents(session.tenantSlug),
    readPaperclipProjects(session.tenantSlug),
  ]);
  if (!company.ok || !agents.ok || !projects.ok) return paperclipError("paperclip_read_failed", 502);

  const agent = agents.rows.find((candidate) => candidate.id === issue.assigneeAgentId) ?? null;
  if (agent && (agent.status === "paused" || agent.status === "terminated")) return paperclipError("paperclip_agent_unavailable", 409);

  // The assigned agent's reviewed provider wins; an unassigned issue falls back
  // to the tenant's approved workspace provider. Either way the allowlist and
  // model policy decide, not the browser.
  const requestedProvider = agent?.provider || process.env.CLIENT_WORKSPACE_PROVIDER?.trim().toLowerCase() || "openrouter";
  const requestedModel = agent?.model || process.env.CLIENT_WORKSPACE_MODEL?.trim() || null;
  const policy = clientProviderRequestAllowed(requestedProvider, requestedModel);
  if (!policy.ok) return paperclipError(policy.error, policy.status);

  const projectName = projects.rows.find((project) => project.id === issue.projectId)?.name ?? "";
  const prompt = paperclipRunPrompt({ company: company.company, issue, agent, project: projectName });

  const runId = randomUUID();
  const stored = await insertPaperclipRow(PAPERCLIP_TABLES.runs, {
    id: runId,
    tenant_slug: session.tenantSlug,
    created_by: session.userId,
    issue_id: issue.id,
    agent_id: agent?.id ?? null,
    status: "queued",
    provider: policy.provider,
    model: policy.model,
    summary: "Queued for the approved hosted runner.",
  });
  if (!stored.ok) return paperclipError(stored.status === 404 ? "paperclip_schema_missing" : "paperclip_run_write_failed", stored.status === 404 ? 503 : 502);

  const jobId = await enqueueClientRuntimeJob({
    capability: "workspace-execution",
    provider: policy.provider,
    model: policy.model,
    idempotencyKey: `paperclip-run-${runId}`,
    inputMetadata: {
      surface: "paperclip",
      title: `${issue.identifier} — ${issue.title}`.slice(0, 240),
      goal: issue.description || issue.title,
      artifactIntent: "preview",
      promptOverride: prompt,
      paperclipRunId: runId,
      paperclipIssueId: issue.id,
      terminalEvents: workspaceTerminalEvents("paperclip", "queued"),
    },
  });
  if (!jobId) {
    await failRun(session.tenantSlug, runId, issue.id, "paperclip_run_store_failed");
    return paperclipError("paperclip_run_store_failed", 502);
  }

  // The job id has to be on the run row before the task fires, otherwise the
  // worker's reconciliation has nothing to match against.
  await updatePaperclipRow(PAPERCLIP_TABLES.runs, session.tenantSlug, runId, { job_id: jobId });
  await updatePaperclipRow(PAPERCLIP_TABLES.issues, session.tenantSlug, issue.id, {
    execution_state: "queued",
    execution_job_id: jobId,
    status: issue.status === "done" ? "active" : issue.status === "backlog" ? "active" : issue.status,
    started_at: issue.startedAt ?? new Date().toISOString(),
  });

  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug: session.tenantSlug, path: clientWorkspaceJobConfigured() ? "dispatch" : "jobs" });
  if (!task.ok) {
    const taskError = task.error ?? "task_enqueue_failed";
    await cancelClientRuntimeJob(jobId, taskError);
    await refundClientRuntimeRateLimit("paperclip-write", 900);
    await failRun(session.tenantSlug, runId, issue.id, taskError);
    return paperclipError(taskError, task.status >= 500 ? 503 : task.status);
  }

  await recordClientAudit("paperclip.run_dispatched", { identifier: issue.identifier, provider: policy.provider });
  return paperclipJson({ runId, jobId, status: "queued" }, 202);
}

async function failRun(tenantSlug: string, runId: string, issueId: string, errorCode: string) {
  await updatePaperclipRow(PAPERCLIP_TABLES.runs, tenantSlug, runId, {
    status: "failed",
    error_code: errorCode.slice(0, 120),
    summary: "Run could not be queued.",
    finished_at: new Date().toISOString(),
  });
  await updatePaperclipRow(PAPERCLIP_TABLES.issues, tenantSlug, issueId, { execution_state: "failed" });
}
