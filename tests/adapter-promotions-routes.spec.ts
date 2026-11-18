import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

const savedEnv = { ...process.env };
test.afterEach(() => { process.env = { ...savedEnv }; });

const H = (c: string) => c.repeat(64);
const PROMO = "00000000-0000-4000-8000-0000000000c1";
const SOURCE = "00000000-0000-4000-8000-0000000000d1";
const SHARED = "00000000-0000-4000-8000-0000000000e1";
const guard = loadReviewModule("src/lib/adapterMemoryGuard.ts", {});

interface Options {
  authenticated?: boolean; limited?: boolean; canDecide?: boolean; failTable?: string;
  rpc?: { ok: boolean; status: number; value: unknown };
  tables?: Record<string, Record<string, unknown>[]>;
}

function load(opts: Options = {}) {
  const selects: [string, Record<string, string>][] = [];
  const rpcCalls: [string, Record<string, unknown>][] = [];
  const audits: string[] = [];
  const tables = {
    client_adapter_memory_promotions: [{ id: PROMO, source_item_id: SOURCE, origin_adapter_id: "forge", content_sha256: H("1"), status: "quarantined", scan_result: { verdict: "clean" }, requested_by: "u2", reviewed_by: null, reviewed_at: null, decision_note: null, created_at: "2026-10-20T10:00:00Z" }],
    client_adapter_memory_items: [{ id: SOURCE, content: "The private note", status: "active" }],
    client_adapter_memory_provenance: [{ item_id: SOURCE, adapter_id: "forge", adapter_version: "1", agent_principal: "agent", source_task_id: "t1", source_url: "https://example.test/a", source_sha256: null, confidence: 0.5, created_at: "2026-10-20T09:00:00Z" }],
    ...opts.tables,
  } as Record<string, Record<string, unknown>[]>;
  const clientAuth = { currentClientUser: async () => opts.authenticated === false ? null : { id: "u1" }, currentClientMember: async () => true, currentClientCredentialManager: async () => opts.canDecide !== false };
  const dataPlane = {
    checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: !opts.limited }),
    clientRpc: async (name: string, body: Record<string, unknown>) => { rpcCalls.push([name, body]); return opts.rpc ?? { ok: true, status: 200, value: name.includes("revoke") ? true : "approved" }; },
    recordClientAudit: async (event: string) => { audits.push(event); },
    selectClientRecords: async (table: string, filters: Record<string, string>) => {
      selects.push([table, filters]);
      if (opts.failTable === table) return { ok: false, status: 500, records: [] };
      // the shared-notes read and the already-shared read use the same table; tell them apart by the filter
      if (table === "client_adapter_memory_items" && filters.namespace === "eq.shared") {
        return { ok: true, status: 200, records: filters.content_sha256 ? (opts.tables?.alreadyShared ?? []) : (opts.tables?.sharedNotes ?? []) };
      }
      return { ok: true, status: 200, records: tables[table] ?? [] };
    },
  };
  const mocks = { "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }, "@/lib/clientAuth": clientAuth, "@/lib/clientDataPlane": dataPlane };
  const gate = loadReviewModule("src/lib/adapterRouteGate.ts", mocks);
  const routeMocks = { ...mocks, "@/lib/adapterRouteGate": gate, "@/lib/adapterMemoryGuard": guard };
  return {
    list: loadReviewModule("src/app/api/client-runtime/adapter-promotions/route.ts", routeMocks),
    decision: loadReviewModule("src/app/api/client-runtime/adapter-promotions/[id]/decision/route.ts", routeMocks),
    revoke: loadReviewModule("src/app/api/client-runtime/adapter-memory/[id]/revoke/route.ts", routeMocks),
    selects, rpcCalls, audits,
  };
}

const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const ctx = (id = PROMO) => ({ params: Promise.resolve({ id }) });
const on = () => { process.env.ADAPTER_HOST_ENABLED = "true"; process.env.CLIENT_SLUG = "tenant-a"; };

test("every route is closed without sign-in, without the host flag, over the rate limit, or without a tenant", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  delete process.env.ADAPTER_HOST_ENABLED;
  const flagOff = load();
  for (const call of [() => flagOff.list.GET(), () => flagOff.decision.POST(post({ decision: "reject" }), ctx()), () => flagOff.revoke.POST(post({ reason: "wrong fact" }), ctx())]) {
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "adapter_host_disabled" });
  }
  on();
  const anon = load({ authenticated: false });
  for (const call of [() => anon.list.GET(), () => anon.decision.POST(post({ decision: "reject" }), ctx()), () => anon.revoke.POST(post({ reason: "wrong fact" }), ctx())]) expect((await call()).status).toBe(401);
  const limited = load({ limited: true });
  for (const call of [() => limited.list.GET(), () => limited.decision.POST(post({ decision: "reject" }), ctx()), () => limited.revoke.POST(post({ reason: "wrong fact" }), ctx())]) expect((await call()).status).toBe(429);
  delete process.env.CLIENT_SLUG;
  const noTenant = load();
  for (const call of [() => noTenant.list.GET(), () => noTenant.decision.POST(post({ decision: "reject" }), ctx()), () => noTenant.revoke.POST(post({ reason: "wrong fact" }), ctx())]) expect((await call()).status).toBe(503);
  // none of the refusals reached the database
  for (const route of [flagOff, anon, limited, noTenant]) expect(route.rpcCalls).toHaveLength(0);
});

test("the list joins each promotion with its source note, provenance and whether the same fact is already shared", async () => {
  on();
  const route = load({ tables: { alreadyShared: [{ id: SHARED, content_sha256: H("1") }], sharedNotes: [{ id: SHARED, origin_adapter_id: "forge", content: "Shared fact", content_sha256: H("1"), promotion_id: PROMO, created_at: "2026-10-19T10:00:00Z" }] } });
  const res = await route.list.GET();
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.json();
  expect(body).toMatchObject({ ok: true, viewerId: "u1", canDecide: true });
  expect(body.promotions).toHaveLength(1);
  expect(body.promotions[0]).toMatchObject({ id: PROMO, source_content: "The private note", already_shared_item_id: SHARED, status: "quarantined" });
  expect(body.promotions[0].provenance).toEqual([expect.objectContaining({ adapter_id: "forge", source_url: "https://example.test/a" })]);
  expect(body.sharedNotes).toEqual([expect.objectContaining({ id: SHARED, content: "Shared fact" })]);
  // every read is limited to this tenant, and the lookups use only ids and hashes that the first read returned
  for (const [, filters] of route.selects) expect(filters.tenant_slug).toBe("eq.tenant-a");
  const sourceRead = route.selects.find(([t, f]) => t === "client_adapter_memory_items" && f.id)!;
  expect(sourceRead[1].id).toBe(`in.(${SOURCE})`);
  const hashRead = route.selects.find(([, f]) => f.content_sha256)!;
  expect(hashRead[1].content_sha256).toBe(`in.(${H("1")})`);
});

test("someone who is not an owner or admin gets the promotion without the private note, and is told they cannot decide", async () => {
  on();
  const route = load({ canDecide: false, tables: { client_adapter_memory_items: [], client_adapter_memory_provenance: [] } });
  const body = await (await route.list.GET()).json();
  expect(body.canDecide).toBe(false);
  expect(body.promotions[0].source_content).toBeNull();
  expect(body.promotions[0].provenance).toEqual([]);
  expect(body.promotions[0].already_shared_item_id).toBeNull();
});

test("with nothing waiting the list makes no lookups by id, and a failed read is an error, never a partial answer", async () => {
  on();
  const empty = load({ tables: { client_adapter_memory_promotions: [] } });
  const body = await (await empty.list.GET()).json();
  expect(body.promotions).toEqual([]);
  expect(empty.selects.filter(([, f]) => f.id || f.item_id || f.content_sha256)).toHaveLength(0);
  for (const failTable of ["client_adapter_memory_promotions", "client_adapter_memory_items", "client_adapter_memory_provenance"]) {
    const res = await load({ failTable }).list.GET();
    expect(res.status, failTable).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "unavailable" });
  }
  // ids that are not real ids are never put into a filter
  const odd = load({ tables: { client_adapter_memory_promotions: [{ id: PROMO, source_item_id: "x),or=(id.not.is.null", content_sha256: "y", status: "quarantined", scan_result: {}, requested_by: "u2" }] } });
  await odd.list.GET();
  expect(odd.selects.filter(([, f]) => f.id || f.item_id || f.content_sha256)).toHaveLength(0);
});

test("approving repeats the content hash and sends the note; the reviewer is only ever the signed-in person", async () => {
  on();
  const route = load();
  const res = await route.decision.POST(post({ decision: "approve", expectedContentSha256: H("1"), note: "Checked against the policy page", sensitivity: "ordinary", reviewedBy: "someone-else", reviewed_by: "x", requestedBy: "y" }), ctx());
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, status: "approved" });
  expect(route.rpcCalls).toEqual([["client_adapter_decide_promotion", { p_promotion_id: PROMO, p_decision: "approve", p_expected_content_sha256: H("1"), p_note: "Checked against the policy page", p_sensitivity: "ordinary" }]]);
  expect(JSON.stringify(route.rpcCalls)).not.toMatch(/someone-else|reviewed_by|requestedBy/);
  expect(route.audits).toEqual(["tenant.adapter.promotion_approved"]);
});

test("rejecting needs no hash, and an empty note is sent as no note", async () => {
  on();
  const route = load({ rpc: { ok: true, status: 200, value: "rejected" } });
  const res = await route.decision.POST(post({ decision: "reject", expectedContentSha256: H("9"), note: "" }), ctx());
  expect(await res.json()).toEqual({ ok: true, status: "rejected" });
  expect(route.rpcCalls[0][1]).toEqual({ p_promotion_id: PROMO, p_decision: "reject", p_expected_content_sha256: null, p_note: null, p_sensitivity: null });
  expect(route.audits).toEqual(["tenant.adapter.promotion_rejected"]);
});

test("bad decision requests are refused before the database is called", async () => {
  on();
  const route = load();
  const bad: Array<[string, unknown, string?]> = [
    ["not json", "not json"], ["array", []], ["no decision", {}], ["unknown decision", { decision: "maybe" }],
    ["approve without hash", { decision: "approve", sensitivity: "ordinary" }], ["approve with short hash", { decision: "approve", expectedContentSha256: "abc", sensitivity: "ordinary" }],
    ["approve with non-text hash", { decision: "approve", expectedContentSha256: 5, sensitivity: "ordinary" }], ["note not text", { decision: "reject", note: 5 }],
    ["a rejection that names a label", { decision: "reject", sensitivity: "ordinary" }],
    ["note too long", { decision: "reject", note: "x".repeat(2_001) }], ["body too big", { decision: "reject", note: "x".repeat(9_000) }],
    ["not an id", { decision: "reject" }, "not-a-uuid"],
  ];
  for (const [name, body, id] of bad) {
    const res = await route.decision.POST(post(body), ctx(id));
    expect(res.status, name).toBe(400);
    expect(await res.json(), name).toEqual({ ok: false, error: "invalid_input" });
  }
  expect(route.rpcCalls).toHaveLength(0);
  expect(route.audits).toHaveLength(0);
});

test("the database's refusals become stable names and statuses, nothing is audited, and unknown errors are never echoed", async () => {
  on();
  const cases: Array<[string, string, number]> = [
    ["adapter_promotion_requester_cannot_decide", "requester_cannot_decide", 403],
    ["adapter_promotion_not_found", "not_found", 404],
    ["adapter_promotion_not_pending", "not_pending", 409],
    ["adapter_promotion_hash_mismatch", "hash_mismatch", 400],
    ["adapter_promotion_blocked", "blocked_by_scan", 409],
    ["adapter_promotion_scan_required", "scan_required", 409],
    ["adapter_promotion_note_required", "note_required", 400],
    ["adapter_promotion_bad_note", "invalid_input", 400],
    ["adapter_promotion_sensitivity_required", "sensitivity_required", 400],
    ["adapter_promotion_sensitivity_unexpected", "invalid_input", 400],
  ];
  for (const [message, error, status] of cases) {
    const route = load({ rpc: { ok: false, status: 400, value: { message } } });
    const res = await route.decision.POST(post({ decision: "approve", expectedContentSha256: H("1"), sensitivity: "ordinary" }), ctx());
    expect(res.status, message).toBe(status);
    expect(await res.json(), message).toEqual({ ok: false, error });
    expect(route.audits, message).toHaveLength(0);
  }
  const leaky = load({ rpc: { ok: false, status: 500, value: { message: 'relation "secret_table" does not exist' } } });
  const res = await leaky.decision.POST(post({ decision: "reject" }), ctx());
  expect(res.status).toBe(503);
  expect(JSON.stringify(await res.json())).not.toContain("secret_table");
  // an answer that is not exactly "approved" or "rejected" is never treated as a success
  const odd = load({ rpc: { ok: true, status: 200, value: "yes" } });
  expect((await odd.decision.POST(post({ decision: "reject" }), ctx())).status).toBe(503);
  expect(odd.audits).toHaveLength(0);
});

test("withdrawing a shared note needs a reason of 5 to 500 characters and reports whether anything changed", async () => {
  on();
  const route = load();
  const res = await route.revoke.POST(post({ reason: "  The refund window changed  ", reviewer: "someone-else" }), ctx(SHARED));
  expect(await res.json()).toEqual({ ok: true, changed: true });
  expect(route.rpcCalls).toEqual([["client_adapter_revoke_shared_memory", { p_item_id: SHARED, p_reason: "The refund window changed" }]]);
  expect(route.audits).toEqual(["tenant.adapter.memory_revoked"]);
  const again = load({ rpc: { ok: true, status: 200, value: false } });
  expect(await (await again.revoke.POST(post({ reason: "Already withdrawn once" }), ctx(SHARED))).json()).toEqual({ ok: true, changed: false });
  expect(again.audits).toHaveLength(0);
  for (const [name, body, id] of [["short", { reason: "no" }, SHARED], ["blank", { reason: "     " }, SHARED], ["long", { reason: "x".repeat(501) }, SHARED], ["missing", {}, SHARED], ["not text", { reason: 5 }, SHARED], ["bad id", { reason: "A good reason" }, "nope"], ["not json", "{", SHARED]] as const) {
    const bad = load();
    const refused = await bad.revoke.POST(post(body), ctx(id));
    expect(refused.status, name).toBe(400);
    expect(bad.rpcCalls, name).toHaveLength(0);
  }
});

test("withdrawal refusals are mapped too: unknown or other tenant's note, a private note, no permission", async () => {
  on();
  for (const [message, error, status] of [["adapter_revoke_not_found", "not_found", 404], ["adapter_revoke_not_shared", "not_shared", 409], ["adapter_revoke_not_allowed", "not_allowed", 403], ["adapter_revoke_bad_reason", "invalid_input", 400]] as const) {
    const route = load({ rpc: { ok: false, status: 400, value: { message } } });
    const res = await route.revoke.POST(post({ reason: "A good reason" }), ctx(SHARED));
    expect([res.status, (await res.json()).error], message).toEqual([status, error]);
    expect(route.audits).toHaveLength(0);
  }
  const odd = load({ rpc: { ok: true, status: 200, value: "true" } });
  expect((await odd.revoke.POST(post({ reason: "A good reason" }), ctx(SHARED))).status).toBe(503);
});

test("approving needs the reviewer's label, which must be ordinary or sensitive, and it is passed to the database as given", async () => {
  on();
  for (const sensitivity of [undefined, null, "", "restricted", "unknown", "public", "ORDINARY", 5, ["ordinary"], { label: "ordinary" }]) {
    const route = load();
    const res = await route.decision.POST(post({ decision: "approve", expectedContentSha256: H("1"), sensitivity }), ctx());
    expect([res.status, await res.json()], JSON.stringify(sensitivity)).toEqual([400, { ok: false, error: "sensitivity_required" }]);
    expect(route.rpcCalls, JSON.stringify(sensitivity)).toHaveLength(0); // refused before the database
    expect(route.audits).toHaveLength(0);
  }
  for (const sensitivity of ["ordinary", "sensitive"]) {
    const route = load();
    const res = await route.decision.POST(post({ decision: "approve", expectedContentSha256: H("1"), note: "A reason that is long enough", sensitivity }), ctx());
    expect(res.status).toBe(200);
    expect(route.rpcCalls[0]![1]).toMatchObject({ p_sensitivity: sensitivity });
  }
  // a rejection never carries a label, even if the caller names one in another field
  const rejected = load({ rpc: { ok: true, status: 200, value: "rejected" } });
  await rejected.decision.POST(post({ decision: "reject", note: "No", sensitivity: undefined }), ctx());
  expect(rejected.rpcCalls[0]![1]).toMatchObject({ p_sensitivity: null });
});
