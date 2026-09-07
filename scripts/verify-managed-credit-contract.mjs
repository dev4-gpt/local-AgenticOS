import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");
const checks = [
  ["src/app/api/client-runtime/credits/route.ts", ["providerStatus", "providerUsable", "managedExecutionEnabled: false", "stripeMode"]],
  ["src/app/api/client-runtime/credits/checkout/route.ts", ["managed_payments[enabled]", "metadata[stripe_mode]"]],
  ["product-experience/supabase-v32-managed-credit-readiness.sql", ["credential_reference", "reconciliation_status", "client_credit_provider_readiness_snapshot", "managed_route_enabled"]],
  ["product-experience/supabase-v34-managed-credit-execution-claims.sql", ["client_credit_execution_claims", "claim_client_credit_reservation", "references public.client_pricing_snapshots(id)", "reservation_row.status <> 'reserved'", "reservation_row.pricing_snapshot_id is null", "on conflict do nothing"]],
  ["product-experience/src/lib/managedProviderPricing.ts", ["openrouter-managed-v1", "managed_pricing_snapshot_prices_mismatch", "managed_pricing_snapshot_stale"]],
  ["product-experience/src/app/api/internal/managed-provider/openrouter/route.ts", ["client_provider_connections", "client_pricing_snapshots", "OPENROUTER_MANAGED_CONNECTION_MAX_AGE_HOURS", "last_validated_at", "claim_client_credit_reservation", "managed_provider_reservation_claim_failed", "managed_provider_reservation_insufficient"]],
  ["src/lib/managedProviderAdapter.ts", ["quote", "healthCheck", "reserve", "execute", "settle", "refund", "balance", "disable"]],
  ["docs/production-readiness-matrix.md", ["101-repository", "53 repositories", "wallet_funded", "ready_for_execution"]],
];

for (const [file, needles] of checks) {
  const content = read(file);
  for (const needle of needles) {
    if (!content.includes(needle)) throw new Error(`${file} is missing ${needle}`);
  }
  if (/SUPABASE_(ANON|SERVICE_ROLE)_KEY\s*[:=]/i.test(content)) throw new Error(`${file} contains a Supabase key assignment`);
}

console.log("Managed-credit production contract passed.");
