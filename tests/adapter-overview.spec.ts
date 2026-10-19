import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

const savedEnv = { ...process.env };
test.afterEach(() => { process.env = { ...savedEnv }; });

const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const overview = loadReviewModule("src/lib/adapterOverview.ts", { "./adapterContracts": contracts });

const row = (extra: Record<string, unknown> = {}) => ({
  adapter_id: "forge", display_name: "Forge", state: "enabled", side_effect_ceiling: "publish", deletion_guarantee: "none",
  budget_cap_micros: 1000, budget_period: "month", spent_period_micros: 250, spent_month_micros: 250, open_reservations: 1, ...extra,
});

test("good rows become cards with plain labels and the right cap status", () => {
  const rows = overview.parseSummaryRows([row(), row({ adapter_id: "knowledge", display_name: "Knowledge", budget_cap_micros: null, budget_period: null, deletion_guarantee: "host-owned", side_effect_ceiling: "read", state: "disabled" })]);
  expect(rows).toHaveLength(2);
  const cards = overview.buildAdapterCards(rows);
  expect(cards[0]).toMatchObject({ adapterId: "forge", capStatus: "ok", usedFraction: 0.25, stateLabel: "Enabled" });
  expect(cards[0].deletionLabel).toMatch(/Outside the deletion guarantee/);
  expect(cards[0].riskLabel).toMatch(/two-person approval/);
  expect(cards[1]).toMatchObject({ capStatus: "no-cap", usedFraction: null, stateLabel: "Disabled" });
  expect(cards[1].deletionLabel).toMatch(/Veloce can erase/);
});

test("cap status moves to warning at 80% and exhausted at 100%, and a zero cap is exhausted", () => {
  expect(overview.capStatusOf(799, 1000).status).toBe("ok");
  expect(overview.capStatusOf(800, 1000).status).toBe("warning");
  expect(overview.capStatusOf(999, 1000).status).toBe("warning");
  expect(overview.capStatusOf(1000, 1000).status).toBe("exhausted");
  expect(overview.capStatusOf(5000, 1000).status).toBe("exhausted");
  expect(overview.capStatusOf(0, 0).status).toBe("exhausted");
  expect(overview.capStatusOf(10, null)).toEqual({ fraction: null, status: "no-cap" });
});

test("rows that do not look right are rejected instead of shown", () => {
  const bad: unknown[] = [
    "nope", { x: 1 }, [null], [row({ adapter_id: "BAD" })], [row({ display_name: "" })], [row({ state: "on" })],
    [row({ side_effect_ceiling: "wild" })], [row({ deletion_guarantee: "maybe" })], [row({ budget_cap_micros: -1 })],
    [row({ budget_cap_micros: 1.5 })], [row({ budget_cap_micros: 100, budget_period: null })], [row({ budget_cap_micros: null, budget_period: "month" })],
    [row({ budget_period: "week" })], [row({ spent_period_micros: -5 })], [row({ spent_month_micros: "9" })], [row({ open_reservations: -1 })],
    [row({ spent_month_micros: Number.MAX_SAFE_INTEGER + 2 })], Array.from({ length: 201 }, () => row()),
  ];
  for (const value of bad) expect(overview.parseSummaryRows(value), JSON.stringify(value).slice(0, 80)).toBeNull();
  expect(overview.parseSummaryRows([])).toEqual([]);
});

test("the budget breakdown adds up: adapters plus other spending equal the tenant total", () => {
  const rows = overview.parseSummaryRows([
    row({ spent_month_micros: 300 }), row({ adapter_id: "knowledge", display_name: "Knowledge", spent_month_micros: 100, budget_cap_micros: null, budget_period: null }),
    row({ adapter_id: "creator-os", display_name: "Creator OS", state: "disabled", spent_month_micros: 0 }),
  ]);
  const result = overview.buildBudgetBreakdown(overview.buildAdapterCards(rows), { capMicros: 10_000, spentMicros: 1000 });
  expect(result.adapterTotalMicros).toBe(400);
  expect(result.otherMicros).toBe(600);
  expect(result.adapterTotalMicros + result.otherMicros).toBe(1000);
  expect(result.reconciles).toBe(true);
  expect(result.adapters.map((a: { adapterId: string }) => a.adapterId)).toEqual(["forge", "knowledge"]); // disabled with no spend is left out
  expect(result.adapters[0].shareOfTenantSpend).toBeCloseTo(0.3);
});

test("the breakdown flags a disagreement instead of hiding it, and refuses bad inputs", () => {
  const cards = overview.buildAdapterCards(overview.parseSummaryRows([row({ spent_month_micros: 900 })]));
  const result = overview.buildBudgetBreakdown(cards, { capMicros: 10_000, spentMicros: 500 });
  expect(result.reconciles).toBe(false);
  expect(result.otherMicros).toBe(0);
  expect(overview.buildBudgetBreakdown(cards, { capMicros: -1, spentMicros: 5 })).toBeNull();
  expect(overview.buildBudgetBreakdown(cards, { capMicros: 1, spentMicros: 0.5 })).toBeNull();
  expect(overview.buildBudgetBreakdown([{ adapterId: "x" }], { capMicros: 1, spentMicros: 1 })).toBeNull();
  expect(overview.buildBudgetBreakdown("nope", { capMicros: 1, spentMicros: 1 })).toBeNull();
  expect(overview.buildBudgetBreakdown([], { capMicros: 0, spentMicros: 0 }).otherMicros).toBe(0);
});

test("money formatting never shows a small spend as free", () => {
  expect(overview.formatMicrosUsd(0)).toBe("$0.00");
  expect(overview.formatMicrosUsd(5_000)).toBe("<$0.01");
  expect(overview.formatMicrosUsd(10_000)).toBe("$0.01");
  expect(overview.formatMicrosUsd(1_234_567)).toBe("$1.23");
});

function loadRoute(opts: { authenticated?: boolean; limited?: boolean; rpc?: { ok: boolean; status: number; value: unknown } } = {}) {
  const calls: [string, Record<string, unknown>][] = [];
  const route = loadReviewModule("src/app/api/client-runtime/adapters/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => opts.authenticated === false ? null : { id: "u1" }, currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: !opts.limited }),
      clientRpc: async (n: string, b: Record<string, unknown>) => { calls.push([n, b]); return opts.rpc ?? { ok: true, status: 200, value: [row()] }; },
    },
    "@/lib/adapterOverview": overview,
  });
  return { route, calls };
}

test("the route is closed without sign-in, without the flag, over the rate limit, or without a tenant", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  process.env.ADAPTER_HOST_ENABLED = "true";
  expect((await loadRoute({ authenticated: false }).route.GET()).status).toBe(401);
  expect((await loadRoute({ limited: true }).route.GET()).status).toBe(429);
  delete process.env.ADAPTER_HOST_ENABLED;
  const off = await loadRoute().route.GET();
  expect(off.status).toBe(403);
  expect(await off.json()).toEqual({ ok: false, error: "adapter_host_disabled" });
  process.env.ADAPTER_HOST_ENABLED = "true";
  delete process.env.CLIENT_SLUG;
  expect((await loadRoute().route.GET()).status).toBe(503);
});

test("the route reads only its own tenant and returns validated cards, never raw rows", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  process.env.ADAPTER_HOST_ENABLED = "true";
  const { route, calls } = loadRoute();
  const res = await route.GET();
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.json();
  expect(body.adapters[0]).toMatchObject({ adapterId: "forge", capStatus: "ok", stateLabel: "Enabled" });
  expect(calls).toEqual([["client_adapter_budget_summary", { p_tenant_slug: "tenant-a" }]]);
});

test("a failed or malformed database answer is an error, not a screen of guesses", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  process.env.ADAPTER_HOST_ENABLED = "true";
  expect((await loadRoute({ rpc: { ok: false, status: 500, value: null } }).route.GET()).status).toBe(502);
  const invalid = await loadRoute({ rpc: { ok: true, status: 200, value: [row({ spent_month_micros: -1 })] } }).route.GET();
  expect(invalid.status).toBe(502);
  expect(await invalid.json()).toEqual({ ok: false, error: "adapters_read_invalid" });
});
