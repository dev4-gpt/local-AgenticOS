import { expect, test } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { loadReviewModule } from "./helpers/load-review-module";

// The host's route that starts an adapter task (ADR-020): owners and admins only, only adapters and tasks the host's own
// setting lists, the budget from that setting (never from the request), and a retry with the same request id starting the
// same task. Keys, addresses and answers are made up; no real service is called.
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const tokens = loadReviewModule("src/lib/adapterTokens.ts", { "./adapterContracts": contracts });
const grants = loadReviewModule("src/lib/adapterModelGrant.ts", { "./adapterContracts": contracts, "./adapterTokens": tokens });
const guard = loadReviewModule("src/lib/adapterMemoryGuard.ts", { "./adapterContracts": contracts });
const puller = loadReviewModule("src/lib/adapterEventsPuller.ts", { "./adapterContracts": contracts, "./adapterMemoryGuard": guard });
const budget = loadReviewModule("src/lib/adapterBudget.ts", { "./adapterContracts": contracts });
const starter = loadReviewModule("src/lib/adapterTaskStarter.ts", {
  "./adapterContracts": contracts, "./adapterTokens": tokens, "./adapterModelGrant": grants, "./adapterEventsPuller": puller, "./adapterBudget": budget,
});
const lib = loadReviewModule("src/lib/adapterTaskRequest.ts", { "./adapterContracts": contracts, "./adapterModelGrant": grants });

const { privateKey } = generateKeyPairSync("ed25519");
const WORKER = "w".repeat(30);
const REQUEST_ID = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";
const TASKS = JSON.stringify({ "veloce-proofmint": { tasks: ["proofmint.round"], budgetMaxMicros: 250_000, ownSpend: true }, "creator-os": { tasks: ["content.draft"], budgetMaxMicros: 400_000, ownSpend: false } });
const ENDPOINTS = JSON.stringify({ "veloce-proofmint": "https://proofmint.example.test", "creator-os": "https://creator.example.test" });
const MODELS = JSON.stringify({ "veloce-proofmint": ["groq:openai/gpt-oss-120b"], "creator-os": ["groq:openai/gpt-oss-120b"] });
const body = (over: Record<string, unknown> = {}) => ({ adapterId: "veloce-proofmint", task: "proofmint.round", input: { family: "dates" }, requestId: REQUEST_ID, ...over });

function harness(o: { manager?: boolean; env?: Record<string, unknown>; start?: (...args: unknown[]) => unknown } = {}) {
  const starts: unknown[][] = [];
  const audits: [string, Record<string, unknown>][] = [];
  const deps = {
    env: { tenantSlug: "tenant-a", workerToken: WORKER, privateKey, capUsd: 5, hostBaseUrl: "https://host.example.test", tasksJson: TASKS, endpointsJson: ENDPOINTS, allowlistJson: MODELS, allowLoopback: false, ...o.env },
    isManager: async () => o.manager ?? true,
    rpc: async () => ({ ok: true, status: 200, value: "opened" }),
    start: async (...args: unknown[]) => { starts.push(args); return o.start ? o.start(...args) : { ok: true, taskId: "ft-aaaaaaaaaaaaaaaaaaaaaaaa", state: "running", grantId: "g", replay: false }; },
    audit: async (event: string, meta: Record<string, unknown>) => { audits.push([event, meta]); return true; },
  };
  return { deps, starts, audits };
}

// ---- the host's setting ----

test("the task setting is read strictly: known adapters, listed tasks, a whole budget and a yes/no for own spend", () => {
  expect(lib.adapterTaskSettings(TASKS)).toEqual({
    "veloce-proofmint": { tasks: ["proofmint.round"], budgetMaxMicros: 250_000, ownSpend: true },
    "creator-os": { tasks: ["content.draft"], budgetMaxMicros: 400_000, ownSpend: false },
  });
  const one = (value: unknown) => JSON.stringify({ "veloce-proofmint": value });
  for (const raw of [
    undefined, "", "not json", "[]", "null", "5",
    JSON.stringify({ "BAD ID": { tasks: ["a.b"], budgetMaxMicros: 1, ownSpend: true } }),
    one(null), one([]), one({ tasks: ["proofmint.round"], budgetMaxMicros: 1 }),
    one({ tasks: ["proofmint.round"], budgetMaxMicros: 1, ownSpend: true, extra: 1 }),
    one({ tasks: [], budgetMaxMicros: 1, ownSpend: true }),
    one({ tasks: ["Bad Task"], budgetMaxMicros: 1, ownSpend: true }),
    one({ tasks: ["a.b", "a.b"], budgetMaxMicros: 1, ownSpend: true }),
    one({ tasks: Array.from({ length: 11 }, (_, i) => `t.task${i}`), budgetMaxMicros: 1, ownSpend: true }),
    one({ tasks: "proofmint.round", budgetMaxMicros: 1, ownSpend: true }),
    one({ tasks: ["proofmint.round"], budgetMaxMicros: 0, ownSpend: true }),
    one({ tasks: ["proofmint.round"], budgetMaxMicros: 1.5, ownSpend: true }),
    one({ tasks: ["proofmint.round"], budgetMaxMicros: "250000", ownSpend: true }),
    one({ tasks: ["proofmint.round"], budgetMaxMicros: lib.MAX_TASK_BUDGET_MICROS + 1, ownSpend: true }),
    one({ tasks: ["proofmint.round"], budgetMaxMicros: 1, ownSpend: "yes" }),
  ]) {
    expect(lib.adapterTaskSettings(raw), String(raw)).toBeNull();
  }
  expect(lib.adapterTaskSettings(one({ tasks: ["proofmint.round"], budgetMaxMicros: lib.MAX_TASK_BUDGET_MICROS, ownSpend: false }))).not.toBeNull();
});

test("an adapter's address comes only from the host's endpoint setting", () => {
  expect(lib.adapterEndpoint(ENDPOINTS, "veloce-proofmint")).toBe("https://proofmint.example.test");
  for (const [raw, id] of [[ENDPOINTS, "other-one"], [undefined, "veloce-proofmint"], ["not json", "veloce-proofmint"], ["[]", "veloce-proofmint"], [JSON.stringify({ "veloce-proofmint": 5 }), "veloce-proofmint"], [ENDPOINTS, "toString"]] as [string | undefined, string][]) {
    expect(lib.adapterEndpoint(raw, id), `${raw} ${id}`).toBeNull();
  }
});

test("the grant id for a task is fixed by tenant, adapter and task key, so a retried start reuses it", () => {
  const a = lib.grantIdFor("tenant-a", "veloce-proofmint", "veloce-proofmint-1");
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(lib.grantIdFor("tenant-a", "veloce-proofmint", "veloce-proofmint-1")).toBe(a);
  expect(lib.grantIdFor("tenant-b", "veloce-proofmint", "veloce-proofmint-1")).not.toBe(a);
  expect(lib.grantIdFor("tenant-a", "creator-os", "veloce-proofmint-1")).not.toBe(a);
  expect(lib.grantIdFor("tenant-a", "veloce-proofmint", "veloce-proofmint-2")).not.toBe(a);
});

// ---- the request ----

test("only an owner or admin may start a task, and nothing else is read or started for anyone else", async () => {
  const h = harness({ manager: false });
  expect(await lib.handleAdapterTaskStart(body(), h.deps)).toEqual({ status: 403, body: { ok: false, error: "not_permitted" } });
  expect(h.starts).toHaveLength(0);
  expect(h.audits).toHaveLength(0);
});

test("a started task uses the host's settings, never the request's, and is recorded with ids only", async () => {
  const h = harness();
  const result = await lib.handleAdapterTaskStart(body(), h.deps);
  expect(result).toEqual({ status: 202, body: { ok: true, taskId: "ft-aaaaaaaaaaaaaaaaaaaaaaaa", state: "running", replay: false } });
  expect(h.starts).toHaveLength(1);
  const [config, deps, input] = h.starts[0] as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
  expect(config).toEqual({ tenantSlug: "tenant-a", adapterId: "veloce-proofmint", baseUrl: "https://proofmint.example.test", hostModelUrl: "https://host.example.test/api/adapter-host/model-call", allowInsecureLoopback: false });
  expect(deps.workerToken).toBe(WORKER);
  expect(deps.privateKey).toBe(privateKey);
  expect((deps.newGrantId as () => string)()).toBe(lib.grantIdFor("tenant-a", "veloce-proofmint", `veloce-proofmint-${REQUEST_ID}`));
  expect(input).toEqual({
    task: "proofmint.round", idempotencyKey: `veloce-proofmint-${REQUEST_ID}`, budgetMaxMicros: 250_000, input: { family: "dates" },
    models: ["groq:openai/gpt-oss-120b"], ownSpend: { tenantMonthlyCapMicros: 5_000_000 },
  });
  expect(h.audits).toEqual([["tenant.adapter.task_started", { adapter_id: "veloce-proofmint", task: "proofmint.round", task_key: `veloce-proofmint-${REQUEST_ID}`, adapter_task_id: "ft-aaaaaaaaaaaaaaaaaaaaaaaa", replay: false }]]);
  expect(JSON.stringify(h.audits)).not.toContain("dates"); // the task's input is never recorded

  // an adapter without own spend reserves nothing; a trailing slash on the host's address is fine
  const plain = harness({ env: { hostBaseUrl: "https://host.example.test/" } });
  await lib.handleAdapterTaskStart(body({ adapterId: "creator-os", task: "content.draft", input: { brief: "A made-up brief." } }), plain.deps);
  const [plainConfig, , plainInput] = plain.starts[0] as [Record<string, unknown>, unknown, Record<string, unknown>];
  expect(plainConfig.hostModelUrl).toBe("https://host.example.test/api/adapter-host/model-call");
  expect(plainInput.budgetMaxMicros).toBe(400_000);
  expect("ownSpend" in plainInput).toBe(false);
  // a replayed start answers 200 and says so
  const again = harness({ start: () => ({ ok: true, taskId: "ft-aaaaaaaaaaaaaaaaaaaaaaaa", state: "succeeded", grantId: "g", replay: true }) });
  expect(await lib.handleAdapterTaskStart(body(), again.deps)).toEqual({ status: 200, body: { ok: true, taskId: "ft-aaaaaaaaaaaaaaaaaaaaaaaa", state: "succeeded", replay: true } });
});

test("anything but the exact request is refused before the host's settings are used", async () => {
  for (const bad of [
    null, [], "x", { ...body(), budgetMaxMicros: 999 }, { ...body(), tenantSlug: "tenant-b" }, { ...body(), requester: "x" },
    body({ adapterId: "BAD" }), body({ adapterId: 5 }), body({ task: "Bad Task" }), body({ task: undefined }),
    body({ requestId: "not-a-uuid" }), body({ requestId: REQUEST_ID.toUpperCase() }), body({ input: undefined }),
  ]) {
    const h = harness();
    expect(await lib.handleAdapterTaskStart(bad, h.deps), JSON.stringify(bad)).toEqual({ status: 400, body: { ok: false, error: "invalid_input" } });
    expect(h.starts).toHaveLength(0);
  }
});

test("an adapter or task the host's setting does not list is refused", async () => {
  for (const b of [body({ adapterId: "other-one" }), body({ task: "proofmint.other" }), body({ adapterId: "creator-os" })]) {
    const h = harness();
    expect(await lib.handleAdapterTaskStart(b, h.deps), JSON.stringify(b)).toEqual({ status: 403, body: { ok: false, error: "task_not_allowed" } });
    expect(h.starts).toHaveLength(0);
  }
  for (const tasksJson of [undefined, "", "not json"]) {
    const h = harness({ env: { tasksJson } });
    expect(await lib.handleAdapterTaskStart(body(), h.deps)).toEqual({ status: 503, body: { ok: false, error: "tasks_not_configured" } });
  }
});

test("a host that is not fully set up refuses without starting anything or naming the setting", async () => {
  for (const env of [
    { endpointsJson: JSON.stringify({ "creator-os": "https://creator.example.test" }) }, { endpointsJson: undefined },
    { allowlistJson: JSON.stringify({ "creator-os": ["groq:x"] }) }, { allowlistJson: undefined },
    { privateKey: null }, { workerToken: "" }, { hostBaseUrl: undefined }, { hostBaseUrl: "" },
    { capUsd: Number.NaN }, { capUsd: -1 },
  ]) {
    const h = harness({ env });
    expect(await lib.handleAdapterTaskStart(body(), h.deps), JSON.stringify(env)).toEqual({ status: 503, body: { ok: false, error: "host_not_configured" } });
    expect(h.starts).toHaveLength(0);
  }
  // the monthly cap only matters for an adapter with own spend
  const plain = harness({ env: { capUsd: Number.NaN } });
  expect((await lib.handleAdapterTaskStart(body({ adapterId: "creator-os", task: "content.draft" }), plain.deps)).status).toBe(202);
});

test("every way a start can fail becomes a short code, and a failure is recorded too", async () => {
  const cases: [unknown, number, string][] = [
    [{ ok: false, reason: "invalid_input" }, 400, "invalid_input"],
    [{ ok: false, reason: "invalid_config" }, 503, "host_not_configured"],
    [{ ok: false, reason: "grant_not_opened", status: "adapter_not_ready" }, 409, "adapter_not_ready"],
    [{ ok: false, reason: "grant_not_opened", status: "task_has_grant" }, 409, "idempotency_conflict"],
    [{ ok: false, reason: "grant_not_opened", status: "refused" }, 503, "unavailable"],
    [{ ok: false, reason: "budget_refused", status: "adapter_cap_exceeded", grantId: "g" }, 409, "budget_exceeded"],
    [{ ok: false, reason: "budget_refused", status: "tenant_cap_exceeded", grantId: "g" }, 409, "budget_exceeded"],
    [{ ok: false, reason: "budget_refused", status: "unavailable", grantId: "g" }, 503, "unavailable"],
    [{ ok: false, reason: "adapter_refused", grantId: "g", ownSpend: "released" }, 502, "adapter_refused"],
    [{ ok: false, reason: "adapter_unreachable", grantId: "g", ownSpend: "kept" }, 502, "adapter_unavailable"],
    [{ ok: false, reason: "bad_response", grantId: "g" }, 502, "adapter_unavailable"],
    [{ ok: false, reason: "redirect_refused", grantId: "g" }, 502, "adapter_unavailable"],
    [{ ok: false, reason: "something_new" }, 503, "unavailable"],
  ];
  for (const [answer, status, error] of cases) {
    const h = harness({ start: () => answer });
    expect(await lib.handleAdapterTaskStart(body(), h.deps), JSON.stringify(answer)).toEqual({ status, body: { ok: false, error } });
    expect(h.audits, JSON.stringify(answer)).toEqual([["tenant.adapter.task_start_failed", { adapter_id: "veloce-proofmint", task: "proofmint.round", task_key: `veloce-proofmint-${REQUEST_ID}`, reason: error }]]);
  }
  const thrown = harness({ start: () => { throw new Error("secret detail"); } });
  expect(await lib.handleAdapterTaskStart(body(), thrown.deps)).toEqual({ status: 503, body: { ok: false, error: "unavailable" } });
});

test("with the real starter, a retry with the same request id reopens the same grant and reserves nothing twice", async () => {
  const calls: [string, Record<string, unknown>][] = [];
  const answers: Record<string, string[]> = {
    client_adapter_model_grant_open: ["opened", "already_open"], client_adapter_budget_reserve: ["reserved", "already_reserved"], client_adapter_model_grant_bind: ["bound", "already_bound"],
  };
  const rpc = async (name: string, b: Record<string, unknown>) => { calls.push([name, b]); return { ok: true, status: 200, value: answers[name]?.shift() }; };
  const fetchImpl = async () => Response.json({ ok: true, taskId: "ft-aaaaaaaaaaaaaaaaaaaaaaaa", state: "running" }, { status: 202 });
  const h = harness();
  const deps = { ...h.deps, rpc, start: (config: unknown, d: Record<string, unknown>, input: unknown) => starter.startAdapterTaskWithGrant(config, { ...d, fetchImpl }, input) };
  expect((await lib.handleAdapterTaskStart(body(), deps)).status).toBe(202);
  expect((await lib.handleAdapterTaskStart(body(), deps)).status).toBe(202);
  const opens = calls.filter(([n]) => n === "client_adapter_model_grant_open").map(([, b]) => b.p_grant_id);
  expect(opens).toHaveLength(2);
  expect(opens[0]).toBe(opens[1]);
  expect(calls.filter(([n]) => n === "client_adapter_budget_reserve").map(([, b]) => b.p_idempotency_key)).toEqual([`own-reserve-veloce-proofmint-${REQUEST_ID}`, `own-reserve-veloce-proofmint-${REQUEST_ID}`]);
});

// ---- the route: switches and wiring ----

function loadRoute(o: { gateOk?: boolean; handle?: (...args: unknown[]) => unknown } = {}) {
  const seen: unknown[][] = [];
  const route = loadReviewModule("src/app/api/client-runtime/adapter-tasks/route.ts", {
    "next/server": { NextResponse: { json: (b: unknown, init: ResponseInit) => Response.json(b, init) } },
    "@/lib/adapterRouteGate": {
      NO_STORE: { "cache-control": "private, no-store" },
      adapterJsonError: (error: string, status: number) => Response.json({ ok: false, error }, { status }),
      adapterRouteGate: async (bucket: string, limit: number) => { seen.push(["gate", bucket, limit]); return o.gateOk === false ? { ok: false, response: Response.json({ ok: false, error: "not_authenticated" }, { status: 401 }) } : { ok: true, tenantSlug: "tenant-a", userId: "u" }; },
      readJsonObject: async (request: Request, max: number) => { seen.push(["read", max]); return JSON.parse(await request.text()); },
    },
    "@/lib/adapterTaskRequest": { handleAdapterTaskStart: async (...args: unknown[]) => { seen.push(["handle", ...args]); return o.handle ? o.handle(...args) : { status: 202, body: { ok: true } }; } },
    "@/lib/adapterTaskStarter": { startAdapterTaskWithGrant: async () => ({}) },
    "@/lib/clientAuth": { currentClientCredentialManager: async () => true },
    "@/lib/clientDataPlane": { workerRpc: async () => ({}), recordClientAudit: async () => true },
  });
  const post = async (env: Record<string, string | undefined>) => {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    try {
      return await route.POST(new Request("https://host.example.test/api/client-runtime/adapter-tasks", { method: "POST", body: JSON.stringify(body()) }));
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  };
  return { post, seen };
}
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const ON = {
  ADAPTER_HOST_ENABLED: "true", ADAPTER_MODEL_CALLS_ENABLED: "true", ADAPTER_TOKEN_SIGNING_KEY_PEM: PEM, CLIENT_SLUG: "tenant-a", CLIENT_WORKER_TOKEN: WORKER,
  CLIENT_BUDGET_CAP: "5", CLIENT_RUNTIME_BASE_URL: "https://host.example.test", ADAPTER_TASKS_JSON: TASKS, ADAPTER_ENDPOINTS: ENDPOINTS, ADAPTER_MODEL_ALLOWLIST_JSON: MODELS, ADAPTER_ALLOW_LOOPBACK: undefined,
};

test("the route checks the member gate first, needs model calls switched on, and passes the server's settings, never caching", async () => {
  const refused = loadRoute({ gateOk: false });
  expect((await refused.post(ON)).status).toBe(401);
  expect(refused.seen.map((s) => s[0])).toEqual(["gate"]);
  for (const off of [{ ADAPTER_MODEL_CALLS_ENABLED: undefined }, { ADAPTER_MODEL_CALLS_ENABLED: "1" }]) {
    const r = loadRoute();
    const res = await r.post({ ...ON, ...off });
    expect(res.status, JSON.stringify(off)).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "model_calls_disabled" });
    expect(r.seen.some((s) => s[0] === "handle")).toBe(false);
  }
  const r = loadRoute({ handle: () => ({ status: 409, body: { ok: false, error: "budget_exceeded" } }) });
  const res = await r.post(ON);
  expect(res.status).toBe(409);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(r.seen[0]).toEqual(["gate", "adapter-task-start", 10]);
  expect(r.seen[1]).toEqual(["read", 16 * 1024]);
  const [, sentBody, deps] = r.seen[2] as [string, unknown, { env: Record<string, unknown> }];
  expect(sentBody).toEqual(body());
  expect(deps.env).toMatchObject({ tenantSlug: "tenant-a", workerToken: WORKER, capUsd: 5, hostBaseUrl: "https://host.example.test", tasksJson: TASKS, endpointsJson: ENDPOINTS, allowlistJson: MODELS, allowLoopback: false });
  expect((deps.env.privateKey as { asymmetricKeyType: string }).asymmetricKeyType).toBe("ed25519");
  // the monthly cap is read from the setting; unset, it reaches the handler as not a number (refused for own spend)
  for (const [cap, expected] of [["7.5", 7.5], [undefined, Number.NaN]] as [string | undefined, number][]) {
    const c = loadRoute();
    await c.post({ ...ON, CLIENT_BUDGET_CAP: cap });
    expect((c.seen[2] as [string, unknown, { env: { capUsd: number } }])[2].env.capUsd, String(cap)).toBe(expected);
  }
  // a signing key that is missing or not Ed25519 reaches the handler as no key, so it refuses as not configured
  for (const pem of [undefined, "junk", generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString()]) {
    const k = loadRoute();
    await k.post({ ...ON, ADAPTER_TOKEN_SIGNING_KEY_PEM: pem });
    expect((k.seen[2] as [string, unknown, { env: { privateKey: unknown } }])[2].env.privateKey, String(pem).slice(0, 10)).toBeNull();
  }
});
