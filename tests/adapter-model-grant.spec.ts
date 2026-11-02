import { expect, test } from "@playwright/test";
import { generateKeyPairSync, sign } from "node:crypto";
import { loadReviewModule } from "./helpers/load-review-module";

// Keys are generated inside each run; no real key or credential is used (ADR-020).
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const tokens = loadReviewModule("src/lib/adapterTokens.ts", { "./adapterContracts": contracts });
const grants = loadReviewModule("src/lib/adapterModelGrant.ts", { "./adapterContracts": contracts, "./adapterTokens": tokens });
const pair = () => generateKeyPairSync("ed25519");
const NOW = 1_800_000_000;
const GRANT = "11111111-1111-4111-8111-111111111111";
const WORKER = "w".repeat(30);

const mint = (privateKey: unknown, extra: Record<string, unknown> = {}) =>
  grants.mintModelGrantCredential({ privateKey, tenant: "tenant-a", adapterId: "creator-os", taskKey: "host-task-0001", grantId: GRANT, now: NOW, ...extra });
const verify = (token: unknown, publicKey: unknown, extra: Record<string, unknown> = {}) =>
  grants.verifyModelGrantCredential({ token, publicKey, expectedTenant: "tenant-a", now: NOW + 10, ...extra });

function forge(privateKey: unknown, claims: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${body}.${sign(null, Buffer.from(body, "utf8"), privateKey as never).toString("base64url")}`;
}
const baseClaims = { v: "mg1", iss: "veloce-host", tenant: "tenant-a", aud: "creator-os", task: "host-task-0001", scope: ["model.call"], jti: GRANT, iat: NOW, exp: NOW + 600 };

test("a minted credential verifies and names tenant, adapter, task and grant", () => {
  const { privateKey, publicKey } = pair();
  const { token, claims } = mint(privateKey);
  expect(claims).toEqual(baseClaims);
  expect(verify(token, publicKey)).toEqual({ ok: true, claims });
  expect(verify(token, [pair().publicKey, publicKey])).toEqual({ ok: true, claims }); // rotation overlap
});

test("lifetime defaults to 10 minutes and is capped at 15", () => {
  const { privateKey } = pair();
  expect(mint(privateKey, { ttlSeconds: 900 }).claims.exp).toBe(NOW + 900);
  for (const ttlSeconds of [0, -1, 901, 1.5]) expect(() => mint(privateKey, { ttlSeconds })).toThrow(/lifetime/);
});

test("minting refuses bad tenants, adapters, task keys and grant ids", () => {
  const { privateKey } = pair();
  for (const extra of [{ tenant: "BAD" }, { adapterId: "X" }, { taskKey: "" }, { taskKey: "has/slash" }, { taskKey: "t".repeat(121) }, { grantId: "not-a-uuid" }]) {
    expect(() => mint(privateKey, extra), JSON.stringify(extra)).toThrow();
  }
  expect(() => mint(pair().publicKey)).toThrow();
});

test("a wrong key, a tampered body or junk is refused", () => {
  const { privateKey, publicKey } = pair();
  const { token } = mint(privateKey);
  expect(verify(token, pair().publicKey)).toEqual({ ok: false, reason: "bad_signature" });
  const [body, sig] = token.split(".");
  const tampered = Buffer.from(JSON.stringify({ ...baseClaims, task: "other-task-01" })).toString("base64url");
  expect(verify(`${tampered}.${sig}`, publicKey)).toEqual({ ok: false, reason: "bad_signature" });
  for (const junk of [undefined, 5, "", "a.b.c", `${body}.`, `.${sig}`, "x".repeat(5000), `${body}.${Buffer.alloc(10).toString("base64url")}`]) {
    expect(verify(junk, publicKey)).toEqual({ ok: false, reason: "malformed" });
  }
});

test("every claim is checked", () => {
  const { privateKey, publicKey } = pair();
  const cases: [Record<string, unknown>, string][] = [
    [{ v: "h1" }, "wrong_version"],
    [{ iss: "someone" }, "wrong_issuer"],
    [{ tenant: "tenant-b" }, "wrong_tenant"],
    [{ scope: ["task.run"] }, "scope_not_allowed"],
    [{ scope: ["model.call", "task.run"] }, "scope_not_allowed"],
    [{ exp: NOW + 901 }, "ttl_too_long"],
    [{ exp: NOW }, "ttl_too_long"],
    [{ iat: NOW + 100, exp: NOW + 200 }, "not_yet_valid"],
    [{ exp: NOW + 10 }, "expired"],
    [{ aud: "X" }, "malformed"],
    [{ task: "has/slash" }, "malformed"],
    [{ jti: "nope" }, "malformed"],
    [{ iat: 1.5 }, "malformed"],
  ];
  for (const [change, reason] of cases) {
    expect(verify(forge(privateKey, { ...baseClaims, ...change }), publicKey), JSON.stringify(change)).toEqual({ ok: false, reason });
  }
  expect(verify(forge(privateKey, { ...baseClaims, iat: NOW + 35, exp: NOW + 100 }), publicKey).ok).toBe(true); // within clock skew
});

test("a host token and a grant credential cannot stand in for each other", () => {
  const { privateKey, publicKey } = pair();
  const hostToken = tokens.mintAdapterToken({ privateKey, tenant: "tenant-a", adapterId: "creator-os", scope: ["task.run"], now: NOW }).token;
  expect(verify(hostToken, publicKey)).toEqual({ ok: false, reason: "malformed" }); // no task claim
  const withTask = forge(privateKey, { ...baseClaims, v: "h1", scope: ["model.call"] });
  expect(verify(withTask, publicKey)).toEqual({ ok: false, reason: "wrong_version" });
  const { token } = mint(privateKey);
  expect(tokens.verifyAdapterToken({ token, publicKey, expectedTenant: "tenant-a", expectedAdapterId: "creator-os", requiredOperation: "task.run", now: NOW + 10 }).ok).toBe(false);
});

test("verifying needs one to three Ed25519 public keys", () => {
  const { privateKey } = pair();
  const { token } = mint(privateKey);
  expect(() => verify(token, [])).toThrow();
  expect(() => verify(token, [pair().publicKey, pair().publicKey, pair().publicKey, pair().publicKey])).toThrow();
  expect(() => verify(token, generateKeyPairSync("rsa", { modulusLength: 1024 }).publicKey)).toThrow();
});

const rpcReturning = (value: unknown, ok = true) => {
  const calls: [string, Record<string, unknown>][] = [];
  const rpc = async (name: string, body: Record<string, unknown>) => { calls.push([name, body]); return { ok, status: ok ? 200 : 500, value }; };
  return { rpc, calls };
};
const openInput = { tenantSlug: "tenant-a", workerToken: WORKER, adapterId: "creator-os", taskKey: "host-task-0001", grantId: GRANT, allowed: ["groq:openai/gpt-oss-120b"], maxCalls: 20, maxTokens: 60_000, expiresAt: new Date(NOW * 1000 + 600_000) };

test("opening a grant sends the right call and only 'opened' or 'already_open' count", async () => {
  const { rpc, calls } = rpcReturning("opened");
  expect(await grants.openModelGrant(rpc, openInput)).toEqual({ opened: true, status: "opened" });
  expect(calls[0][0]).toBe("client_adapter_model_grant_open");
  expect(calls[0][1]).toEqual({
    p_tenant_slug: "tenant-a", p_worker_token: WORKER, p_adapter_id: "creator-os", p_task_id: "host-task-0001", p_grant_id: GRANT,
    p_allowed: ["groq:openai/gpt-oss-120b"], p_max_calls: 20, p_max_tokens: 60_000, p_expires_at: new Date(NOW * 1000 + 600_000).toISOString(),
  });
  expect(await grants.openModelGrant(rpcReturning("already_open").rpc, openInput)).toEqual({ opened: true, status: "already_open" });
  for (const status of ["task_has_grant", "adapter_not_ready", "invalid", "refused"]) {
    expect(await grants.openModelGrant(rpcReturning(status).rpc, openInput)).toEqual({ opened: false, status });
  }
  for (const value of ["OPENED", true, null, { status: "opened" }]) {
    expect(await grants.openModelGrant(rpcReturning(value).rpc, openInput)).toEqual({ opened: false, status: "unavailable" });
  }
  expect(await grants.openModelGrant(rpcReturning("opened", false).rpc, openInput)).toEqual({ opened: false, status: "unavailable" });
  expect(await grants.openModelGrant(async () => { throw new Error("down"); }, openInput)).toEqual({ opened: false, status: "unavailable" });
});

test("bad grant input never reaches the database", async () => {
  const { rpc, calls } = rpcReturning("opened");
  const bad: Record<string, unknown>[] = [
    { tenantSlug: "BAD" }, { workerToken: "short" }, { adapterId: "X" }, { taskKey: "a/b" }, { grantId: "x" },
    { allowed: [] }, { allowed: ["no-colon"] }, { allowed: Array.from({ length: 21 }, (_, i) => `groq:m${i}`) },
    { maxCalls: 0 }, { maxCalls: 101 }, { maxTokens: 0 }, { maxTokens: 1_000_001 }, { maxCalls: 1.5 }, { expiresAt: new Date("nope") }, { expiresAt: "2026-01-01" },
  ];
  for (const change of bad) expect(await grants.openModelGrant(rpc, { ...openInput, ...change }), JSON.stringify(change)).toEqual({ opened: false, status: "invalid" });
  expect(calls).toHaveLength(0);
});

test("binding records the adapter's task id; only 'bound' or 'already_bound' count", async () => {
  const input = { tenantSlug: "tenant-a", workerToken: WORKER, grantId: GRANT, adapterTaskId: "wf_abc.123" };
  const { rpc, calls } = rpcReturning("bound");
  expect(await grants.bindModelGrant(rpc, input)).toEqual({ bound: true, status: "bound" });
  expect(calls[0]).toEqual(["client_adapter_model_grant_bind", { p_tenant_slug: "tenant-a", p_worker_token: WORKER, p_grant_id: GRANT, p_adapter_task_id: "wf_abc.123" }]);
  expect(await grants.bindModelGrant(rpcReturning("already_bound").rpc, input)).toEqual({ bound: true, status: "already_bound" });
  for (const status of ["conflict", "not_found", "invalid", "refused"]) expect(await grants.bindModelGrant(rpcReturning(status).rpc, input)).toEqual({ bound: false, status });
  expect(await grants.bindModelGrant(rpcReturning("weird").rpc, input)).toEqual({ bound: false, status: "unavailable" });
  const quiet = rpcReturning("bound");
  expect(await grants.bindModelGrant(quiet.rpc, { ...input, adapterTaskId: "a/b" })).toEqual({ bound: false, status: "invalid" });
  expect(quiet.calls).toHaveLength(0);
});

test("the per-adapter model list is read strictly and fails closed", () => {
  const json = JSON.stringify({ "creator-os": ["groq:openai/gpt-oss-120b", "openai:gpt-4o-mini"], forge: ["anthropic:claude-x"] });
  expect(grants.adapterModelAllowlist(json, "creator-os")).toEqual(["groq:openai/gpt-oss-120b", "openai:gpt-4o-mini"]);
  expect(grants.adapterModelAllowlist(json, "knowledge")).toBeNull();
  for (const raw of [undefined, "", "not json", "[]", "null", JSON.stringify({ "creator-os": "groq:x" }), JSON.stringify({ "creator-os": [] }), JSON.stringify({ "creator-os": ["no-colon"] }), JSON.stringify({ "creator-os": ["groq:ok", 5] })]) {
    expect(grants.adapterModelAllowlist(raw, "creator-os"), String(raw)).toBeNull();
  }
});

// ---- The host task starter (option A): open the grant, start the task with it, record the adapter's task id. ----
const guard = loadReviewModule("src/lib/adapterMemoryGuard.ts", { "./adapterContracts": contracts });
const puller = loadReviewModule("src/lib/adapterEventsPuller.ts", { "./adapterContracts": contracts, "./adapterMemoryGuard": guard });
const starter = loadReviewModule("src/lib/adapterTaskStarter.ts", {
  "./adapterContracts": contracts, "./adapterTokens": tokens, "./adapterModelGrant": grants, "./adapterEventsPuller": puller,
});

function starterHarness(answers: Record<string, unknown> = {}, response: () => Response | Promise<Response> = () => Response.json({ ok: true, taskId: "wf_tide.1", state: "queued" }, { status: 202 })) {
  const { privateKey: key, publicKey: pub } = pair();
  const log: [string, Record<string, unknown>][] = [];
  const rpc = async (name: string, body: Record<string, unknown>) => {
    log.push([name, body]);
    const value = name in answers ? answers[name] : name === "client_adapter_model_grant_open" ? "opened" : "bound";
    return { ok: true, status: 200, value };
  };
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => { requests.push({ url, init }); return response(); };
  const deps = { rpc, workerToken: WORKER, privateKey: key, fetchImpl, now: NOW, newGrantId: () => GRANT };
  return { deps, log, requests, publicKey: pub };
}
const startConfig = { tenantSlug: "tenant-a", adapterId: "creator-os", baseUrl: "https://creator.example.test", hostModelUrl: "https://host.example.test/api/adapter-host/model-call" };
const startInput = { task: "content.draft", idempotencyKey: "host-task-0001", budgetMaxMicros: 500_000, input: { brief: "A made-up brief about tide pools." }, models: ["groq:openai/gpt-oss-120b"] };

test("the starter opens the grant, sends task.run with the credential and binds the adapter's task id", async () => {
  const h = starterHarness();
  const result = await starter.startAdapterTaskWithGrant(startConfig, h.deps, startInput);
  expect(result).toEqual({ ok: true, taskId: "wf_tide.1", state: "queued", grantId: GRANT, replay: false });
  expect(h.log.map(([n]) => n)).toEqual(["client_adapter_model_grant_open", "client_adapter_model_grant_bind"]);
  expect(h.log[0][1]).toMatchObject({ p_adapter_id: "creator-os", p_task_id: "host-task-0001", p_grant_id: GRANT, p_allowed: ["groq:openai/gpt-oss-120b"], p_max_calls: 20, p_max_tokens: 60_000, p_expires_at: new Date((NOW + 600) * 1000).toISOString() });
  expect(h.log[1][1]).toMatchObject({ p_grant_id: GRANT, p_adapter_task_id: "wf_tide.1" });

  expect(h.requests).toHaveLength(1);
  const { url, init } = h.requests[0];
  expect(url).toBe("https://creator.example.test/h1/task.run");
  expect(init.method).toBe("POST");
  expect(init.redirect).toBe("manual");
  const headers = init.headers as Record<string, string>;
  const hostToken = headers.authorization.replace("Bearer ", "");
  expect(tokens.verifyAdapterToken({ token: hostToken, publicKey: h.publicKey, expectedTenant: "tenant-a", expectedAdapterId: "creator-os", requiredOperation: "task.run", now: NOW + 1 }).ok).toBe(true);
  const body = JSON.parse(String(init.body));
  expect(Object.keys(body).sort()).toEqual(["adapterId", "budgetMaxMicros", "idempotencyKey", "input", "modelGrant", "task", "tenantSlug"]);
  expect(body).toMatchObject({ tenantSlug: "tenant-a", adapterId: "creator-os", task: "content.draft", idempotencyKey: "host-task-0001", budgetMaxMicros: 500_000, input: startInput.input });
  expect(body.modelGrant.url).toBe(startConfig.hostModelUrl);
  const verified = grants.verifyModelGrantCredential({ token: body.modelGrant.token, publicKey: h.publicKey, expectedTenant: "tenant-a", now: NOW + 1 });
  expect(verified).toMatchObject({ ok: true, claims: { aud: "creator-os", task: "host-task-0001", jti: GRANT, exp: NOW + 600 } });
});

test("limits and lifetime can be narrowed, and the grant never outlives its credential", async () => {
  const h = starterHarness();
  await starter.startAdapterTaskWithGrant(startConfig, h.deps, { ...startInput, maxCalls: 3, maxTokens: 900, ttlSeconds: 120 });
  expect(h.log[0][1]).toMatchObject({ p_max_calls: 3, p_max_tokens: 900, p_expires_at: new Date((NOW + 120) * 1000).toISOString() });
  for (const bad of [{ maxCalls: 101 }, { maxTokens: 0 }, { ttlSeconds: 901 }, { idempotencyKey: "short" }, { idempotencyKey: "k".repeat(121) }, { models: [] }, { models: ["bad"] }, { budgetMaxMicros: 0 }, { budgetMaxMicros: 1.5 }, { task: "x" }]) {
    const quiet = starterHarness();
    expect(await starter.startAdapterTaskWithGrant(startConfig, quiet.deps, { ...startInput, ...bad }), JSON.stringify(bad)).toEqual({ ok: false, reason: "invalid_input" });
    expect(quiet.log).toHaveLength(0);
    expect(quiet.requests).toHaveLength(0);
  }
});

test("addresses must be https (loopback http only when allowed) with no credentials, query or fragment", async () => {
  for (const change of [{ baseUrl: "http://creator.example.test" }, { hostModelUrl: "http://host.example.test/x" }, { baseUrl: "https://u:p@creator.example.test" }, { hostModelUrl: "https://host.example.test/x?a=1" }, { baseUrl: "not a url" }]) {
    const h = starterHarness();
    expect(await starter.startAdapterTaskWithGrant({ ...startConfig, ...change }, h.deps, startInput), JSON.stringify(change)).toEqual({ ok: false, reason: "invalid_config" });
    expect(h.log).toHaveLength(0);
  }
  const h = starterHarness();
  const local = { ...startConfig, baseUrl: "http://127.0.0.1:8787", hostModelUrl: "http://127.0.0.1:3000/api/adapter-host/model-call", allowInsecureLoopback: true };
  expect((await starter.startAdapterTaskWithGrant(local, h.deps, startInput)).ok).toBe(true);
});

test("nothing is sent to the adapter when the grant cannot be opened", async () => {
  for (const status of ["task_has_grant", "adapter_not_ready", "refused", "weird"]) {
    const h = starterHarness({ client_adapter_model_grant_open: status });
    const result = await starter.startAdapterTaskWithGrant(startConfig, h.deps, startInput);
    expect(result).toEqual({ ok: false, reason: "grant_not_opened", status: status === "weird" ? "unavailable" : status });
    expect(h.requests).toHaveLength(0);
  }
});

test("an adapter that refuses, redirects, is unreachable or answers badly fails the start with a short reason", async () => {
  const cases: [() => Response | Promise<Response>, string][] = [
    [() => new Response("{}", { status: 503 }), "adapter_refused"],
    [() => new Response(null, { status: 302, headers: { location: "https://elsewhere.test" } }), "redirect_refused"],
    [() => { throw new Error("down"); }, "adapter_unreachable"],
    [() => new Response("not json", { status: 202 }), "bad_response"],
    [() => Response.json({ ok: true, taskId: "bad/id", state: "queued" }, { status: 202 }), "bad_response"],
    [() => Response.json({ ok: true, state: "queued" }, { status: 202 }), "bad_response"],
    [() => Response.json({ ok: false, taskId: "wf_1", state: "queued" }, { status: 202 }), "bad_response"],
    [() => new Response("x".repeat(70_000), { status: 202 }), "bad_response"],
  ];
  for (const [response, reason] of cases) {
    const h = starterHarness({}, response);
    expect(await starter.startAdapterTaskWithGrant(startConfig, h.deps, startInput), reason).toEqual({ ok: false, reason, grantId: GRANT });
    expect(h.log.map(([n]) => n)).toEqual(["client_adapter_model_grant_open"]);
  }
});

test("a replayed start binds the same task id again, and a failed bind is reported but the task still runs", async () => {
  const replay = starterHarness({ client_adapter_model_grant_open: "already_open", client_adapter_model_grant_bind: "already_bound" }, () => Response.json({ ok: true, taskId: "wf_tide.1", state: "running", replay: true }, { status: 200 }));
  expect(await starter.startAdapterTaskWithGrant(startConfig, replay.deps, startInput)).toEqual({ ok: true, taskId: "wf_tide.1", state: "running", grantId: GRANT, replay: true });
  const unbound = starterHarness({ client_adapter_model_grant_bind: "conflict" });
  expect(await starter.startAdapterTaskWithGrant(startConfig, unbound.deps, startInput)).toEqual({ ok: true, taskId: "wf_tide.1", state: "queued", grantId: GRANT, replay: false, grantBound: false });
});
