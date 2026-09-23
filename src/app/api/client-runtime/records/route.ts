import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, deleteClientRecord, insertClientRecord, selectClientRecords, updateClientRecord, recordClientAudit } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["memory", "journal", "goal", "notebook"]);
const GOAL_CATEGORIES = new Set(["Work", "Business", "Content", "SEO", "Health", "Personal", "Learning"]);
const SECRET_LIKE = /(api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token)\s*[:=]/i;

export async function GET(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);
  if (!clientCapabilityEnabled("tenant-data")) return jsonError("capability_not_enabled", 403);
  const rateLimit = await checkClientRuntimeRateLimit("tenant-records-read", 60, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);
  const kind = new URL(request.url).searchParams.get("kind")?.trim().toLowerCase() ?? "";
  if (!KINDS.has(kind)) return jsonError("record_kind_invalid", 400);
  // notebook=<uuid> scopes to one notebook; notebook=unfiled returns the records
  // that belong to none, so nothing a tenant imported can become unreachable
  // just because it predates notebooks.
  const notebook = new URL(request.url).searchParams.get("notebook")?.trim() ?? "";
  const scope: Record<string, string> = notebook === "unfiled" ? { notebook_id: "is.null" }
    : /^[0-9a-f-]{36}$/i.test(notebook) ? { notebook_id: `eq.${notebook}` }
    : {};
  const result = await selectClientRecords("client_runtime_records", {
    tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`,
    kind: `eq.${kind}`,
    ...scope,
    order: "created_at.desc",
    limit: "100",
  });
  if (!result.ok) return jsonError("records_read_failed", 502);
  return NextResponse.json({ ok: true, records: result.records }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);
  if (!clientCapabilityEnabled("tenant-data")) return jsonError("capability_not_enabled", 403);
  const rateLimit = await checkClientRuntimeRateLimit("tenant-records-write", 30, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const kind = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 240) : "";
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 30000) : "";
  const category = typeof body.category === "string" && GOAL_CATEGORIES.has(body.category.trim()) ? body.category.trim() : null;
  if (!KINDS.has(kind) || !title || !content || SECRET_LIKE.test(`${title}\n${content}`)) return jsonError("record_input_invalid", 400);
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return jsonError("tenant_not_configured", 503);
  const metadata = kind === "goal" && category ? { category } : {};
  const notebookId = typeof body.notebookId === "string" && /^[0-9a-f-]{36}$/i.test(body.notebookId.trim()) ? body.notebookId.trim() : null;
  if (body.notebookId != null && !notebookId) return jsonError("notebook_id_invalid", 400);
  if (notebookId && kind !== "notebook") return jsonError("notebook_id_invalid", 400);
  if (notebookId) {
    const notebook = await selectClientRecords("client_notebooks", {
      id: `eq.${notebookId}`,
      tenant_slug: `eq.${tenantSlug}`,
      status: "eq.active",
      limit: "1",
    });
    if (!notebook.ok) return jsonError("notebook_read_failed", 502);
    if (notebook.records.length !== 1) return jsonError("notebook_not_found", 404);
  }
  const stored = await insertClientRecord("client_runtime_records", { id: randomUUID(), tenant_slug: tenantSlug, created_by: user.id, kind, title, content, metadata, notebook_id: kind === "notebook" ? notebookId : null });
  if (!stored.ok) return jsonError("record_write_failed", 502);
  await recordClientAudit("tenant.record.created", { kind });
  return NextResponse.json({ ok: true }, { status: 201, headers: { "cache-control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);
  if (!clientCapabilityEnabled("tenant-data")) return jsonError("capability_not_enabled", 403);
  const rateLimit = await checkClientRuntimeRateLimit("tenant-records-write", 30, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["active", "done", "archived"].includes(status)) return jsonError("record_update_invalid", 400);
  const result = await updateClientRecord("client_runtime_records", { id: `eq.${id}`, tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`, created_by: `eq.${user.id}` }, { status, updated_at: new Date().toISOString() });
  if (!result.ok) return jsonError("record_update_failed", 502);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}

export async function DELETE(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);
  if (!clientCapabilityEnabled("tenant-data")) return jsonError("capability_not_enabled", 403);
  const rateLimit = await checkClientRuntimeRateLimit("tenant-records-write", 30, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("record_id_invalid", 400);
  const result = await deleteClientRecord("client_runtime_records", { id: `eq.${id}`, tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`, created_by: `eq.${user.id}` });
  if (!result.ok) return jsonError("record_delete_failed", 502);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "private, no-store" } });
}
