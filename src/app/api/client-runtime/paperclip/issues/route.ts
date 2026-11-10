import { recordClientAudit, selectClientRecords } from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import {
  PAPERCLIP_TABLES,
  UUID_RE,
  allocatePaperclipIssue,
  deletePaperclipRow,
  insertPaperclipRow,
  paperclipError,
  paperclipJson,
  paperclipReadLimit,
  paperclipSession,
  paperclipWriteLimit,
  readPaperclipIssues,
  updatePaperclipRow,
} from "@/lib/clientPaperclipData";
import {
  PAPERCLIP_ISSUE_PRIORITIES,
  PAPERCLIP_ISSUE_STATUSES,
  normalizePaperclipComment,
  normalizePaperclipIssue,
  type PaperclipIssue,
} from "@/lib/clientPaperclipAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABEL_RE = /^[a-z0-9][a-z0-9 _-]{0,30}$/i;

export async function GET(request: Request) {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipReadLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const issueId = new URL(request.url).searchParams.get("issueId")?.trim() ?? "";

  // A single issue request is the detail pane: it carries the build preview and
  // the comment thread that the list view deliberately omits.
  if (issueId) {
    if (!UUID_RE.test(issueId)) return paperclipError("paperclip_issue_input_invalid", 400);
    const [issues, comments] = await Promise.all([
      selectClientRecords(PAPERCLIP_TABLES.issues, { tenant_slug: `eq.${session.tenantSlug}`, id: `eq.${issueId}`, retention_expires_at: `gt.${new Date().toISOString()}`, limit: "1" }),
      selectClientRecords(PAPERCLIP_TABLES.comments, { tenant_slug: `eq.${session.tenantSlug}`, issue_id: `eq.${issueId}`, retention_expires_at: `gt.${new Date().toISOString()}`, order: "created_at.asc", limit: "100" }),
    ]);
    if (!issues.ok || !comments.ok) return paperclipError("paperclip_read_failed", 502);
    if (!issues.records[0]) return paperclipError("paperclip_issue_not_found", 404);
    return paperclipJson({
      configured: true,
      issue: normalizePaperclipIssue(issues.records[0]),
      comments: comments.records.map(normalizePaperclipComment),
    });
  }

  const issues = await readPaperclipIssues(session.tenantSlug);
  if (!issues.ok) {
    return issues.schemaMissing
      ? paperclipJson({ configured: false, reason: "paperclip_schema_missing", issues: [] })
      : paperclipError("paperclip_read_failed", 502);
  }
  return paperclipJson({ configured: true, issues: issues.rows.map(withoutPreview) });
}

export async function POST(request: Request) {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipWriteLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  if (body.action === "comment") return createComment(session.tenantSlug, session.userId, body);

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 240) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 20_000) : "";
  const priority = typeof body.priority === "string" && (PAPERCLIP_ISSUE_PRIORITIES as readonly string[]).includes(body.priority) ? body.priority : "medium";
  const projectId = typeof body.projectId === "string" && UUID_RE.test(body.projectId.trim()) ? body.projectId.trim() : null;
  const assigneeAgentId = typeof body.assigneeAgentId === "string" && UUID_RE.test(body.assigneeAgentId.trim()) ? body.assigneeAgentId.trim() : null;
  const labels = Array.isArray(body.labels)
    ? body.labels.filter((label): label is string => typeof label === "string" && LABEL_RE.test(label.trim())).map((label) => label.trim().slice(0, 32)).slice(0, 12)
    : [];
  if (!title) return paperclipError("paperclip_issue_input_invalid", 400);
  if (containsClientSecretLike(title, description)) return paperclipError("secret_like_input_rejected", 400);

  const created = await allocatePaperclipIssue({ tenantSlug: session.tenantSlug, title, description, priority, projectId, assigneeAgentId, labels });
  if (!created.ok) {
    if (created.schemaMissing) return paperclipError("paperclip_schema_missing", 503);
    return paperclipError("paperclip_issue_write_failed", 502);
  }
  await recordClientAudit("paperclip.issue_created", { identifier: created.issue.identifier, priority });
  return paperclipJson({ issue: withoutPreview(created.issue) }, 201);
}

export async function PATCH(request: Request) {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipWriteLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) return paperclipError("paperclip_issue_input_invalid", 400);

  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string" && (PAPERCLIP_ISSUE_STATUSES as readonly string[]).includes(body.status)) {
    patch.status = body.status;
    if (body.status === "done" || body.status === "cancelled") patch.completed_at = new Date().toISOString();
    if (body.status === "active") patch.started_at = new Date().toISOString();
  }
  if (typeof body.priority === "string" && (PAPERCLIP_ISSUE_PRIORITIES as readonly string[]).includes(body.priority)) patch.priority = body.priority;
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 240);
  if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 20_000);
  if (body.assigneeAgentId === null) patch.assignee_agent_id = null;
  else if (typeof body.assigneeAgentId === "string" && UUID_RE.test(body.assigneeAgentId.trim())) patch.assignee_agent_id = body.assigneeAgentId.trim();
  if (body.projectId === null) patch.project_id = null;
  else if (typeof body.projectId === "string" && UUID_RE.test(body.projectId.trim())) patch.project_id = body.projectId.trim();
  if (containsClientSecretLike(patch.title, patch.description)) return paperclipError("secret_like_input_rejected", 400);
  if (Object.keys(patch).length === 0) return paperclipError("paperclip_issue_input_invalid", 400);

  const updated = await updatePaperclipRow(PAPERCLIP_TABLES.issues, session.tenantSlug, id, patch);
  if (!updated.ok) return paperclipError("paperclip_issue_write_failed", 502);
  return paperclipJson({});
}

export async function DELETE(request: Request) {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipWriteLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!UUID_RE.test(id)) return paperclipError("paperclip_issue_input_invalid", 400);
  const removed = await deletePaperclipRow(PAPERCLIP_TABLES.issues, session.tenantSlug, id);
  if (!removed.ok) return paperclipError("paperclip_issue_delete_failed", 502);
  await recordClientAudit("paperclip.issue_deleted", {});
  return paperclipJson({});
}

async function createComment(tenantSlug: string, userId: string, body: Record<string, unknown>) {
  const issueId = typeof body.issueId === "string" ? body.issueId.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 10_000) : "";
  const authorAgentId = typeof body.authorAgentId === "string" && UUID_RE.test(body.authorAgentId.trim()) ? body.authorAgentId.trim() : null;
  if (!UUID_RE.test(issueId) || !text) return paperclipError("paperclip_comment_input_invalid", 400);
  if (containsClientSecretLike(text)) return paperclipError("secret_like_input_rejected", 400);
  const stored = await insertPaperclipRow(PAPERCLIP_TABLES.comments, {
    tenant_slug: tenantSlug,
    issue_id: issueId,
    created_by: userId,
    author_agent_id: authorAgentId,
    body: text,
  });
  if (!stored.ok) return paperclipError(stored.status === 404 ? "paperclip_schema_missing" : "paperclip_comment_write_failed", stored.status === 404 ? 503 : 502);
  return paperclipJson({}, 201);
}

function withoutPreview(issue: PaperclipIssue) {
  const { buildPreviewHtml: _preview, ...rest } = issue;
  void _preview;
  return { ...rest, hasBuild: Boolean(issue.buildArtifactId) };
}
