import { NextResponse } from "next/server";
import { currentClientMember } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc } from "@/lib/clientDataPlane";
import { resolveManagedCreditReadiness } from "@/lib/managedCreditStatus";
import { publicCatalogEntryById } from "@/lib/publicProviderCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  const limit = await checkClientRuntimeRateLimit("credits-read", 60, 900);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429 });
  const result = await clientRpc("client_credit_account_snapshot", { p_tenant_slug: process.env.CLIENT_SLUG || "" });
  if (!result.ok || !result.value) return NextResponse.json({ ok: false, error: "credits_unavailable" }, { status: 503 });
  const budgets = await clientRpc("client_credit_budget_snapshot", { p_tenant_slug: process.env.CLIENT_SLUG || "" });
  const readiness = await clientRpc("client_credit_provider_readiness_snapshot", { p_tenant_slug: process.env.CLIENT_SLUG || "" });
  const readinessByCatalog = new Map(
    readiness.ok && Array.isArray(readiness.value)
      ? readiness.value.map((row) => [String((row as Record<string, unknown>).catalog_id), row as Record<string, unknown>])
      : [],
  );
  const creditBudgets = budgets.ok && Array.isArray(budgets.value)
    ? budgets.value.map((budget) => {
      const row = budget as Record<string, unknown>;
      const stored = typeof row.catalog_id === "string" ? readinessByCatalog.get(row.catalog_id) : undefined;
      const availableMicros = Number(row.available_micros) || 0;
      const budgetStatus = typeof row.status === "string" ? row.status : "active";
      const readiness = resolveManagedCreditReadiness({
        walletStatus: typeof result.value.status === "string" ? result.value.status : "active",
        budgetStatus,
        availableMicros,
        // The managed route is intentionally disabled until the provider
        // account, credential, reconciliation, and smoke gates are complete.
        managedRouteEnabled: false,
        manifestApproved: false,
        credentialReady: false,
        healthCheckPassed: false,
      });
      const catalogEntry = typeof row.catalog_id === "string" ? publicCatalogEntryById(row.catalog_id) : null;
      return {
        ...row,
        walletStatus: stored?.wallet_status || (availableMicros > 0 ? "wallet_funded" : "depleted"),
        providerStatus: stored?.provider_status || readiness.status,
        providerStatusLabel: stored?.provider_status === "ready_for_execution" ? "Ready for execution" : readiness.label,
        providerStatusReason: stored?.provider_status_reason || readiness.reason,
        providerUsable: stored?.provider_status === "ready_for_execution" || readiness.usable,
        providerName: catalogEntry?.name ?? row.provider_key ?? row.catalog_id ?? "Provider",
        managedRouteEnabled: stored?.managed_route_enabled === true,
      };
    })
    : [];
  return NextResponse.json({
    ok: true,
    account: result.value,
    creditBudgets,
    managedExecutionEnabled: false,
    stripeMode: process.env.STRIPE_MODE === "live" ? "live" : "test",
    checkoutConfigured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    creditPackConfigured: Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_CREDIT_PRICE_ID?.trim()),
  }, { headers: { "cache-control": "no-store" } });
}
