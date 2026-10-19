import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

const savedEnv = { ...process.env };
test.afterEach(() => { process.env = { ...savedEnv }; });

const H = (c: string) => c.repeat(64);
const ID = "00000000-0000-4000-8000-000000000001";
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const gateway = loadReviewModule("src/lib/adapterApprovalGateway.ts", { "./adapterContracts": contracts });

const action = (payload: unknown = { a: 1 }) => ({ kind: "publish", adapterId: "forge", destination: "https://example.test/x", policyVersion: "p1", payload });

test("the action hash ignores key order but changes with any part of the action", () => {
  const base = gateway.approvalActionHash(action({ a: 1, b: [1, 2], c: { d: "x" } }));
  expect(base).toMatch(/^[0-9a-f]{64}$/);
  expect(gateway.approvalActionHash(action({ c: { d: "x" }, b: [1, 2], a: 1 }))).toBe(base);
  expect(gateway.approvalActionHash(action({ a: 1, b: [2, 1], c: { d: "x" } }))).not.toBe(base);
  expect(gateway.approvalActionHash({ ...action({ a: 1, b: [1, 2], c: { d: "x" } }), destination: "https://example.test/y" })).not.toBe(base);
  expect(gateway.approvalActionHash({ ...action({ a: 1, b: [1, 2], c: { d: "x" } }), kind: "promote" })).not.toBe(base);
  expect(gateway.approvalActionHash({ ...action({ a: 1, b: [1, 2], c: { d: "x" } }), policyVersion: "p2" })).not.toBe(base);
});

test("the action hash refuses data it cannot hash the same way twice", () => {
  expect(() => gateway.approvalActionHash(action({ n: Infinity }))).toThrow();
  expect(() => gateway.approvalActionHash(action({ f: () => 1 }))).toThrow();
  expect(() => gateway.approvalActionHash(action({ d: new Date() }))).toThrow();
  expect(() => gateway.approvalActionHash({ ...action(), kind: "delete" })).toThrow();
  expect(() => gateway.approvalActionHash({ ...action(), adapterId: "Bad Id" })).toThrow();
  let deep: unknown = 1;
  for (let i = 0; i < 40; i++) deep = { x: deep };
  expect(() => gateway.approvalActionHash(action(deep))).toThrow();
});

test("requestApproval hashes on the server and ignores any caller-supplied hash", async () => {
  const calls: [string, Record<string, unknown>][] = [];
  const rpc = async (name: string, body: Record<string, unknown>) => { calls.push([name, body]); return { ok: true, status: 200, value: ID }; };
  const result = await gateway.requestApproval(rpc, { tenantSlug: "tenant-a", adapterId: "forge", kind: "publish", destination: "d", policyVersion: "p", payload: { a: 1 }, actionHash: H("f") } as never);
  expect(result.ok).toBe(true);
  expect(result.actionHash).toBe(gateway.approvalActionHash({ kind: "publish", adapterId: "forge", destination: "d", policyVersion: "p", payload: { a: 1 } }));
  expect(calls[0][1].p_action_hash).toBe(result.actionHash);
  expect(calls[0][1].p_action_hash).not.toBe(H("f"));
  expect(Object.keys(calls[0][1])).not.toContain("p_requested_by");
});

test("requestApproval rejects bad input before calling the database", async () => {
  let called = 0;
  const rpc = async () => { called++; return { ok: true, status: 200, value: ID }; };
  const base = { tenantSlug: "tenant-a", adapterId: "forge", kind: "publish", destination: "d", policyVersion: "p", payload: {} };
  for (const bad of [{ ttlSeconds: 5 }, { ttlSeconds: 999999 }, { ttlSeconds: 1.5 }, { ttlSeconds: "60" }, { kind: "x" }, { adapterId: 7 }, { destination: "" }, { tenantSlug: "BAD SLUG" }]) {
    expect(await gateway.requestApproval(rpc, { ...base, ...bad })).toEqual({ ok: false, error: "invalid_input" });
  }
  expect(called).toBe(0);
});

test("database errors map to stable codes and unknown errors never leak", () => {
  const code = (message: string, status = 400, extra: object = {}) => gateway.gatewayErrorFrom({ status, value: { message, ...extra } });
  expect(code("adapter_approval_requester_cannot_decide")).toBe("requester_cannot_decide");
  expect(code("adapter_approval_hash_mismatch")).toBe("hash_mismatch");
  expect(code("adapter_approval_not_found")).toBe("not_found");
  expect(code("adapter_approval_not_pending")).toBe("not_pending");
  expect(code("anything", 409, { code: "23505" })).toBe("already_pending");
  expect(code("relation secret_table does not exist", 500)).toBe("unavailable");
  expect(gateway.gatewayErrorFrom({ status: 401, value: null })).toBe("not_allowed");
});

test("decideApproval needs a valid id, a decision, and the hash when approving", async () => {
  const calls: Record<string, unknown>[] = [];
  const rpc = async (_n: string, body: Record<string, unknown>) => { calls.push(body); return { ok: true, status: 200, value: "approved" }; };
  expect(await gateway.decideApproval(rpc, { approvalId: "nope", decision: "approve", expectedActionHash: H("1") })).toEqual({ ok: false, error: "invalid_input" });
  expect(await gateway.decideApproval(rpc, { approvalId: ID, decision: "maybe" })).toEqual({ ok: false, error: "invalid_input" });
  expect(await gateway.decideApproval(rpc, { approvalId: ID, decision: "approve" })).toEqual({ ok: false, error: "invalid_input" });
  expect(await gateway.decideApproval(rpc, { approvalId: ID, decision: "approve", expectedActionHash: H("1") })).toEqual({ ok: true, status: "approved" });
  expect(calls).toHaveLength(1);
  expect(await gateway.decideApproval(async () => ({ ok: true, status: 200, value: "surprise" }), { approvalId: ID, decision: "reject" })).toEqual({ ok: false, error: "unavailable" });
});

test("executeApproval returns false for any bad input and only true on an exact true", async () => {
  let called = 0;
  const ok = async () => { called++; return { ok: true, status: 200, value: true }; };
  const good = { tenantSlug: "tenant-a", workerToken: "x".repeat(30), approvalId: ID, expectedActionHash: H("1"), receiptSha256: H("2") };
  expect(await gateway.executeApproval(ok, good)).toBe(true);
  for (const bad of [{ workerToken: "short" }, { approvalId: "x" }, { expectedActionHash: "x" }, { receiptSha256: "x" }, { tenantSlug: "BAD" }]) {
    expect(await gateway.executeApproval(ok, { ...good, ...bad })).toBe(false);
  }
  expect(called).toBe(1);
  expect(await gateway.executeApproval(async () => ({ ok: true, status: 200, value: false }), good)).toBe(false);
  expect(await gateway.executeApproval(async () => ({ ok: true, status: 200, value: "true" }), good)).toBe(false);
});

function loadRoutes(opts: { authenticated?: boolean; limited?: boolean } = {}) {
  const rpcCalls: [string, Record<string, unknown>][] = [];
  const audits: string[] = [];
  const mocks = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => opts.authenticated === false ? null : { id: "u1" }, currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: !opts.limited }),
      clientRpc: async (n: string, b: Record<string, unknown>) => { rpcCalls.push([n, b]); return { ok: true, status: 200, value: n.includes("decide") ? "approved" : ID }; },
      recordClientAudit: async (e: string) => { audits.push(e); },
      selectClientRecords: async () => ({ ok: true, records: [{ id: ID }] }),
    },
    "@/lib/adapterApprovalGateway": gateway,
  };
  return {
    list: loadReviewModule("src/app/api/client-runtime/adapter-approvals/route.ts", mocks),
    decision: loadReviewModule("src/app/api/client-runtime/adapter-approvals/[id]/decision/route.ts", mocks),
    rpcCalls,
    audits,
  };
}

const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const goodBody = { adapterId: "forge", kind: "publish", destination: "d", policyVersion: "p", payload: { a: 1 } };

test("routes are closed unless the host flag is on, and need a signed-in member", async () => {
  delete process.env.ADAPTER_HOST_ENABLED;
  process.env.CLIENT_SLUG = "tenant-a";
  const r = loadRoutes();
  expect((await r.list.POST(post(goodBody))).status).toBe(403);
  expect((await r.list.GET()).status).toBe(403);
  expect((await r.decision.POST(post({ decision: "reject" }), { params: Promise.resolve({ id: ID }) })).status).toBe(403);
  process.env.ADAPTER_HOST_ENABLED = "true";
  const anon = loadRoutes({ authenticated: false });
  expect((await anon.list.POST(post(goodBody))).status).toBe(401);
  expect((await loadRoutes({ limited: true }).list.POST(post(goodBody))).status).toBe(429);
  delete process.env.CLIENT_SLUG;
  expect((await loadRoutes().list.POST(post(goodBody))).status).toBe(503);
});

test("request route creates an approval and never forwards a caller-supplied identity", async () => {
  process.env.ADAPTER_HOST_ENABLED = "true";
  process.env.CLIENT_SLUG = "tenant-a";
  const r = loadRoutes();
  const res = await r.list.POST(post({ ...goodBody, requestedBy: "attacker", requested_by: "attacker", actionHash: H("f") }));
  expect(res.status).toBe(201);
  const json = await res.json();
  expect(json.approvalId).toBe(ID);
  expect(json.actionHash).not.toBe(H("f"));
  expect(JSON.stringify(r.rpcCalls)).not.toContain("attacker");
  expect(r.audits).toEqual(["tenant.adapter.approval_requested"]);
  expect((await r.list.POST(post("not json"))).status).toBe(400);
  expect((await r.list.POST(post("x".repeat(70_000)))).status).toBe(413);
  expect((await r.list.POST(post({ ...goodBody, kind: "delete" }))).status).toBe(400);
});

test("decision route awaits params, validates input and audits the outcome", async () => {
  process.env.ADAPTER_HOST_ENABLED = "true";
  process.env.CLIENT_SLUG = "tenant-a";
  const r = loadRoutes();
  const ctx = { params: Promise.resolve({ id: ID }) };
  expect((await r.decision.POST(post({ decision: "approve" }), ctx)).status).toBe(400); // hash missing
  const ok = await r.decision.POST(post({ decision: "approve", expectedActionHash: H("1"), decidedBy: "attacker" }), ctx);
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ ok: true, status: "approved" });
  expect(JSON.stringify(r.rpcCalls)).not.toContain("attacker");
  expect(r.audits).toEqual(["tenant.adapter.approval_approved"]);
  expect((await r.decision.POST(post({ decision: "reject" }), { params: Promise.resolve({ id: "not-a-uuid" }) })).status).toBe(400);
});

test("list route returns approvals with no-store caching", async () => {
  process.env.ADAPTER_HOST_ENABLED = "true";
  process.env.CLIENT_SLUG = "tenant-a";
  const res = await loadRoutes().list.GET();
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
});
