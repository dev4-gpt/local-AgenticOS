import { expect, test } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { loadReviewModule } from "./helpers/load-review-module";

// The host side of model.call (ADR-020) with every boundary faked: keys are generated per run, the database is a recorder
// with scripted answers, and the provider is a stub. No real key, prompt or client text is used.
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const tokens = loadReviewModule("src/lib/adapterTokens.ts", { "./adapterContracts": contracts });
const budget = loadReviewModule("src/lib/adapterBudget.ts", { "./adapterContracts": contracts });
const grants = loadReviewModule("src/lib/adapterModelGrant.ts", { "./adapterContracts": contracts, "./adapterTokens": tokens });
const calls = loadReviewModule("src/lib/adapterModelCall.ts", { "./adapterContracts": contracts, "./adapterBudget": budget, "./adapterModelGrant": grants });

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const NOW = 1_800_000_000;
const GRANT = "11111111-1111-4111-8111-111111111111";
const WORKER = "w".repeat(30);
const TASK = "host-task-0001";

const credential = (extra: Record<string, unknown> = {}) =>
  grants.mintModelGrantCredential({ privateKey, tenant: "tenant-a", adapterId: "creator-os", taskKey: TASK, grantId: GRANT, now: NOW, ...extra }).token;

const request = (extra: Record<string, unknown> = {}) => ({
  taskKey: TASK, provider: "groq", model: "openai/gpt-oss-120b",
  messages: [{ role: "system", content: "Write briefly." }, { role: "user", content: "A made-up brief about tide pools." }],
  maxOutputTokens: 500, ...extra,
});

type Answers = Record<string, unknown>;
function harness(answers: Answers = {}, over: Record<string, unknown> = {}) {
  const log: [string, Record<string, unknown>][] = [];
  const defaults: Answers = {
    client_adapter_model_call_begin: { status: "ok", seq: 1 },
    client_adapter_budget_reserve: "reserved",
    client_adapter_budget_settle: "settled",
    client_adapter_budget_release: "released",
    client_adapter_model_call_finish: "finished",
  };
  const rpc = async (name: string, body: Record<string, unknown>) => {
    log.push([name, body]);
    const value = name in answers ? answers[name] : defaults[name];
    if (value instanceof Error) throw value;
    return { ok: true, status: 200, value };
  };
  const providerCalls: unknown[][] = [];
  const policyCalls: string[] = [];
  const deps = {
    tenantSlug: "tenant-a",
    workerToken: WORKER,
    publicKeys: publicKey,
    tenantMonthlyCapMicros: 5_000_000,
    rpc,
    now: NOW + 5,
    policy: {
      clientAllows: (provider: string, model: string) => { policyCalls.push("allow"); return provider === "groq" && model === "openai/gpt-oss-120b"; },
      maxPromptChars: () => 1000,
      secretLike: (messages: { content: string }[]) => messages.some((m) => m.content.includes("sk-live-")),
      estimateMicros: (_model: string, messages: { content: string }[], maxOut: number) => messages.reduce((n, m) => n + m.content.length, 0) + maxOut,
      usageMicros: (_model: string, usage: { inputTokens: number; outputTokens: number }) => usage.inputTokens + usage.outputTokens,
      safeOutput: (text: string) => text.trim(),
    },
    callProvider: async (...args: unknown[]) => { providerCalls.push(args); return { ok: true, output: "  A short made-up answer.  ", usage: { inputTokens: 20, outputTokens: 30 } }; },
    ...over,
  };
  return { deps, log, providerCalls, policyCalls, names: () => log.map(([name]) => name) };
}

const PROMPT_CHARS = "Write briefly.".length + "A made-up brief about tide pools.".length;

test("a good call is counted, reserved, made, settled at its real cost and finished, and only the answer comes back", async () => {
  const h = harness();
  const result = await calls.handleModelCall(`Bearer ${credential()}`, request(), h.deps);
  expect(result).toEqual({ status: 200, body: { ok: true, output: "A short made-up answer.", usage: { inputTokens: 20, outputTokens: 30 }, costMicros: 50, call: 1 } });
  expect(h.names()).toEqual(["client_adapter_model_call_begin", "client_adapter_budget_reserve", "client_adapter_budget_settle", "client_adapter_model_call_finish"]);
  const [, begin] = h.log[0];
  expect(begin).toEqual({
    p_tenant_slug: "tenant-a", p_worker_token: WORKER, p_adapter_id: "creator-os", p_task_id: TASK, p_grant_id: GRANT,
    p_provider: "groq", p_model: "openai/gpt-oss-120b", p_tokens: PROMPT_CHARS + 500, p_adapter_per_minute: 30, p_tenant_per_minute: 60,
  });
  expect(h.log[1][1]).toMatchObject({
    p_tenant_slug: "tenant-a", p_adapter_id: "creator-os", p_task_id: `${TASK}/m1`, p_amount_micros: PROMPT_CHARS + 500,
    p_provider: "groq", p_model: "openai/gpt-oss-120b", p_tenant_monthly_cap_micros: 5_000_000, p_idempotency_key: `mcr-${GRANT}-1`,
  });
  expect(h.log[2][1]).toMatchObject({ p_task_id: `${TASK}/m1`, p_actual_amount_micros: 50, p_idempotency_key: `mcs-${GRANT}-1` });
  expect(h.log[3][1]).toEqual({ p_tenant_slug: "tenant-a", p_worker_token: WORKER, p_grant_id: GRANT, p_seq: 1, p_actual_tokens: 50 });
  expect(h.providerCalls).toEqual([["groq", "openai/gpt-oss-120b", request().messages, 500]]);
});

test("the settled cost never exceeds the reservation, and a call without usage settles the full reservation", async () => {
  const pricey = harness({}, { policy: { ...harness().deps.policy, usageMicros: () => 10_000_000 } });
  const a = await calls.handleModelCall(`Bearer ${credential()}`, request(), pricey.deps);
  expect(a.body.costMicros).toBe(PROMPT_CHARS + 500);
  const noUsage = harness({}, { callProvider: async () => ({ ok: true, output: "made-up" }) });
  const b = await calls.handleModelCall(`Bearer ${credential()}`, request(), noUsage.deps);
  expect(b.body).toMatchObject({ ok: true, costMicros: PROMPT_CHARS + 500, usage: null });
  expect(noUsage.log.at(-1)?.[1]).toMatchObject({ p_actual_tokens: PROMPT_CHARS + 500 });
  const unpriced = harness({}, { policy: { ...harness().deps.policy, usageMicros: () => null } });
  expect((await calls.handleModelCall(`Bearer ${credential()}`, request(), unpriced.deps)).body.costMicros).toBe(PROMPT_CHARS + 500);
});

test("a missing, bad or foreign credential is refused before anything else", async () => {
  const other = generateKeyPairSync("ed25519").privateKey;
  const cases: [string | null, string][] = [
    [null, "credential_required"],
    ["", "credential_required"],
    [credential(), "credential_required"], // no Bearer prefix
    ["Bearer junk", "bad_credential"],
    [`Bearer ${grants.mintModelGrantCredential({ privateKey: other, tenant: "tenant-a", adapterId: "creator-os", taskKey: TASK, grantId: GRANT, now: NOW }).token}`, "bad_credential"],
    [`Bearer ${credential({ tenant: "tenant-b" })}`, "bad_credential"],
    [`Bearer ${credential({ now: NOW - 1000 })}`, "bad_credential"], // expired
    [`Bearer ${tokens.mintAdapterToken({ privateKey, tenant: "tenant-a", adapterId: "creator-os", scope: ["task.run"], now: NOW }).token}`, "bad_credential"],
  ];
  for (const [header, error] of cases) {
    const h = harness();
    const result = await calls.handleModelCall(header, request(), h.deps);
    expect(result, String(header)).toEqual({ status: 401, body: { ok: false, error } });
    expect(h.log).toHaveLength(0);
    expect(h.providerCalls).toHaveLength(0);
  }
});

test("a request for another task, or a malformed request, is refused before the database", async () => {
  const bad: [unknown, number, string][] = [
    [request({ taskKey: "host-task-0002" }), 403, "task_mismatch"],
    [request({ taskKey: 5 }), 400, "invalid_request"],
    [request({ taskKey: "has/slash" }), 400, "invalid_request"],
    [null, 400, "invalid_request"],
    [[], 400, "invalid_request"],
    [{ ...request(), extra: 1 }, 400, "invalid_request"],
    [request({ provider: 5 }), 400, "invalid_request"],
    [request({ model: "" }), 400, "invalid_request"],
    [request({ model: "m".repeat(181) }), 400, "invalid_request"],
    [request({ messages: [] }), 400, "invalid_request"],
    [request({ messages: Array.from({ length: 51 }, () => ({ role: "user", content: "x" })) }), 400, "invalid_request"],
    [request({ messages: [{ role: "tool", content: "x" }] }), 400, "invalid_request"],
    [request({ messages: [{ role: "user", content: 5 }] }), 400, "invalid_request"],
    [request({ messages: [{ role: "user", content: "" }] }), 400, "invalid_request"],
    [request({ messages: [{ role: "user", content: "x", name: "n" }] }), 400, "invalid_request"],
    [request({ maxOutputTokens: 0 }), 400, "invalid_request"],
    [request({ maxOutputTokens: 4097 }), 400, "invalid_request"],
    [request({ maxOutputTokens: 1.5 }), 400, "invalid_request"],
  ];
  for (const [body, status, error] of bad) {
    const h = harness();
    expect(await calls.handleModelCall(`Bearer ${credential()}`, body, h.deps), JSON.stringify(body)).toEqual({ status, body: { ok: false, error } });
    expect(h.log).toHaveLength(0);
  }
});

test("policy checks run in order before the database: provider list, client allowlist, size, secrets, pricing", async () => {
  const run = async (body: unknown, over: Record<string, unknown> = {}) => {
    const h = harness({}, over);
    const result = await calls.handleModelCall(`Bearer ${credential()}`, body, h.deps);
    expect(h.log).toHaveLength(0);
    return result;
  };
  // a provider the client may allow but that is not one of the first five is refused without asking the policy
  const h = harness({}, { policy: { ...harness().deps.policy, clientAllows: () => true } });
  expect(await calls.handleModelCall(`Bearer ${credential()}`, request({ provider: "xai", model: "grok-3-mini" }), h.deps)).toEqual({ status: 403, body: { ok: false, error: "model_not_allowed" } });
  expect(await run(request({ model: "other" }))).toEqual({ status: 403, body: { ok: false, error: "model_not_allowed" } });
  expect(await run(request(), { policy: { ...harness().deps.policy, maxPromptChars: () => PROMPT_CHARS - 1 } })).toEqual({ status: 400, body: { ok: false, error: "prompt_too_large" } });
  expect(await run(request(), { policy: { ...harness().deps.policy, maxPromptChars: () => null } })).toEqual({ status: 503, body: { ok: false, error: "provider_not_configured" } });
  expect(await run(request({ messages: [{ role: "user", content: "made-up sk-live-123" }] }))).toEqual({ status: 400, body: { ok: false, error: "secret_like_input_rejected" } });
  expect(await run(request(), { policy: { ...harness().deps.policy, estimateMicros: () => null } })).toEqual({ status: 503, body: { ok: false, error: "model_pricing_not_configured" } });
  // exactly at the size limit is allowed
  const atLimit = harness({}, { policy: { ...harness().deps.policy, maxPromptChars: () => PROMPT_CHARS } });
  expect((await calls.handleModelCall(`Bearer ${credential()}`, request(), atLimit.deps)).status).toBe(200);
});

test("database refusals of the call map to short codes and nothing is reserved", async () => {
  const cases: [unknown, number, string][] = [
    [{ status: "grant_not_found" }, 403, "grant_not_found"],
    [{ status: "grant_closed" }, 403, "grant_closed"],
    [{ status: "grant_expired" }, 403, "grant_expired"],
    [{ status: "adapter_not_ready" }, 403, "adapter_not_ready"],
    [{ status: "model_not_allowed" }, 403, "model_not_allowed"],
    [{ status: "call_limit" }, 429, "call_limit"],
    [{ status: "token_limit" }, 429, "token_limit"],
    [{ status: "adapter_rate_limited" }, 429, "rate_limited"],
    [{ status: "tenant_rate_limited" }, 429, "rate_limited"],
    [{ status: "refused" }, 503, "host_unavailable"],
    [{ status: "invalid" }, 503, "host_unavailable"],
    [{ status: "ok" }, 503, "host_unavailable"], // no seq
    [{ status: "ok", seq: 0 }, 503, "host_unavailable"],
    [{ status: "ok", seq: 1.5 }, 503, "host_unavailable"],
    ["ok", 503, "host_unavailable"],
    [null, 503, "host_unavailable"],
    [new Error("down"), 503, "host_unavailable"],
  ];
  for (const [answer, status, error] of cases) {
    const h = harness({ client_adapter_model_call_begin: answer });
    expect(await calls.handleModelCall(`Bearer ${credential()}`, request(), h.deps), JSON.stringify(answer)).toEqual({ status, body: { ok: false, error } });
    expect(h.names()).toEqual(["client_adapter_model_call_begin"]);
    expect(h.providerCalls).toHaveLength(0);
  }
});

test("a refused reservation stops the call and gives the held tokens back", async () => {
  const cases: [string, number, string][] = [
    ["adapter_cap_exceeded", 429, "budget_exceeded"],
    ["tenant_cap_exceeded", 429, "budget_exceeded"],
    ["adapter_not_ready", 403, "adapter_not_ready"],
    ["key_conflict", 503, "host_unavailable"],
    ["nonsense", 503, "host_unavailable"],
  ];
  for (const [answer, status, error] of cases) {
    const h = harness({ client_adapter_budget_reserve: answer });
    expect(await calls.handleModelCall(`Bearer ${credential()}`, request(), h.deps)).toEqual({ status, body: { ok: false, error } });
    expect(h.names()).toEqual(["client_adapter_model_call_begin", "client_adapter_budget_reserve", "client_adapter_model_call_finish"]);
    expect(h.log[2][1]).toMatchObject({ p_seq: 1, p_actual_tokens: 0 });
    expect(h.providerCalls).toHaveLength(0);
  }
});

test("a failed provider call releases the reservation and returns only a code, never the provider's words", async () => {
  const cases: [unknown, number, string][] = [
    [{ ok: false, status: 401 }, 502, "provider_auth_failed"],
    [{ ok: false, status: 404 }, 502, "provider_model_unavailable"],
    [{ ok: false, status: 429 }, 502, "provider_rate_limited"],
    [{ ok: false, status: 504 }, 502, "provider_timeout"],
    [{ ok: false, status: 400 }, 502, "provider_request_rejected"],
    [{ ok: false, status: 500 }, 502, "provider_request_failed"],
    [new Error("provider said: secret details"), 502, "provider_request_failed"],
    [{ ok: true, output: 5 }, 502, "provider_request_failed"],
  ];
  for (const [answer, status, error] of cases) {
    const h = harness({}, { callProvider: async () => { if (answer instanceof Error) throw answer; return answer; } });
    const result = await calls.handleModelCall(`Bearer ${credential()}`, request(), h.deps);
    expect(result).toEqual({ status, body: { ok: false, error } });
    expect(h.names()).toEqual(["client_adapter_model_call_begin", "client_adapter_budget_reserve", "client_adapter_budget_release", "client_adapter_model_call_finish"]);
    expect(h.log[2][1]).toMatchObject({ p_task_id: `${TASK}/m1`, p_idempotency_key: `mcx-${GRANT}-1` });
    expect(h.log[3][1]).toMatchObject({ p_actual_tokens: 0 });
  }
});

test("an answer the provider gave is still returned when settling fails, marked unsettled", async () => {
  const h = harness({ client_adapter_budget_settle: "nonsense", client_adapter_model_call_finish: new Error("down") });
  const result = await calls.handleModelCall(`Bearer ${credential()}`, request(), h.deps);
  expect(result).toEqual({ status: 200, body: { ok: true, output: "A short made-up answer.", usage: { inputTokens: 20, outputTokens: 30 }, costMicros: 50, call: 1, settled: false } });
});

test("the per-minute limits passed to the database can be changed but are always whole numbers in range", async () => {
  const h = harness({}, { adapterPerMinute: 5, tenantPerMinute: 9 });
  await calls.handleModelCall(`Bearer ${credential()}`, request(), h.deps);
  expect(h.log[0][1]).toMatchObject({ p_adapter_per_minute: 5, p_tenant_per_minute: 9 });
  for (const bad of [{ adapterPerMinute: 0 }, { tenantPerMinute: 601 }, { adapterPerMinute: 1.5 }]) {
    expect(() => calls.assertModelCallDeps({ ...harness().deps, ...bad })).toThrow();
  }
  expect(() => calls.assertModelCallDeps({ ...harness().deps, workerToken: "short" })).toThrow();
  expect(() => calls.assertModelCallDeps({ ...harness().deps, tenantSlug: "BAD" })).toThrow();
  for (const tenantMonthlyCapMicros of [-1, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
    expect(() => calls.assertModelCallDeps({ ...harness().deps, tenantMonthlyCapMicros })).toThrow(/monthly cap/);
  }
  expect(() => calls.assertModelCallDeps({ ...harness().deps, tenantMonthlyCapMicros: 0 })).not.toThrow();
});

test("nothing from the prompt or the answer reaches the database", async () => {
  const h = harness();
  await calls.handleModelCall(`Bearer ${credential()}`, request(), h.deps);
  const sent = JSON.stringify(h.log);
  for (const fragment of ["tide pools", "Write briefly", "made-up answer"]) expect(sent).not.toContain(fragment);
});

// ---- The route: switches, configuration, and that it hands the adapter's header and body to handleModelCall. ----
function loadRoute(env: Record<string, string | undefined>, handle?: (...args: unknown[]) => unknown, switches: { callsEnabled?: boolean; allowed?: boolean } = {}) {
  const seen: unknown[][] = [];
  const nextServer = { NextResponse: { json: (body: unknown, init: ResponseInit) => Response.json(body, init) } };
  const route = loadReviewModule("src/app/api/adapter-host/model-call/route.ts", {
    "next/server": nextServer,
    "@/lib/adapterRouteGate": { NO_STORE: { "cache-control": "private, no-store" }, readJsonObject: async (request: Request) => JSON.parse(await request.text()) },
    "@/lib/adapterModelCall": { handleModelCall: async (...args: unknown[]) => { seen.push(args); return handle ? handle(...args) : { status: 200, body: { ok: true, output: "made-up", usage: null, costMicros: 0, call: 1 } }; } },
    "@/lib/clientDataPlane": { workerRpc: async () => ({ ok: false, status: 503, value: null }) },
    "@/lib/clientInputSafety": { containsClientSecretLike: () => false },
    "@/lib/clientProviderAdapter": { callClientTextProvider: async () => ({ ok: false, status: 503 }), clientProviderRequestAllowed: (_p: string, model: string) => (switches.allowed ? { ok: true, model } : { ok: false }), clientTextUsageCostMicros: () => null, estimateClientTextCostMicros: () => null, safeClientProviderOutput: (s: string) => s },
    "@/lib/clientProviderContracts": { clientProviderContract: () => null },
    "@/lib/clientRuntimePolicy": { clientProviderCallsEnabled: () => switches.callsEnabled === true },
  });
  const saved: Record<string, string | undefined> = {};
  const post = async (init: RequestInit = {}) => {
    for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    try {
      return await route.POST(new Request("https://host.example.test/api/adapter-host/model-call", { method: "POST", body: JSON.stringify(request()), ...init }));
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  };
  return { post, seen };
}
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const ON = { ADAPTER_HOST_ENABLED: "true", ADAPTER_MODEL_CALLS_ENABLED: "true", ADAPTER_TOKEN_SIGNING_KEY_PEM: PEM, CLIENT_SLUG: "tenant-a", CLIENT_WORKER_TOKEN: WORKER, CLIENT_BUDGET_CAP: "5" };

test("the route is off unless both switches are on, and refuses a missing or wrong key without saying which", async () => {
  for (const off of [{ ADAPTER_HOST_ENABLED: undefined }, { ADAPTER_MODEL_CALLS_ENABLED: undefined }, { ADAPTER_MODEL_CALLS_ENABLED: "1" }]) {
    const r = loadRoute({ ...ON, ...off });
    const res = await r.post();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "model_calls_disabled" });
    expect(r.seen).toHaveLength(0);
  }
  const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  for (const bad of [{ ADAPTER_TOKEN_SIGNING_KEY_PEM: undefined }, { ADAPTER_TOKEN_SIGNING_KEY_PEM: "not a key" }, { ADAPTER_TOKEN_SIGNING_KEY_PEM: rsa }, { CLIENT_BUDGET_CAP: "-1" }, { CLIENT_BUDGET_CAP: "lots" }]) {
    const r = loadRoute({ ...ON, ...bad });
    const res = await r.post();
    expect(res.status, JSON.stringify(Object.keys(bad))).toBe(503);
    const text = await res.text();
    expect(text).toBe(JSON.stringify({ ok: false, error: "host_not_configured" }));
    expect(r.seen).toHaveLength(0);
  }
});

test("the route passes the adapter's header and body through, with the host's public key and cap, and never caches", async () => {
  const r = loadRoute(ON);
  const res = await r.post({ headers: { authorization: "Bearer abc" } });
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const [header, body, deps] = r.seen[0] as [string, unknown, Record<string, unknown>];
  expect(header).toBe("Bearer abc");
  expect(body).toEqual(request());
  expect(deps).toMatchObject({ tenantSlug: "tenant-a", workerToken: WORKER, tenantMonthlyCapMicros: 5_000_000 });
  expect((deps.publicKeys as { asymmetricKeyType: string; type: string }).type).toBe("public");
  expect((deps.publicKeys as { export: (o: object) => string }).export({ type: "spki", format: "pem" })).toBe(publicKey.export({ type: "spki", format: "pem" }));
  // the client's provider-call switch is part of the policy
  expect((deps.policy as { clientAllows: (p: string, m: string) => boolean }).clientAllows("groq", "openai/gpt-oss-120b")).toBe(false);
});

test("a deployment mistake inside the call becomes host_not_configured with no detail", async () => {
  const r = loadRoute(ON, () => { throw new Error("model.call: worker token not configured"); });
  const res = await r.post();
  expect(res.status).toBe(503);
  expect(await res.text()).toBe(JSON.stringify({ ok: false, error: "host_not_configured" }));
});

test("the client's provider-call switch and allowlist both have to say yes", async () => {
  const policyOf = async (switches: { callsEnabled?: boolean; allowed?: boolean }) => {
    const r = loadRoute(ON, undefined, switches);
    await r.post();
    return (r.seen[0][2] as { policy: { clientAllows: (p: string, m: string) => boolean } }).policy;
  };
  expect((await policyOf({ callsEnabled: true, allowed: true })).clientAllows("groq", "openai/gpt-oss-120b")).toBe(true);
  expect((await policyOf({ callsEnabled: false, allowed: true })).clientAllows("groq", "openai/gpt-oss-120b")).toBe(false);
  expect((await policyOf({ callsEnabled: true, allowed: false })).clientAllows("groq", "openai/gpt-oss-120b")).toBe(false);
});
