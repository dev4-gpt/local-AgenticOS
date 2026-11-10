import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

// The sync switch route and its library (ADR-019). The sign-in, the rate limit and the database are stand-ins.
const savedEnv = { ...process.env };
test.afterEach(() => { process.env = { ...savedEnv }; });

const lib = loadReviewModule("src/lib/adapterSyncSwitch.ts", {});
const NOW = "2026-10-26T10:00:00.000Z";
const off = { mode: "off", on_until: null, always_on_allowed: false, sync_now_pending: false, now: NOW };
const timed = { mode: "timed", on_until: "2026-10-26T12:05:00.000Z", always_on_allowed: false, sync_now_pending: false, now: NOW };

interface Options {
  authenticated?: boolean; limited?: boolean; canChange?: boolean; registryFails?: boolean;
  registry?: Record<string, unknown>[];
  rpc?: (name: string, body: Record<string, unknown>) => { ok: boolean; status: number; value: unknown };
}

function load(opts: Options = {}) {
  const rpcCalls: [string, Record<string, unknown>][] = [];
  const audits: [string, Record<string, unknown>][] = [];
  const clientAuth = { currentClientUser: async () => (opts.authenticated === false ? null : { id: "u1" }), currentClientMember: async () => true, currentClientCredentialManager: async () => opts.canChange !== false };
  const dataPlane = {
    checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: !opts.limited }),
    clientRpc: async (name: string, body: Record<string, unknown>) => {
      rpcCalls.push([name, body]);
      return opts.rpc ? opts.rpc(name, body) : { ok: true, status: 200, value: name.endsWith("_status") ? off : name.endsWith("_set") ? "timed" : true };
    },
    recordClientAudit: async (event: string, metadata: Record<string, unknown> = {}) => { audits.push([event, metadata]); },
    selectClientRecords: async (table: string, filters: Record<string, string>) => {
      rpcCalls.push([`select:${table}`, filters]);
      if (opts.registryFails) return { ok: false, status: 500, records: [] };
      return { ok: true, status: 200, records: opts.registry ?? [{ adapter_id: "creator-os", state: "enabled" }] };
    },
  };
  const mocks = { "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }, "@/lib/clientAuth": clientAuth, "@/lib/clientDataPlane": dataPlane };
  const gate = loadReviewModule("src/lib/adapterRouteGate.ts", mocks);
  const route = loadReviewModule("src/app/api/client-runtime/adapter-sync-switch/route.ts", { ...mocks, "@/lib/adapterRouteGate": gate, "@/lib/adapterSyncSwitch": lib });
  return { route, rpcCalls, audits };
}
const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const on = () => { process.env.ADAPTER_HOST_ENABLED = "true"; process.env.CLIENT_SLUG = "tenant-a"; };

test("the route is closed without sign-in, without the host flag, over the rate limit, or without a tenant, and the database is never reached", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  delete process.env.ADAPTER_HOST_ENABLED;
  const flagOff = load();
  for (const call of [() => flagOff.route.GET(), () => flagOff.route.POST(post({ adapterId: "creator-os", action: "sync_now" }))]) expect((await call()).status).toBe(403);
  on();
  const anon = load({ authenticated: false });
  for (const call of [() => anon.route.GET(), () => anon.route.POST(post({ adapterId: "creator-os", action: "sync_now" }))]) expect((await call()).status).toBe(401);
  const limited = load({ limited: true });
  for (const call of [() => limited.route.GET(), () => limited.route.POST(post({ adapterId: "creator-os", action: "sync_now" }))]) expect((await call()).status).toBe(429);
  delete process.env.CLIENT_SLUG;
  const noTenant = load();
  for (const call of [() => noTenant.route.GET(), () => noTenant.route.POST(post({ adapterId: "creator-os", action: "sync_now" }))]) expect((await call()).status).toBe(503);
  for (const r of [flagOff, anon, limited, noTenant]) expect(r.rpcCalls).toHaveLength(0);
});

test("the read lists each adapter's switch for this tenant only, with a hint for who may change it", async () => {
  on();
  const r = load({ registry: [{ adapter_id: "creator-os", state: "enabled" }, { adapter_id: "forge", state: "suspended" }, { adapter_id: "Bad Id!", state: "enabled" }], rpc: () => ({ ok: true, status: 200, value: timed }) });
  const res = await r.route.GET();
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.json();
  expect(body.canChange).toBe(true);
  expect(body.adapters).toEqual([
    { adapterId: "creator-os", enabled: true, status: { mode: "timed", onUntil: timed.on_until, alwaysAllowed: false, syncNowPending: false, now: NOW } },
    { adapterId: "forge", enabled: false, status: expect.objectContaining({ mode: "timed" }) },
  ]);
  expect(r.rpcCalls.filter(([n]) => n.endsWith("_status")).map(([, b]) => b)).toEqual([{ p_tenant_slug: "tenant-a", p_adapter_id: "creator-os" }, { p_tenant_slug: "tenant-a", p_adapter_id: "forge" }]);
  expect(r.rpcCalls[0][1]).toMatchObject({ tenant_slug: "eq.tenant-a" });
  expect((await load({ canChange: false }).route.GET().then((x: Response) => x.json())).canChange).toBe(false);
});

test("the read fails closed when the registry, the status or its shape cannot be trusted", async () => {
  on();
  expect((await load({ registryFails: true }).route.GET()).status).toBe(503);
  expect((await load({ rpc: () => ({ ok: false, status: 500, value: null }) }).route.GET()).status).toBe(503);
  for (const bad of [{ ...off, mode: "forever" }, { ...off, on_until: "2026-10-26T12:00:00.000Z" }, { ...timed, on_until: null }, { ...off, now: "not a date" }, { ...off, always_on_allowed: "yes" }, "off", null]) {
    expect((await load({ rpc: () => ({ ok: true, status: 200, value: bad }) }).route.GET()).status, JSON.stringify(bad)).toBe(503);
  }
});

test("setting a mode passes only the tenant from the server, the adapter and a known mode, and records who acted", async () => {
  on();
  for (const mode of ["off", "1h", "4h", "24h", "always"]) {
    const r = load({ rpc: () => ({ ok: true, status: 200, value: mode === "off" ? "off" : mode === "always" ? "always" : "timed" }) });
    const res = await r.route.POST(post({ adapterId: "creator-os", action: "set", mode, tenantSlug: "tenant-b" }));
    expect(res.status).toBe(200);
    expect(r.rpcCalls).toEqual([["client_adapter_sync_switch_set", { p_tenant_slug: "tenant-a", p_adapter_id: "creator-os", p_mode: mode }]]);
    expect(r.audits).toEqual([["tenant.adapter.sync_switch_set", { adapter_id: "creator-os", mode }]]);
  }
});

test("asking for a sync now calls the one function and records it", async () => {
  on();
  const r = load();
  const res = await r.route.POST(post({ adapterId: "creator-os", action: "sync_now" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(r.rpcCalls).toEqual([["client_adapter_sync_switch_request_now", { p_tenant_slug: "tenant-a", p_adapter_id: "creator-os" }]]);
  expect(r.audits).toEqual([["tenant.adapter.sync_now_requested", { adapter_id: "creator-os" }]]);
});

test("a bad body is refused before the database is reached", async () => {
  on();
  const r = load();
  const bad: unknown[] = [
    "not json", "[]", {}, { action: "set", mode: "1h" }, { adapterId: "Creator OS", action: "set", mode: "1h" }, { adapterId: "creator-os", action: "set" },
    { adapterId: "creator-os", action: "set", mode: "2h" }, { adapterId: "creator-os", action: "set", mode: "forever" }, { adapterId: "creator-os", action: "set", mode: 4 },
    { adapterId: "creator-os", action: "sync_now", mode: "1h" }, { adapterId: "creator-os", action: "delete" }, { adapterId: "../x", action: "sync_now" },
  ];
  for (const body of bad) expect((await r.route.POST(post(body))).status, JSON.stringify(body)).toBe(400);
  expect((await r.route.POST(post(JSON.stringify({ adapterId: "creator-os", action: "sync_now", pad: "x".repeat(2000) })))).status).toBe(400);
  expect(r.rpcCalls).toHaveLength(0);
  expect(r.audits).toHaveLength(0);
});

test("a database refusal becomes a stable code, nothing is audited, and the database's words never leak", async () => {
  on();
  const cases: [string, number, string][] = [
    ["adapter_sync_switch_not_found", 404, "not_found"],
    ["adapter_sync_switch_always_not_allowed", 403, "always_not_allowed"],
    ["adapter_sync_switch_adapter_not_active", 409, "adapter_not_active"],
    ["adapter_sync_switch_bad_mode", 400, "invalid_input"],
    ["relation \"secret_table\" does not exist", 503, "unavailable"],
  ];
  for (const [message, status, code] of cases) {
    const r = load({ rpc: () => ({ ok: false, status: 400, value: { message } }) });
    const res = await r.route.POST(post({ adapterId: "creator-os", action: "set", mode: "always" }));
    expect(res.status).toBe(status);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: code });
    expect(text).not.toContain("secret_table");
    expect(r.audits).toHaveLength(0);
  }
  const forbidden = load({ rpc: () => ({ ok: false, status: 403, value: {} }) });
  expect((await forbidden.route.POST(post({ adapterId: "creator-os", action: "sync_now" }))).status).toBe(403);
  // a success answer of the wrong shape is not a success
  const odd = load({ rpc: () => ({ ok: true, status: 200, value: "maybe" }) });
  expect((await odd.route.POST(post({ adapterId: "creator-os", action: "set", mode: "1h" }))).status).toBe(503);
  expect(odd.audits).toHaveLength(0);
});

test("the words say what each state costs, use the server's clock, and never show a negative time", () => {
  const off2 = lib.parseSyncSwitchStatus(off);
  const on2 = lib.parseSyncSwitchStatus(timed);
  const always = lib.parseSyncSwitchStatus({ ...off, mode: "always", always_on_allowed: true });
  expect(lib.describeSyncSwitch(off2).headline).toBe("Off");
  expect(lib.describeSyncSwitch(off2).detail).toContain("costs nothing");
  expect(lib.describeSyncSwitch(on2).headline).toBe("On, 2 h 5 min left");
  expect(lib.describeSyncSwitch(always).headline).toBe("Always on");
  expect(lib.describeSyncSwitch(always).detail).toContain("$50");
  expect(lib.minutesLeft("2026-10-26T09:00:00.000Z", NOW)).toBe(0);
  expect([0, 0.4, 1, 45, 60, 125].map((m: number) => lib.timeLeftWords(Math.ceil(m)))).toEqual(["less than a minute left", "1 min left", "1 min left", "45 min left", "1 h left", "2 h 5 min left"]);
});
