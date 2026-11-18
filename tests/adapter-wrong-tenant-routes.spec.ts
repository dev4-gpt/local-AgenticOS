import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

// Wrong-tenant tests for every adapter-host route. The tenant always comes from the server's own CLIENT_SLUG, so a
// request that names another tenant (in the body, the address, the query string or the path) must change nothing,
// and an id that belongs to another tenant must look exactly like an id that does not exist.
// No real data: every value below is made up inside this test.
const savedEnv = { ...process.env };
test.afterEach(() => { process.env = { ...savedEnv }; });

const H = (c: string) => c.repeat(64);
const ID = "00000000-0000-4000-8000-0000000000c1";
const OTHER = "tenant-b";
const OWN = "tenant-a";
const gateway = loadReviewModule("src/lib/adapterApprovalGateway.ts", {});
const guard = loadReviewModule("src/lib/adapterMemoryGuard.ts", {});

function load(rpc?: { ok: boolean; status: number; value: unknown }) {
  const calls: [string, Record<string, unknown>][] = [];
  const selects: [string, Record<string, string>][] = [];
  const audits: string[] = [];
  const mocks = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "u1" }), currentClientMember: async () => true, currentClientCredentialManager: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      clientRpc: async (n: string, b: Record<string, unknown>) => { calls.push([n, b]); return rpc ?? { ok: true, status: 200, value: n === "client_adapter_budget_summary" ? [] : n.includes("decide") ? "approved" : n.includes("revoke") ? true : ID }; },
      recordClientAudit: async (e: string) => { audits.push(e); },
      selectClientRecords: async (t: string, f: Record<string, string>) => { selects.push([t, f]); return { ok: true, status: 200, records: [] }; },
    },
    "@/lib/adapterApprovalGateway": gateway,
    "@/lib/adapterMemoryGuard": guard,
  };
  const routeGate = loadReviewModule("src/lib/adapterRouteGate.ts", mocks);
  const all = { ...mocks, "@/lib/adapterRouteGate": routeGate };
  const dir = "src/app/api/client-runtime";
  return {
    adapters: loadReviewModule(`${dir}/adapters/route.ts`, all),
    approvals: loadReviewModule(`${dir}/adapter-approvals/route.ts`, all),
    approvalDecision: loadReviewModule(`${dir}/adapter-approvals/[id]/decision/route.ts`, all),
    promotions: loadReviewModule(`${dir}/adapter-promotions/route.ts`, all),
    promotionDecision: loadReviewModule(`${dir}/adapter-promotions/[id]/decision/route.ts`, all),
    revoke: loadReviewModule(`${dir}/adapter-memory/[id]/revoke/route.ts`, all),
    calls, selects, audits,
  };
}

const post = (body: unknown, url = "http://localhost/x") => new Request(url, { method: "POST", body: JSON.stringify(body) });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const on = () => { process.env.ADAPTER_HOST_ENABLED = "true"; process.env.CLIENT_SLUG = OWN; };
// every place a caller could try to name a tenant
const foreign = { tenantSlug: OTHER, tenant_slug: OTHER, p_tenant_slug: OTHER, tenant: OTHER, clientSlug: OTHER };
const seen = (r: ReturnType<typeof load>) => JSON.stringify([r.calls, r.selects]);

test("a request that names another tenant, anywhere, is still answered for the server's own tenant", async () => {
  on();
  const url = `http://localhost/x?tenant_slug=${OTHER}&tenantSlug=${OTHER}`;
  const r = load();
  await r.adapters.GET(new Request(url));
  await r.approvals.GET(new Request(url));
  await r.promotions.GET(new Request(url));
  await r.approvals.POST(post({ adapterId: "forge", kind: "publish", destination: "d", policyVersion: "p", payload: { a: 1 }, ...foreign }, url));
  await r.approvalDecision.POST(post({ decision: "approve", expectedActionHash: H("1"), ...foreign }, url), ctx());
  await r.promotionDecision.POST(post({ decision: "approve", expectedContentSha256: H("1"), sensitivity: "ordinary", ...foreign }, url), ctx());
  await r.revoke.POST(post({ reason: "A good reason", ...foreign }, url), ctx());
  // calls that carry a tenant carry the server's, and nothing anywhere carries the other one
  expect(r.calls.length + r.selects.length).toBeGreaterThanOrEqual(5);
  expect(seen(r)).not.toContain(OTHER);
  for (const [, filters] of r.selects) expect(filters.tenant_slug).toBe(`eq.${OWN}`);
  for (const [name, body] of r.calls) if ("p_tenant_slug" in body) expect([name, body.p_tenant_slug]).toEqual([name, OWN]);
});

test("the tenant used is the one in the server's setting at the moment of the request, never a remembered or supplied one", async () => {
  on();
  const r = load();
  await r.adapters.GET();
  process.env.CLIENT_SLUG = "tenant-c";
  await r.adapters.GET();
  expect(r.calls.map(([, b]) => b.p_tenant_slug)).toEqual([OWN, "tenant-c"]);
  // a blank setting never turns into another tenant
  process.env.CLIENT_SLUG = "   ";
  expect((await r.adapters.GET()).status).toBe(503);
  expect(r.calls).toHaveLength(2);
});

test("an id from another tenant looks exactly like an id that does not exist, and nothing is audited", async () => {
  on();
  const cases: [string, (r: ReturnType<typeof load>) => Promise<Response>, string][] = [
    ["approval decision", (r) => r.approvalDecision.POST(post({ decision: "approve", expectedActionHash: H("1") }), ctx()), "adapter_approval_not_found"],
    ["promotion decision", (r) => r.promotionDecision.POST(post({ decision: "approve", expectedContentSha256: H("1"), sensitivity: "ordinary" }), ctx()), "adapter_promotion_not_found"],
    ["withdrawal", (r) => r.revoke.POST(post({ reason: "A good reason" }), ctx()), "adapter_revoke_not_found"],
  ];
  for (const [name, call, message] of cases) {
    // the database gives the same message for another tenant's id and for an id that was never created
    const wrongTenant = load({ ok: false, status: 400, value: { message } });
    const missing = load({ ok: false, status: 400, value: { message } });
    const a = await call(wrongTenant);
    const b = await call(missing);
    expect([a.status, await a.json()], name).toEqual([404, { ok: false, error: "not_found" }]);
    expect([b.status, await b.json()], name).toEqual([404, { ok: false, error: "not_found" }]);
    expect(wrongTenant.audits, name).toHaveLength(0);
  }
});

test("a database error that names a tenant or a row is never echoed back", async () => {
  on();
  const leak = { message: `permission denied for row of ${OTHER} id ${ID}` };
  const r = load({ ok: false, status: 400, value: leak });
  for (const res of [
    await r.approvalDecision.POST(post({ decision: "approve", expectedActionHash: H("1") }), ctx()),
    await r.promotionDecision.POST(post({ decision: "approve", expectedContentSha256: H("1"), sensitivity: "ordinary" }), ctx()),
    await r.revoke.POST(post({ reason: "A good reason" }), ctx()),
    await r.adapters.GET(),
  ]) {
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(OTHER);
    expect(text).not.toContain("permission denied");
    expect(text).not.toContain(ID);
  }
  expect(r.audits).toHaveLength(0);
});
