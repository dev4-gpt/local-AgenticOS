import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

// The "Spend check" counts on the Adapters page (ADR-016): pure parsing plus the read-only route. No real data: every
// value below is made up inside this test.
const savedEnv = { ...process.env };
test.afterEach(() => { process.env = { ...savedEnv }; });

const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const lib = loadReviewModule("src/lib/adapterSpendReconcile.ts", { "./adapterContracts": contracts });

const row = (adapter_id: unknown, status: unknown, task_count: unknown) => ({ adapter_id, status, task_count });

test("parses valid rows and groups them per adapter in a fixed order, flagging only the disagreements", () => {
  const rows = lib.parseSpendRows([
    row("forge", "matched", 5),
    row("forge", "unreserved", 2),
    row("forge", "open", 1),
    row("creator-os", "settled_differs", 1),
    row("creator-os", "over_reserved", 3),
    row("creator-os", "unreserved", 4),
  ]);
  expect(rows).toHaveLength(6);
  const groups = lib.buildSpendGroups(rows);
  expect(groups.map((g: { adapterId: string }) => g.adapterId)).toEqual(["creator-os", "forge"]);
  expect(groups[0].lines.map((l: { status: string }) => l.status)).toEqual(["unreserved", "over_reserved", "settled_differs"]);
  expect(groups[0]).toMatchObject({ flagged: 8, total: 8 });
  expect(groups[1].lines.map((l: { status: string; label: string; count: number }) => [l.status, l.label, l.count])).toEqual([
    ["unreserved", "Spent without a reservation", 2],
    ["open", "Reservation still open", 1],
    ["matched", "Agrees with the ledger", 5],
  ]);
  expect(groups[1]).toMatchObject({ flagged: 2, total: 8 }); // open and matched are not disagreements
});

test("the same adapter and status twice adds up, and an empty answer is a valid, empty panel", () => {
  const groups = lib.buildSpendGroups(lib.parseSpendRows([row("forge", "matched", 2), row("forge", "matched", 3)]));
  expect(groups).toHaveLength(1);
  expect(groups[0].lines).toEqual([{ status: "matched", label: "Agrees with the ledger", count: 5 }]);
  expect(lib.parseSpendRows([])).toEqual([]);
  expect(lib.buildSpendGroups([])).toEqual([]);
});

test("rejects anything that does not look right instead of showing it", () => {
  for (const bad of [
    "nope",
    null,
    [null],
    ["forge"],
    [row("forge", "matched", 0)],
    [row("forge", "matched", -1)],
    [row("forge", "matched", 1.5)],
    [row("forge", "matched", "3")],
    [row("forge", "matched", Number.NaN)],
    [row("forge", "approved", 1)],
    [row("forge", "__proto__", 1)],
    [row("forge", "toString", 1)],
    [row("Forge!", "matched", 1)],
    [row(null, "matched", 1)],
    [row(undefined, "matched", 1)],
    Array.from({ length: 101 }, () => row("forge", "matched", 1)),
  ]) {
    expect(lib.parseSpendRows(bad), JSON.stringify(bad)).toBeNull();
  }
  expect(lib.parseSpendRows(Array.from({ length: 100 }, () => row("forge", "matched", 1)))).toHaveLength(100);
});

function load(rpc: { ok: boolean; status: number; value: unknown }, opts: { member?: boolean; user?: boolean; allowed?: boolean; limitOk?: boolean } = {}) {
  const calls: [string, Record<string, unknown>][] = [];
  const mocks = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => (opts.user === false ? null : { id: "u1" }), currentClientMember: async () => opts.member ?? true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: opts.limitOk ?? true, allowed: opts.allowed ?? true }),
      clientRpc: async (n: string, b: Record<string, unknown>) => { calls.push([n, b]); return rpc; },
    },
    "@/lib/adapterSpendReconcile": lib,
  };
  return { route: loadReviewModule("src/app/api/client-runtime/adapter-spend/route.ts", mocks), calls };
}
const on = () => { process.env.ADAPTER_HOST_ENABLED = "true"; process.env.CLIENT_SLUG = "tenant-a"; };

test("the route returns grouped counts for the server's own tenant only, and never caches", async () => {
  on();
  const { route, calls } = load({ ok: true, status: 200, value: [row("forge", "unreserved", 2), row("forge", "matched", 1)] });
  const res = await route.GET(new Request("http://localhost/x?tenant_slug=tenant-b"));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(await res.json()).toMatchObject({ ok: true, windowDays: 28, groups: [{ adapterId: "forge", flagged: 2, total: 3 }] });
  expect(calls).toEqual([["client_adapter_budget_reconcile_counts", { p_tenant_slug: "tenant-a" }]]); // the tenant is the server's, not the request's
});

test("the route refuses when off, signed out, not a member, rate limited or misconfigured, and never echoes database errors", async () => {
  delete process.env.ADAPTER_HOST_ENABLED;
  process.env.CLIENT_SLUG = "tenant-a";
  const fine = { ok: true, status: 200, value: [] };
  expect((await load(fine).route.GET()).status).toBe(403);
  on();
  expect((await load(fine, { user: false }).route.GET()).status).toBe(401);
  expect((await load(fine, { member: false }).route.GET()).status).toBe(401);
  expect((await load(fine, { limitOk: false }).route.GET()).status).toBe(503);
  expect((await load(fine, { allowed: false }).route.GET()).status).toBe(429);
  delete process.env.CLIENT_SLUG;
  expect((await load(fine).route.GET()).status).toBe(503);
  on();
  const failed = await load({ ok: false, status: 500, value: "relation secret_table does not exist" }).route.GET();
  expect(failed.status).toBe(502);
  const failedBody = await failed.json();
  expect(failedBody.error).toBe("spend_read_failed"); // a failed read is reported as a failed read, not as bad data
  expect(JSON.stringify(failedBody)).not.toContain("secret_table");
  const invalid = await load({ ok: true, status: 200, value: [row("forge", "approved", 1)] }).route.GET();
  expect(invalid.status).toBe(502);
  expect((await invalid.json()).error).toBe("spend_read_invalid");
});
