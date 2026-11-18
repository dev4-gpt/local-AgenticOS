import { NextResponse } from "next/server";
import { PROMOTION_HTTP_STATUS, promotionErrorFrom, type PromotionErrorCode } from "@/lib/adapterMemoryGuard";
import { adapterJsonError, adapterRouteGate, NO_STORE, readJsonObject } from "@/lib/adapterRouteGate";
import { clientRpc, recordClientAudit } from "@/lib/clientDataPlane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_NOTE_CHARS = 2_000;

const fail = (code: PromotionErrorCode) => adapterJsonError(code, PROMOTION_HTTP_STATUS[code]);

// Approve or reject one promotion. The reviewer is whoever is signed in: no field in the body can name another person.
// The database refuses the requester, plain members, other tenants, a wrong content hash, a blocked scan, a flagged or
// sensitive-labelled note without a written reason of at least 20 characters, an approval with no label, and a
// promotion that is already decided. The reviewer chooses the label ("ordinary" or "sensitive") when approving; a note
// that must never be shared is rejected. A rejection takes no label.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await adapterRouteGate("adapter-promotion-decide", 30);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const body = await readJsonObject(request, MAX_BODY_BYTES);
  if (!body || !UUID.test(id)) return fail("invalid_input");
  const { decision, expectedContentSha256, note, sensitivity } = body;
  if (decision !== "approve" && decision !== "reject") return fail("invalid_input");
  if (decision === "approve" && sensitivity !== "ordinary" && sensitivity !== "sensitive") return fail("sensitivity_required");
  if (decision === "reject" && sensitivity !== undefined && sensitivity !== null) return fail("invalid_input");
  if (decision === "approve" && (typeof expectedContentSha256 !== "string" || !SHA256.test(expectedContentSha256))) return fail("invalid_input");
  if (note !== undefined && note !== null && (typeof note !== "string" || note.length > MAX_NOTE_CHARS)) return fail("invalid_input");

  const result = await clientRpc("client_adapter_decide_promotion", {
    p_promotion_id: id,
    p_decision: decision,
    p_expected_content_sha256: decision === "approve" ? expectedContentSha256 : null,
    p_note: typeof note === "string" && note.length > 0 ? note : null,
    p_sensitivity: decision === "approve" ? sensitivity : null,
  });
  if (!result.ok || (result.value !== "approved" && result.value !== "rejected")) return fail(promotionErrorFrom(result));
  await recordClientAudit(`tenant.adapter.promotion_${result.value}`);
  return NextResponse.json({ ok: true, status: result.value }, { headers: NO_STORE });
}
