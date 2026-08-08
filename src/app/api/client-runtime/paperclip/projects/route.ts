import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { recordClientAudit } from "@/lib/clientDataPlane";
import {
  PAPERCLIP_TABLES,
  UUID_RE,
  deletePaperclipRow,
  insertPaperclipRow,
  paperclipError,
  paperclipJson,
  paperclipReadLimit,
  paperclipSession,
  paperclipWriteLimit,
  readPaperclipProjects,
  updatePaperclipRow,
} from "@/lib/clientPaperclipData";
import { PAPERCLIP_PROJECT_STATUSES, paperclipUrlKey } from "@/lib/clientPaperclipAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipReadLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const projects = await readPaperclipProjects(session.tenantSlug);
  if (!projects.ok) {
    return projects.schemaMissing
      ? paperclipJson({ configured: false, reason: "paperclip_schema_missing", projects: [] })
      : paperclipError("paperclip_read_failed", 502);
  }
  return paperclipJson({ configured: true, projects: projects.rows });
}

export async function POST(request: Request) {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipWriteLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 4000) : "";
  const icon = typeof body.icon === "string" ? body.icon.trim().slice(0, 8) : "";
  const color = typeof body.color === "string" && HEX_COLOR.test(body.color.trim()) ? body.color.trim() : "#d4a574";
  const targetDate = typeof body.targetDate === "string" && ISO_DATE.test(body.targetDate.trim()) ? body.targetDate.trim() : null;
  if (!name || containsClientSecretLike(name, description)) return paperclipError("paperclip_project_input_invalid", 400);

  const stored = await insertPaperclipRow(PAPERCLIP_TABLES.projects, {
    tenant_slug: session.tenantSlug,
    created_by: session.userId,
    name,
    url_key: paperclipUrlKey(name, `project-${Date.now().toString(36)}`),
    description,
    icon,
    color,
    ...(targetDate ? { target_date: targetDate } : {}),
  });
  if (!stored.ok) {
    if (stored.status === 404) return paperclipError("paperclip_schema_missing", 503);
    return paperclipError(stored.status === 409 ? "paperclip_project_duplicate" : "paperclip_project_write_failed", stored.status === 409 ? 409 : 502);
  }
  await recordClientAudit("paperclip.project_created", { name });
  return paperclipJson({}, 201);
}

export async function PATCH(request: Request) {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipWriteLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) return paperclipError("paperclip_project_input_invalid", 400);
  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string" && (PAPERCLIP_PROJECT_STATUSES as readonly string[]).includes(body.status)) patch.status = body.status;
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
  if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 4000);
  if (containsClientSecretLike(patch.name, patch.description)) return paperclipError("secret_like_input_rejected", 400);
  if (Object.keys(patch).length === 0) return paperclipError("paperclip_project_input_invalid", 400);
  const updated = await updatePaperclipRow(PAPERCLIP_TABLES.projects, session.tenantSlug, id, patch);
  if (!updated.ok) return paperclipError("paperclip_project_write_failed", 502);
  return paperclipJson({});
}

export async function DELETE(request: Request) {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipWriteLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!UUID_RE.test(id)) return paperclipError("paperclip_project_input_invalid", 400);
  const removed = await deletePaperclipRow(PAPERCLIP_TABLES.projects, session.tenantSlug, id);
  if (!removed.ok) return paperclipError("paperclip_project_delete_failed", 502);
  await recordClientAudit("paperclip.project_deleted", {});
  return paperclipJson({});
}
