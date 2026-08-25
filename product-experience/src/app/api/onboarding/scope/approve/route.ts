import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { recommendCommercialScope } from "@/lib/commercialScope";
import { supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim();
  const provided = request.headers.get("x-control-plane-secret")?.trim() || "";
  if (!expected || !provided) return false;
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(provided)); } catch { return false; }
}

function quoteAmount(value: unknown, minimum: number) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= minimum && amount <= 1_000_000 ? Math.round(amount) : null;
}

function quoteLineItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  if (value.length > 20) return null;
  const items = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const name = typeof source.name === "string" ? source.name.trim().slice(0, 160) : "";
    const amountUsd = quoteAmount(source.amountUsd, 1);
    if (!name || amountUsd === null || /provider|credit|wallet/i.test(name)) return [];
    return [{ name, amountUsd, recurring: source.recurring === true }];
  });
  return items.length === value.length ? items : null;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { requestId?: unknown; approvedBy?: unknown; quote?: unknown };
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!requestId) return NextResponse.json({ ok: false, error: "missing_request_id" }, { status: 400 });

  const onboarding = await supabaseServiceSelect("client_onboarding_accounts", { request_id: `eq.${requestId}` });
  const account = onboarding.rows[0];
  if (!onboarding.ok || typeof account?.id !== "string") return NextResponse.json({ ok: false, error: "onboarding_not_found" }, { status: 404 });
  if (["offboarding", "offboarded", "suspended"].includes(String(account.status))) return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 409 });

  const inputs = account.commercial_scope_inputs && typeof account.commercial_scope_inputs === "object" && !Array.isArray(account.commercial_scope_inputs)
    ? account.commercial_scope_inputs as Record<string, unknown>
    : {};
  const recommendation = recommendCommercialScope(inputs);
  const quoteSource = body.quote && typeof body.quote === "object" && !Array.isArray(body.quote) ? body.quote as Record<string, unknown> : {};
  const lineItems = quoteLineItems(quoteSource.lineItems);
  if (lineItems === null) return NextResponse.json({ ok: false, error: "invalid_commercial_quote_line_items" }, { status: 400 });
  const quote = {
    currency: "usd",
    setupUsd: quoteAmount(quoteSource.setupUsd, 2_500) ?? recommendation.setupRangeUsd.min,
    monthlyUsd: quoteAmount(quoteSource.monthlyUsd, 1_250) ?? recommendation.monthlyRangeUsd.min,
    lineItems,
    providerCreditsIncluded: false,
    approvedBy: typeof body.approvedBy === "string" ? body.approvedBy.trim().slice(0, 160) || "operator" : "operator",
    approvedAt: new Date().toISOString(),
  };
  const updated = await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${account.id}` }, {
    commercial_scope_status: "approved",
    commercial_scope_recommendation: recommendation,
    commercial_scope_quote: quote,
    commercial_scope_approved_by: quote.approvedBy,
    commercial_scope_approved_at: quote.approvedAt,
    updated_at: quote.approvedAt,
  });
  if (!updated.ok) return NextResponse.json({ ok: false, error: "commercial_scope_approval_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, requestId, onboardingId: account.id, status: "approved", recommendation, quote });
}
