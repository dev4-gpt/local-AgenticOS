import { NextResponse } from "next/server";
import { PROMOTION_HTTP_STATUS, promotionErrorFrom, type PromotionErrorCode } from "@/lib/adapterMemoryGuard";
import { adapterJsonError, adapterRouteGate, NO_STORE, readJsonObject } from "@/lib/adapterRouteGate";
import { clientRpc, recordClientAudit } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4 * 1024;
const MIN_REASON_CHARS = 5;
const MAX_REASON_CHARS = 500;

const fail = (code: PromotionErrorCode) => adapterJsonError(code, PROMOTION_HTTP_STATUS[code]);

// Withdraw one shared note. Its text is erased, it can never come back, and a "memory.tombstoned" event tells adapters
// to drop their copies. Owners and admins only; the database decides, this route only checks the shape of the request.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await adapterRouteGate("adapter-memory-revoke", 20);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const body = await readJsonObject(request, MAX_BODY_BYTES);
  if (!body || !UUID.test(id)) return fail("invalid_input");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < MIN_REASON_CHARS || reason.length > MAX_REASON_CHARS) return fail("invalid_input");

  const result = await clientRpc("client_adapter_revoke_shared_memory", { p_item_id: id, p_reason: reason });
  if (!result.ok || typeof result.value !== "boolean") return fail(promotionErrorFrom(result));
  // true: withdrawn now. false: it was already withdrawn, and nothing more was done.
  if (result.value) await recordClientAudit("tenant.adapter.memory_revoked");
  return NextResponse.json({ ok: true, changed: result.value }, { headers: NO_STORE });
}
