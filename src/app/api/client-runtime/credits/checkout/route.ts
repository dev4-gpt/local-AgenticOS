import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc } from "@/lib/clientDataPlane";
import { publicCatalogEntryById } from "@/lib/publicProviderCatalog";

export const runtime = "nodejs";

function usdCents(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "";
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 100 ? cents : null;
}

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  const limit = await checkClientRuntimeRateLimit("credits-checkout", 5, 3600);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429 });
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "managed_credits_not_configured" }, { status: 503 });
  const requestBody = await request.json().catch(() => ({})) as { quantity?: unknown };
  const appUrl = (process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud").replace(/\/$/, "");
  const allocations = Array.isArray((requestBody as { allocations?: unknown }).allocations) ? (requestBody as { allocations: unknown[] }).allocations : null;
  if (allocations) {
    const normalized = allocations.slice(0, 100).map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const value = item as Record<string, unknown>;
      const catalogId = typeof value.catalogId === "string" ? value.catalogId.trim() : "";
      const entry = publicCatalogEntryById(catalogId);
      const cents = usdCents(value.amount);
      if (!entry || entry.kind !== "provider" || !entry.credentialKey || entry.selectionAllowed === false || cents === null) return null;
      return { catalog_id: entry.id, provider_key: entry.credentialKey, provider_name: entry.name, amount_micros: cents * 10000, pricing_snapshot_id: entry.pricingSnapshotId || "" };
    });
    if (!allocations.length || normalized.some((item) => !item) || new Set(normalized.filter(Boolean).map((item) => item!.catalog_id)).size !== normalized.length) {
      return NextResponse.json({ ok: false, error: "invalid_credit_allocations" }, { status: 400 });
    }
    const validAllocations = normalized.filter((item): item is NonNullable<typeof item> => Boolean(item));
    const totalMicros = validAllocations.reduce((sum, item) => sum + item.amount_micros, 0);
    if (!Number.isSafeInteger(totalMicros) || totalMicros <= 0) return NextResponse.json({ ok: false, error: "invalid_credit_allocations" }, { status: 400 });
    const plan = await clientRpc("create_client_credit_purchase_plan", { p_tenant_slug: process.env.CLIENT_SLUG || "", p_allocations: validAllocations, p_total_micros: totalMicros });
    const planId = typeof plan.value === "string" ? plan.value : null;
    if (!plan.ok || !planId) return NextResponse.json({ ok: false, error: "credit_plan_failed" }, { status: 502 });
    const params = new URLSearchParams({ mode: "payment", customer_email: user.email || "", success_url: `${appUrl}/credentials?purchase=success`, cancel_url: `${appUrl}/credentials?purchase=cancelled`, "metadata[tenant_slug]": process.env.CLIENT_SLUG || "", "metadata[credit_plan_id]": planId, "metadata[product]": "veloce-managed-credits-plan" });
    validAllocations.forEach((item, index) => {
      params.set(`line_items[${index}][price_data][currency]`, "usd");
      params.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(item.amount_micros / 10000)));
      params.set(`line_items[${index}][price_data][product_data][name]`, `Veloce credits · ${item.provider_name}`);
      params.set(`line_items[${index}][price_data][product_data][description]`, "Prepaid managed execution budget; provider activation remains approval-controlled.");
      params.set(`line_items[${index}][quantity]`, "1");
    });
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params, cache: "no-store" }).catch(() => null);
    const responseBody = await response?.json().catch(() => null) as { id?: unknown; url?: unknown } | null;
    if (!response?.ok || typeof responseBody?.url !== "string") return NextResponse.json({ ok: false, error: "checkout_create_failed" }, { status: 502 });
    return NextResponse.json({ ok: true, checkoutUrl: responseBody.url, planId });
  }
  const price = process.env.STRIPE_CREDIT_PRICE_ID?.trim();
  const quantity = typeof requestBody.quantity === "number" ? requestBody.quantity : Number(requestBody.quantity ?? 1);
  if (!price || !Number.isSafeInteger(quantity) || quantity < 1) {
    return NextResponse.json({ ok: false, error: !price ? "managed_credits_not_configured" : "invalid_credit_quantity" }, { status: 400 });
  }
  const params = new URLSearchParams({ mode: "payment", customer_email: user.email || "", success_url: `${appUrl}/credentials?purchase=success`, cancel_url: `${appUrl}/credentials?purchase=cancelled`, "line_items[0][price]": price, "line_items[0][quantity]": String(quantity), "metadata[tenant_slug]": process.env.CLIENT_SLUG || "", "metadata[quantity]": String(quantity), "metadata[product]": "veloce-managed-credits" });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params, cache: "no-store" }).catch(() => null);
  const responseBody = await response?.json().catch(() => null) as { url?: unknown } | null;
  if (!response?.ok || typeof responseBody?.url !== "string") return NextResponse.json({ ok: false, error: "checkout_create_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, checkoutUrl: responseBody.url });
}
