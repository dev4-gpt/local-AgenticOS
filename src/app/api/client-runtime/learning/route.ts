import { NextResponse } from "next/server";
import { eccSession } from "@/lib/eccAuth";
import { parseEccLesson, readEccBody } from "@/lib/eccLearning";
import { checkClientRuntimeRateLimit, clientRpc, selectClientRecords } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "private, no-store" } });
const fail = (error: string, status: number) => json({ ok: false, error }, status);
async function rate(write: boolean) {
  const result = await checkClientRuntimeRateLimit(write ? "ecc-learning-write" : "ecc-learning-read", write ? 30 : 120, 900);
  return !result.ok ? fail("runtime_limit_unavailable", 503) : !result.allowed ? fail("runtime_rate_limited", 429) : null;
}

export async function GET(request: Request) {
  const session = await eccSession(); if (!session) return fail("not_authenticated", 401);
  const limited = await rate(false); if (limited) return limited;
  if (new URL(request.url).searchParams.get("active") === "1") {
    const result = await clientRpc("active_client_ecc_revisions", { p_tenant_slug: session.tenantSlug });
    return result.ok ? json({ ok: true, role: session.role, revisions: result.value }) : fail("learning_read_failed", 503);
  }
  const items = await selectClientRecords("client_learning_items", { tenant_slug: `eq.${session.tenantSlug}`, order: "created_at.desc", limit: "100" });
  return items.ok ? json({ ok: true, role: session.role, items: items.records }) : fail("learning_read_failed", 503);
}

export async function POST(request: Request) {
  const session = await eccSession(); if (!session) return fail("not_authenticated", 401);
  if (!["owner", "admin", "member"].includes(session.role)) return fail("learning_forbidden", 403);
  const limited = await rate(true); if (limited) return limited;
  const body = await readEccBody(request, ["content", "idempotencyKey", "confidence", "sourceJobId", "sourceRecordId"]);
  const content = parseEccLesson(body?.content);
  if (!body || !content || typeof body.idempotencyKey !== "string" || !/^[a-zA-Z0-9:._-]{8,180}$/.test(body.idempotencyKey)
    || (body.confidence !== undefined && (typeof body.confidence !== "number" || !Number.isFinite(body.confidence) || body.confidence < 0 || body.confidence > 1))
    || (body.sourceJobId != null && !uuid(body.sourceJobId)) || (body.sourceRecordId != null && !uuid(body.sourceRecordId)) || (body.sourceJobId && body.sourceRecordId)) return fail("learning_input_invalid", 400);
  const result = await clientRpc("propose_client_learning", { p_tenant_slug: session.tenantSlug, p_key: body.idempotencyKey, p_content: content, p_confidence: body.confidence ?? 0, p_source_job_id: body.sourceJobId ?? null, p_source_record_id: body.sourceRecordId ?? null });
  return result.ok && typeof result.value === "string" ? json({ ok: true, id: result.value }) : fail("learning_proposal_conflict_or_invalid", result.status >= 500 ? 503 : 409);
}

export async function PATCH(request: Request) {
  const session = await eccSession(); if (!session) return fail("not_authenticated", 401);
  const body = await readEccBody(request, ["action", "id", "expectedHash", "content", "decision"]);
  if (!body || !["edit", "review", "revoke"].includes(String(body.action)) || !uuid(body.id) || typeof body.expectedHash !== "string" || !/^[0-9a-f]{64}$/.test(body.expectedHash)) return fail("learning_input_invalid", 400);
  if (session.role === "viewer" || (body.action !== "edit" && !["owner", "admin"].includes(session.role))) return fail("learning_forbidden", 403);
  const limited = await rate(true); if (limited) return limited;
  const args: Record<string, unknown> = { p_tenant_slug: session.tenantSlug, p_item_id: body.id, p_expected_hash: body.expectedHash };
  let fn: string;
  if (body.action === "edit") {
    const content = parseEccLesson(body.content); if (!content) return fail("learning_input_invalid", 400);
    args.p_content = content; fn = "edit_client_learning";
  } else if (body.action === "review") {
    if (!["approve", "reject"].includes(String(body.decision))) return fail("learning_input_invalid", 400);
    args.p_decision = body.decision; fn = "review_client_learning";
  } else fn = "revoke_client_learning";
  const result = await clientRpc(fn, args);
  return result.ok && result.value === true ? json({ ok: true }) : fail("learning_review_conflict_or_forbidden", result.status >= 500 ? 503 : 409);
}
