import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServiceInsert, supabaseServiceSelect } from "@/lib/publicLaunch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";
  const provided = request.headers.get("x-control-plane-secret")?.trim() || "";
  if (!expected || !provided) return false;
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(provided)); } catch { return false; }
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length <= max ? value.trim() : "";
}

/**
 * Records a human-reviewed disposition for a previously received Stripe event.
 * Managed-credit late-refund review is audit-only: it cannot change a wallet or
 * plan, and the webhook delivery was already acknowledged after queueing review.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const parsed: unknown = await request.json().catch(() => null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ ok: false, error: "invalid_review_disposition" }, { status: 400 });
  const body = parsed as Record<string, unknown>;
  const eventId = text(body.eventId, 255);
  const eventType = text(body.eventType, 128);
  const payloadHash = text(body.payloadHash, 64).toLowerCase();
  const reviewedBy = text(body.reviewedBy, 320);
  const reason = text(body.reason, 2_000);
  const supportedEvent = eventType === "charge.refunded" || eventType === "charge.dispute.created";
  if (!eventId || !supportedEvent || !/^[0-9a-f]{64}$/.test(payloadHash) || !reviewedBy || !reason) {
    return NextResponse.json({ ok: false, error: "invalid_review_disposition" }, { status: 400 });
  }

  const event = await supabaseServiceSelect("stripe_webhook_events", { event_id: `eq.${eventId}`, select: "event_id,event_type,payload_hash,status,financial_scope,error_code" });
  const stored = event.rows[0];
  if (!event.ok || !stored) return NextResponse.json({ ok: false, error: "webhook_event_not_found" }, { status: event.ok ? 404 : 502 });

  if (stored.event_type === eventType && stored.payload_hash === payloadHash
    && stored.status === "processed" && stored.financial_scope === "managed_credit"
    && stored.error_code === "managed_credit_manual_review_required") {
    const prior = await supabaseServiceSelect("stripe_financial_event_dispositions", { event_id: `eq.${eventId}` });
    if (!prior.ok) return NextResponse.json({ ok: false, error: "review_disposition_lookup_failed" }, { status: 502 });
    const queued = prior.rows.some((row) => row.event_type === eventType && row.payload_hash === payloadHash
      && row.financial_scope === "managed_credit" && row.disposition === "review_required");
    if (!queued) return NextResponse.json({ ok: false, error: "managed_credit_review_not_queued" }, { status: 409 });
    const reviewed = prior.rows.find((row) => row.disposition === "managed_credit_lifecycle_reviewed");
    if (reviewed) {
      if (reviewed.event_type !== eventType || reviewed.payload_hash !== payloadHash || reviewed.financial_scope !== "managed_credit") {
        return NextResponse.json({ ok: false, error: "review_disposition_conflict" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, existing: true, disposition: "managed_credit_lifecycle_reviewed" });
    }
    const inserted = await supabaseServiceInsert("stripe_financial_event_dispositions", {
      event_id: eventId,
      event_type: eventType,
      payload_hash: payloadHash,
      financial_scope: "managed_credit",
      disposition: "managed_credit_lifecycle_reviewed",
      recorded_by: reviewedBy,
      reason,
    });
    if (!inserted.ok) return NextResponse.json({ ok: false, error: "review_disposition_record_failed" }, { status: 502 });
    return NextResponse.json({ ok: true, existing: false, disposition: "managed_credit_lifecycle_reviewed", walletAdjusted: false });
  }

  if (eventType !== "charge.refunded") return NextResponse.json({ ok: false, error: "webhook_event_not_reviewable" }, { status: 409 });
  if (stored.event_type !== eventType || stored.payload_hash !== payloadHash || stored.status !== "failed" || stored.financial_scope === "managed_credit") {
    return NextResponse.json({ ok: false, error: "webhook_event_not_reviewable" }, { status: 409 });
  }

  const prior = await supabaseServiceSelect("stripe_financial_event_dispositions", { event_id: `eq.${eventId}`, disposition: "eq.public_launch_refund_reviewed" });
  if (!prior.ok) return NextResponse.json({ ok: false, error: "review_disposition_lookup_failed" }, { status: 502 });
  if (prior.rows.length) {
    const row = prior.rows[0];
    if (row.event_type !== eventType || row.payload_hash !== payloadHash || row.financial_scope !== "public_launch") {
      return NextResponse.json({ ok: false, error: "review_disposition_conflict" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, existing: true, disposition: "public_launch_refund_reviewed" });
  }

  const inserted = await supabaseServiceInsert("stripe_financial_event_dispositions", {
    event_id: eventId,
    event_type: eventType,
    payload_hash: payloadHash,
    financial_scope: "public_launch",
    disposition: "public_launch_refund_reviewed",
    recorded_by: reviewedBy,
    reason,
  });
  if (!inserted.ok) return NextResponse.json({ ok: false, error: "review_disposition_record_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, existing: false, disposition: "public_launch_refund_reviewed" });
}
