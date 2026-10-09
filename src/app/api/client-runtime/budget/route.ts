import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, selectClientRecords } from "@/lib/clientDataPlane";
import { microsToUsageCredits } from "@/lib/usageCredits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEDGER_PAGE_SIZE = 1000;
const LEDGER_MAX_ROWS = 10000;

// A deliberately light endpoint. The observability route already summarises
// spend, but it also reads audit events, jobs and artifacts, which is far too
// much work for a meter that every spending surface shows on load.
//
// The cap is returned alongside the spend because a number without its ceiling
// cannot be read: "$0.34" means nothing until you know whether the month's
// limit is one dollar or fifty.

export async function GET() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return fail("not_authenticated", 401);
  const rate = await checkClientRuntimeRateLimit("budget-read", 120, 900);
  if (!rate.ok) return fail("runtime_limit_unavailable", 503);
  if (!rate.allowed) return fail("runtime_rate_limited", 429);

  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return fail("tenant_not_configured", 503);

  const capDollars = Number(process.env.CLIENT_BUDGET_CAP ?? 0);
  const warningThreshold = Number(process.env.CLIENT_BUDGET_WARNING_THRESHOLD ?? 0.8);
  const capMicros = Number.isFinite(capDollars) && capDollars > 0 ? Math.round(capDollars * 1_000_000) : 0;

  // The ledger is the same source the reservation check uses, so the meter and
  // the guard cannot disagree about how much has been spent.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const ledger = await readMonthlyLedger(tenantSlug, monthStart.toISOString());
  if (!ledger.ok) return fail("budget_read_failed", 502);
  if (ledger.records.some((record) => record.tenant_slug !== tenantSlug)) return fail("budget_scope_mismatch", 502);

  const byProvider: Record<string, number> = {};
  let spentMicros = 0;
  for (const record of ledger.records) {
    const amount = record.amount_micros;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) return fail("budget_read_invalid", 502);
    const provider = typeof record.provider === "string" && record.provider ? record.provider : "unknown";
    byProvider[provider] = (byProvider[provider] ?? 0) + amount;
    spentMicros += amount;
  }
  if (!Number.isSafeInteger(spentMicros)) return fail("budget_read_invalid", 502);

  const usedFraction = capMicros > 0 ? Math.min(1, spentMicros / capMicros) : 0;
  const byProviderCredits = Object.fromEntries(Object.entries(byProvider).map(([provider, micros]) => [provider, microsToUsageCredits(micros)]));
  return NextResponse.json({
    ok: true,
    capMicros,
    spentMicros,
    remainingMicros: Math.max(0, capMicros - spentMicros),
    capCredits: microsToUsageCredits(capMicros),
    spentCredits: microsToUsageCredits(spentMicros),
    remainingCredits: microsToUsageCredits(Math.max(0, capMicros - spentMicros)),
    usedFraction,
    // Stated rather than inferred client-side, so the warning appears at the
    // same point the runtime itself starts warning.
    warning: capMicros > 0 && usedFraction >= (Number.isFinite(warningThreshold) ? warningThreshold : 0.8),
    exhausted: capMicros > 0 && spentMicros >= capMicros,
    // The keys are the client's own, so spend is shown per provider: this is
    // their bill, not an abstract quota.
    byProvider,
    byProviderCredits,
    periodStart: monthStart.toISOString(),
  }, { headers: { "cache-control": "private, no-store" } });
}

async function readMonthlyLedger(tenantSlug: string, monthStart: string) {
  const records: Record<string, unknown>[] = [];
  let beforeId: string | null = null;
  for (let page = 0; page <= LEDGER_MAX_ROWS / LEDGER_PAGE_SIZE; page++) {
    const result = await selectClientRecords("client_runtime_budget_ledger", {
      tenant_slug: `eq.${tenantSlug}`,
      created_at: `gte.${monthStart}`,
      order: "id.desc",
      limit: String(LEDGER_PAGE_SIZE),
      ...(beforeId ? { id: `lt.${beforeId}` } : {}),
    });
    if (!result.ok || records.length + result.records.length > LEDGER_MAX_ROWS) return { ok: false, records: [] as Record<string, unknown>[] };
    records.push(...result.records);
    if (result.records.length < LEDGER_PAGE_SIZE) return { ok: true, records };
    const lastId = result.records.at(-1)?.id;
    if (!/^[1-9]\d*$/.test(String(lastId)) || String(lastId) === beforeId) return { ok: false, records: [] as Record<string, unknown>[] };
    beforeId = String(lastId);
  }
  return { ok: false, records: [] as Record<string, unknown>[] };
}

function fail(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store" } });
}
