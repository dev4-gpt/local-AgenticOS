import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

// Item 6 (observability): the activity counts shown on the Adapters page. Pure parsing plus the read-only route.
// No real data: every value below is made up inside this test.
const savedEnv = { ...process.env };
test.afterEach(() => { process.env = { ...savedEnv }; });

const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const lib = loadReviewModule("src/lib/adapterActivity.ts", { "./adapterContracts": contracts });

const row = (adapter_id: string | null, event_type: string, event_count: number) => ({ adapter_id, event_type, event_count });

test("parses valid rows and groups them per adapter in a fixed order", () => {
  const rows = lib.parseActivityRows([
    row("forge", "budget.reserve", 2),
    row("forge", "approval.requested", 3),
    row("forge", "approval.executed", 1),
    row("creator-os", "memory.committed", 4),
    row(null, "task.requested", 1),
  ]);
  expect(rows).toHaveLength(5);
  const groups = lib.buildActivityGroups(rows);
  expect(groups.map((g: { adapterId: string | null }) => g.adapterId)).toEqual(["creator-os", "forge", null]);
  const forge = groups[1];
  expect(forge.lines.map((l: { eventType: string }) => l.eventType)).toEqual(["approval.requested", "approval.executed", "budget.reserve"]);
  expect(forge.total).toBe(6);
});

test("rejects anything that does not look right instead of showing it", () => {
  for (const bad of [
    "nope",
    [null],
    [row("forge", "approval.requested", 0)],
    [row("forge", "approval.requested", -1)],
    [row("forge", "approval.requested", 1.5)],
    [row("forge", "memory.read", 1)],
    [row("Forge!", "approval.requested", 1)],
    [row("forge", "__proto__", 1)],
    Array.from({ length: 401 }, () => row("forge", "approval.requested", 1)),
  ]) {
    expect(lib.parseActivityRows(bad)).toBeNull();
  }
  expect(lib.parseActivityRows([])).toEqual([]);
});

function load(rpc: { ok: boolean; status: number; value: unknown }, opts: { member?: boolean; allowed?: boolean } = {}) {
  const calls: [string, Record<string, unknown>][] = [];
  const mocks = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "u1" }), currentClientMember: async () => opts.member ?? true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: opts.allowed ?? true }),
      clientRpc: async (n: string, b: Record<string, unknown>) => { calls.push([n, b]); return rpc; },
    },
    "@/lib/adapterActivity": lib,
  };
  return { route: loadReviewModule("src/app/api/client-runtime/adapter-activity/route.ts", mocks), calls };
}
const on = () => { process.env.ADAPTER_HOST_ENABLED = "true"; process.env.CLIENT_SLUG = "tenant-a"; };

test("the route returns grouped counts for the server's own tenant only", async () => {
  on();
  const { route, calls } = load({ ok: true, status: 200, value: [row("forge", "approval.requested", 2)] });
  const res = await route.GET(new Request("http://localhost/x?tenant_slug=tenant-b"));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.json();
  expect(body).toMatchObject({ ok: true, windowDays: 28, groups: [{ adapterId: "forge", total: 2 }] });
  expect(calls).toEqual([["client_adapter_activity_counts", { p_tenant_slug: "tenant-a" }]]);
});

test("the route refuses when off, signed out, rate limited or misconfigured, and never echoes database errors", async () => {
  delete process.env.ADAPTER_HOST_ENABLED;
  process.env.CLIENT_SLUG = "tenant-a";
  expect((await load({ ok: true, status: 200, value: [] }).route.GET()).status).toBe(403);
  on();
  expect((await load({ ok: true, status: 200, value: [] }, { member: false }).route.GET()).status).toBe(401);
  expect((await load({ ok: true, status: 200, value: [] }, { allowed: false }).route.GET()).status).toBe(429);
  delete process.env.CLIENT_SLUG;
  expect((await load({ ok: true, status: 200, value: [] }).route.GET()).status).toBe(503);
  on();
  const failed = await load({ ok: false, status: 500, value: "relation secret_table does not exist" }).route.GET();
  expect(failed.status).toBe(502);
  expect(JSON.stringify(await failed.json())).not.toContain("secret_table");
  const invalid = await load({ ok: true, status: 200, value: [row("forge", "memory.read", 1)] }).route.GET();
  expect(invalid.status).toBe(502);
  expect((await invalid.json()).error).toBe("activity_read_invalid");
});
