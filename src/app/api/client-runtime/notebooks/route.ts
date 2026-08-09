import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, deleteClientRecord, insertClientRecord, recordClientAudit, selectClientRecords, updateClientRecord } from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "client_notebooks";
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET() {
  const session = await member();
  if (!session) return fail("not_authenticated", 401);
  const rate = await checkClientRuntimeRateLimit("notebook-read", 60, 900);
  if (!rate.ok) return fail("runtime_limit_unavailable", 503);
  if (!rate.allowed) return fail("runtime_rate_limited", 429);

  const result = await selectClientRecords(TABLE, {
    tenant_slug: `eq.${session.tenantSlug}`,
    order: "created_at.desc",
    limit: "60",
  });
  // A missing table reads as a schema gap rather than a generic failure, so the
  // surface can say the migration has not been applied instead of looking broken.
  if (!result.ok) return fail(result.status === 404 ? "notebook_schema_missing" : "notebook_read_failed", result.status === 404 ? 503 : 502);
  return NextResponse.json({ ok: true, notebooks: result.records.map(publicNotebook) }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await member();
  if (!session) return fail("not_authenticated", 401);
  const rate = await checkClientRuntimeRateLimit("notebook-write", 30, 900);
  if (!rate.ok) return fail("runtime_limit_unavailable", 503);
  if (!rate.allowed) return fail("runtime_rate_limited", 429);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 240) : "";
  const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 2000) : "";
  if (!title || containsClientSecretLike(`${title}\n${summary}`)) return fail("notebook_input_invalid", 400);

  const id = randomUUID();
  const stored = await insertClientRecord(TABLE, {
    id, tenant_slug: session.tenantSlug, created_by: session.userId, title, summary,
  });
  if (!stored.ok) return fail(stored.status === 404 ? "notebook_schema_missing" : "notebook_write_failed", stored.status === 404 ? 503 : 502);
  await recordClientAudit("tenant.notebook.created", { notebookId: id });
  return NextResponse.json({ ok: true, notebookId: id }, { status: 201, headers: { "cache-control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const session = await member();
  if (!session) return fail("not_authenticated", 401);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID.test(id)) return fail("notebook_input_invalid", 400);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string" && body.title.trim()) {
    if (containsClientSecretLike(body.title)) return fail("secret_like_input_rejected", 400);
    patch.title = body.title.trim().slice(0, 240);
  }
  if (typeof body.summary === "string") {
    if (containsClientSecretLike(body.summary)) return fail("secret_like_input_rejected", 400);
    patch.summary = body.summary.trim().slice(0, 2000);
  }
  if (body.status === "active" || body.status === "archived") patch.status = body.status;

  const updated = await updateClientRecord(TABLE, { id: `eq.${id}`, tenant_slug: `eq.${session.tenantSlug}` }, patch);
  if (!updated.ok) return fail("notebook_write_failed", 502);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}

export async function DELETE(request: Request) {
  const session = await member();
  if (!session) return fail("not_authenticated", 401);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!UUID.test(id)) return fail("notebook_input_invalid", 400);

  // The schema sets records.notebook_id to null rather than cascading, so the
  // client's imported sources survive and fall back to the unfiled library.
  const removed = await deleteClientRecord(TABLE, { id: `eq.${id}`, tenant_slug: `eq.${session.tenantSlug}` });
  if (!removed.ok) return fail("notebook_delete_failed", 502);
  await recordClientAudit("tenant.notebook.deleted", { notebookId: id });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}

function publicNotebook(record: Record<string, unknown>) {
  return {
    id: typeof record.id === "string" ? record.id : "",
    title: typeof record.title === "string" ? record.title : "Untitled notebook",
    summary: typeof record.summary === "string" ? record.summary : "",
    status: typeof record.status === "string" ? record.status : "active",
    createdAt: typeof record.created_at === "string" ? record.created_at : null,
  };
}

async function member() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember()) || !clientCapabilityEnabled("tenant-data")) return null;
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  return tenantSlug ? { userId: user.id, tenantSlug } : null;
}

function fail(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store" } });
}
