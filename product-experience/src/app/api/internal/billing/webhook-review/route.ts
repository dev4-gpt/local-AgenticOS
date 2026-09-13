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
 * Records a human-reviewed disposition for an already received, unknown
 * public-launch refund. It cannot acknowledge Stripe delivery, alter a wallet,
 * or mutate a managed-credit plan. Stripe must redeliver the signed event after
 * this record exists; the webhook then verifies the event hash before it can
 * classify the event as public-launch.
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
  if (!eventId || eventType !== "charge.refunded" || !/^[0-9a-f]{64}$/.test(payloadHash) || !reviewedBy || !reason) {
    return NextResponse.json({ ok: false, error: "invalid_review_disposition" }, { status: 400 });
  }

  const event = await supabaseServiceSelect("stripe_webhook_events", { event_id: `eq.${eventId}`, select: "event_id,event_type,payload_hash,status,financial_scope,error_code" });
  const stored = event.rows[0];
  if (!event.ok || !stored) return NextResponse.json({ ok: false, error: "webhook_event_not_found" }, { status: event.ok ? 404 : 502 });
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
