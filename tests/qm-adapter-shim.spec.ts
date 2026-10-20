import { expect, test } from "@playwright/test";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadReviewModule } from "./helpers/load-review-module";

// Tests for services/qm-adapter (ADR-011). QM is replaced by a fake; keys, tenants and ids are made up here.
// Tokens are minted by the real host module (src/lib/adapterTokens.ts), so the shim's copy of the rules cannot drift.
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const tokens = loadReviewModule("src/lib/adapterTokens.ts", { "./adapterContracts": contracts });
const load = async (file: string) => import(pathToFileURL(path.resolve("services/qm-adapter", file)).href);

const TENANT = "tenant-a";
const ADAPTER = "qm-harness";
const RUN = "11111111-1111-4111-8111-111111111111";
const KEY = "task-2026-10-20-0001";
const manifest = JSON.parse(readFileSync("services/qm-adapter/manifest.json", "utf8"));
const pair = generateKeyPairSync("ed25519");
const mint = (scope: string[], extra: Record<string, unknown> = {}, key = pair.privateKey) =>
  tokens.mintAdapterToken({ privateKey: key, tenant: TENANT, adapterId: ADAPTER, scope, ...extra }).token as string;

// ---------- signing and the QM client ----------

test("the QM request signature matches the value QM's own code produces", async () => {
  const { signQmRequest } = await load("qm-client.mjs");
  // Computed with QM's plugins/chassis/src/source-auth-sign.ts on 2026-10-20.
  const golden = "v0=af76706673ef19a533ea15e151b56d1112c3e345b2f4ab0806f1162e0a7a3295";
  const secret = "0123456789abcdef0123456789abcdef0123";
  expect(signQmRequest(secret, 1800000000, "POST", "/v1/turns?async=1", '{"text":"hi"}')).toBe(golden);
  for (const changed of [
    signQmRequest(`${secret}x`, 1800000000, "POST", "/v1/turns?async=1", '{"text":"hi"}'),
    signQmRequest(secret, 1800000001, "POST", "/v1/turns?async=1", '{"text":"hi"}'),
    signQmRequest(secret, 1800000000, "GET", "/v1/turns?async=1", '{"text":"hi"}'),
    signQmRequest(secret, 1800000000, "POST", "/v1/turns", '{"text":"hi"}'),
    signQmRequest(secret, 1800000000, "POST", "/v1/turns?async=1", '{"text":"ho"}'),
  ]) expect(changed).not.toBe(golden);
});

type Reply = { status: number; body?: unknown; throws?: boolean };
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit & { headers: Record<string, string> } }[] = [];
  const impl = async (url: URL | string, init: RequestInit & { headers: Record<string, string> }) => {
    calls.push({ url: String(url), init });
    const reply = replies.shift() ?? { status: 500 };
    if (reply.throws) throw new Error("connect ECONNREFUSED secret-host.internal");
    return new Response(reply.body === undefined ? "" : typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body), { status: reply.status });
  };
  return { impl, calls };
}
const SECRET = "client-test-signing-secret-0123456789abcdef";
const client = async (replies: Reply[]) => {
  const { createQmClient } = await load("qm-client.mjs");
  const f = fakeFetch(replies);
  return { qm: createQmClient({ baseUrl: "http://127.0.0.1:18099", signingSecret: SECRET, fetchImpl: f.impl, now: () => 1800000000_000 }), ...f };
};

test("submit sends one signed async turn with a fixed actor and returns only the run id", async () => {
  const { qm, calls } = await client([{ status: 202, body: { status: "queued", runId: RUN } }]);
  expect(await qm.submit({ text: "do the thing", threadRef: "h1-abc" })).toEqual({ ok: true, runId: RUN });
  const call = calls[0];
  const body = JSON.parse(String(call.init.body));
  expect(call.url).toBe("http://127.0.0.1:18099/v1/turns?async=1");
  expect(body).toEqual({ text: "do the thing", surface: "api", actor: { externalId: "veloce-qm-adapter" }, conversation: { kind: "dm", threadRef: "h1-abc" } });
  expect(call.init.headers["x-timestamp"]).toBe("1800000000");
  const { signQmRequest } = await load("qm-client.mjs");
  expect(call.init.headers["x-signature"]).toBe(signQmRequest(SECRET, 1800000000, "POST", "/v1/turns?async=1", String(call.init.body)));
  expect(call.init.headers["x-event-id"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(call)).not.toContain(SECRET); // the secret is used, never sent
});

test("a bad answer from QM, or no answer, is a plain failure that reveals nothing", async () => {
  for (const reply of [{ status: 200, body: { runId: RUN } }, { status: 202, body: { runId: "not-an-id" } }, { status: 202, body: "not json" }, { status: 500 }, { status: 0, throws: true }]) {
    const { qm } = await client([reply]);
    expect(await qm.submit({ text: "x", threadRef: "h1-abc" })).toEqual({ ok: false });
  }
  const { qm } = await client([{ status: 0, throws: true }]);
  expect(JSON.stringify(await qm.getRun(RUN))).not.toContain("secret-host");
});

test("QM runs map to h1 states, and anything not understood is failed, never succeeded", async () => {
  const { mapQmRun, MAX_REPLY_CHARS } = await load("qm-client.mjs");
  expect(mapQmRun({ status: "pending" })).toEqual({ state: "queued" });
  expect(mapQmRun({ status: "running" })).toEqual({ state: "running" });
  expect(mapQmRun({ status: "done", result: { status: "ok", reply: "hello" } })).toEqual({ state: "succeeded", reply: "hello" });
  expect(mapQmRun({ status: "done", result: { status: "ok", reply: "x".repeat(MAX_REPLY_CHARS + 5) } }).reply).toHaveLength(MAX_REPLY_CHARS);
  expect(mapQmRun({ status: "done", result: { status: "aborted" } })).toEqual({ state: "cancelled" });
  expect(mapQmRun({ status: "done", result: { status: "cancelled" } })).toEqual({ state: "cancelled" });
  for (const odd of [{ status: "failed" }, { status: "done" }, { status: "done", result: { status: "refused" } }, { status: "exploded" }, {}, null, "ok", 7]) {
    expect(mapQmRun(odd)).toEqual({ state: "failed" });
  }
});

test("getRun and abort refuse a malformed id without calling QM, and report not found and terminal runs", async () => {
  const { qm, calls } = await client([]);
  expect(await qm.getRun("../../admin")).toEqual({ ok: false, notFound: true });
  expect(await qm.abort("not-an-id")).toEqual({ ok: false, notFound: true });
  expect(calls).toHaveLength(0);
  const a = await client([{ status: 404, body: { error: "not_found" } }, { status: 404 }]);
  expect(await a.qm.getRun(RUN)).toEqual({ ok: false, notFound: true });
  expect(await a.qm.abort(RUN)).toEqual({ ok: false, notFound: true });
  const b = await client([{ status: 200, body: { accepted: true } }, { status: 409, body: { accepted: false, reason: "terminal" } }, { status: 500 }]);
  expect(await b.qm.abort(RUN)).toEqual({ ok: true, accepted: true });
  expect(await b.qm.abort(RUN)).toEqual({ ok: true, accepted: false });
  expect(await b.qm.abort(RUN)).toEqual({ ok: false });
  expect(b.calls[0].init.body).toBe('{"kind":"abort"}');
});

test("the client refuses an unsafe base URL, a short secret and a bad actor id", async () => {
  const { createQmClient } = await load("qm-client.mjs");
  const ok = { baseUrl: "http://127.0.0.1:18099", signingSecret: SECRET };
  expect(() => createQmClient(ok)).not.toThrow();
  for (const bad of ["not a url", "file:///etc/passwd", "http://user:pw@host.example", "http://host.example/admin"]) expect(() => createQmClient({ ...ok, baseUrl: bad }), bad).toThrow();
  expect(() => createQmClient({ ...ok, signingSecret: "short" })).toThrow();
  expect(() => createQmClient({ ...ok, actorId: "Bad Actor!" })).toThrow();
});

// ---------- manifest ----------

test("the manifest is a valid h1 manifest that promises exactly what the shim serves", () => {
  const parsed = contracts.validateAdapterManifest(manifest);
  expect(parsed).toMatchObject({ adapterId: ADAPTER, sideEffectCeiling: "draft", deletionGuarantee: "none", license: "MIT" });
  expect(parsed.operations).toEqual(["manifest", "health", "task.run", "task.get", "task.cancel"]);
  expect(parsed.tasks).toEqual([{ name: "agent.run", sideEffect: "draft" }]);
  expect(parsed.operations).not.toContain("memory.tombstone"); // QM keeps history, so no deletion promise is made
});

// ---------- token rules ----------

test("tokens minted by the host module verify, and every wrong claim is refused", async () => {
  const { verifyHostToken } = await load("server.mjs");
  const check = (token: unknown, extra: Record<string, unknown> = {}) =>
    verifyHostToken({ token, publicKey: pair.publicKey, tenant: TENANT, adapterId: ADAPTER, operation: "task.run", ...extra });
  const good = mint(["task.run"]);
  expect(check(good)?.aud).toBe(ADAPTER);
  const other = generateKeyPairSync("ed25519");
  expect(check(mint(["task.run"], {}, other.privateKey))).toBeNull(); // another key
  expect(check(good, { tenant: "tenant-b" })).toBeNull();
  expect(check(good, { adapterId: "someone-else" })).toBeNull();
  expect(check(good, { operation: "task.cancel" })).toBeNull(); // operation not in scope
  const t0 = Math.floor(Date.now() / 1000);
  expect(check(mint(["task.run"], { now: t0 - 400, ttlSeconds: 60 }))).toBeNull(); // expired
  expect(check(mint(["task.run"], { now: t0 + 600 }))).toBeNull(); // not valid yet
  const [body, sig] = good.split(".");
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  const edited = Buffer.from(JSON.stringify({ ...claims, scope: ["task.run", "task.cancel"] })).toString("base64url");
  expect(check(`${edited}.${sig}`)).toBeNull(); // edited after signing
  for (const bad of [undefined, null, 5, "", "a", "a.b", `${body}.`, "x".repeat(5000)]) expect(check(bad)).toBeNull();
});

test("a token whose lifetime is over five minutes is refused even when correctly signed", async () => {
  const { verifyHostToken } = await load("server.mjs");
  const t0 = Math.floor(Date.now() / 1000);
  const claims = { v: "h1", iss: "veloce-host", tenant: TENANT, aud: ADAPTER, scope: ["task.run"], jti: "22222222-2222-4222-8222-222222222222", iat: t0, exp: t0 + 301 };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const token = `${body}.${sign(null, Buffer.from(body, "utf8"), pair.privateKey).toString("base64url")}`;
  expect(verifyHostToken({ token, publicKey: pair.publicKey, tenant: TENANT, adapterId: ADAPTER, operation: "task.run" })).toBeNull();
});

test("a token id can be used once; a full store refuses instead of forgetting", async () => {
  const { createJtiStore } = await load("server.mjs");
  let now = 1000;
  const store = createJtiStore(() => now);
  const claims = (n: number, exp: number) => ({ jti: `jti-${n}`, exp });
  expect(store.consume(claims(1, 1100))).toBe(true);
  expect(store.consume(claims(1, 1100))).toBe(false);
  now = 1200; // the first one has expired and is forgotten, which is safe because an expired token no longer verifies
  expect(store.consume(claims(1, 1300))).toBe(true);
  for (let i = 100; i < 100 + 10_000; i += 1) store.consume(claims(i, 5000));
  expect(store.consume(claims(99_999, 5000))).toBe(false);
});

// ---------- the HTTP surface ----------

type FakeQm = { submitted: unknown[]; health: () => Promise<boolean>; submit: (i: unknown) => Promise<unknown>; getRun: (id: string) => Promise<unknown>; abort: (id: string) => Promise<unknown> };
function fakeQm(over: Partial<FakeQm> = {}): FakeQm {
  const qm: FakeQm = {
    submitted: [],
    health: async () => true,
    submit: async (input) => { qm.submitted.push(input); return { ok: true, runId: RUN }; },
    getRun: async () => ({ ok: true, state: "succeeded", reply: "done" }),
    abort: async () => ({ ok: true, accepted: true }),
    ...over,
  };
  return qm;
}

type CallOptions = { scope?: string[]; token?: string | null; body?: unknown; raw?: string };
type Json = { ok?: boolean; error?: string; taskId?: string; state?: string; reply?: string; cancelled?: boolean; replay?: boolean };
type Call = (method: string, route: string, o?: CallOptions) => Promise<{ status: number; json: Json }>;
async function withShim(qm: FakeQm, run: (call: Call) => Promise<void>) {
  const { createQmAdapterHandler, createJtiStore } = await load("server.mjs");
  const store = createJtiStore();
  const handle = createQmAdapterHandler({ manifest, publicKey: pair.publicKey, tenantSlug: TENANT, qm, consumeJti: (c: unknown) => store.consume(c) });
  const server: Server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const opFor = (route: string) => route.split("?")[0].replace("/h1/", "");
  const call: Call = async (method, route, o = {}) => {
    const token = o.token === undefined ? mint(o.scope ?? [opFor(route)]) : o.token;
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      body: o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body)),
    });
    return { status: res.status, json: ((await res.json().catch(() => null)) ?? {}) as Json };
  };
  try {
    await run(call);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const runBody = (extra: Record<string, unknown> = {}) => ({ tenantSlug: TENANT, adapterId: ADAPTER, task: "agent.run", idempotencyKey: KEY, budgetMaxMicros: 5000, input: { text: "summarise the notes" }, ...extra });

test("every route needs a valid host token, a replayed token is refused, and every refusal looks the same", async () => {
  await withShim(fakeQm(), async (call) => {
    const none = await call("GET", "/h1/manifest", { token: null });
    const forged = await call("GET", "/h1/manifest", { token: mint(["manifest"], {}, generateKeyPairSync("ed25519").privateKey) });
    const wrongOp = await call("GET", "/h1/manifest", { scope: ["health"] });
    expect([none.status, forged.status, wrongOp.status]).toEqual([401, 401, 401]);
    expect(none.json).toEqual(forged.json);
    expect(none.json).toEqual(wrongOp.json);
    const token = mint(["manifest"]);
    expect((await call("GET", "/h1/manifest", { token })).status).toBe(200);
    expect((await call("GET", "/h1/manifest", { token })).status).toBe(401); // replay
    expect((await call("GET", "/h1/nothing", { scope: ["manifest"] })).status).toBe(404);
    expect((await call("DELETE", "/h1/manifest")).status).toBe(404);
  });
});

test("manifest and health work with the right scope, and health reports QM down as 503", async () => {
  await withShim(fakeQm(), async (call) => {
    expect((await call("GET", "/h1/manifest")).json).toEqual(manifest);
    expect(await call("GET", "/h1/health")).toMatchObject({ status: 200, json: { ok: true } });
  });
  await withShim(fakeQm({ health: async () => false }), async (call) => {
    expect(await call("GET", "/h1/health")).toMatchObject({ status: 503, json: { ok: false } });
  });
});

test("task.run starts one QM run for the configured tenant and refuses everything outside the contract", async () => {
  const qm = fakeQm();
  await withShim(qm, async (call) => {
    const started = await call("POST", "/h1/task.run", { body: runBody() });
    expect(started).toMatchObject({ status: 202, json: { ok: true, taskId: RUN, state: "queued" } });
    expect(qm.submitted).toEqual([{ text: "summarise the notes", threadRef: expect.stringMatching(/^h1-[0-9a-f]{32}$/) }]);

    const refused: [Record<string, unknown>, number, string][] = [
      [{ tenantSlug: "tenant-b" }, 403, "forbidden"],
      [{ adapterId: "someone-else" }, 403, "forbidden"],
      [{ task: "publish.post" }, 400, "unknown_task"],
      [{ idempotencyKey: "short" }, 400, "invalid_input"],
      [{ budgetMaxMicros: 0 }, 400, "invalid_input"],
      [{ budgetMaxMicros: 1.5 }, 400, "invalid_input"],
      [{ input: { text: "   " } }, 400, "invalid_input"],
      [{ input: { text: "x".repeat(20_001) } }, 400, "invalid_input"],
      [{ input: "text" }, 400, "invalid_input"],
    ];
    for (const [over, status, error] of refused) {
      const result = await call("POST", "/h1/task.run", { body: runBody({ idempotencyKey: `${KEY}-${Math.random().toString(36).slice(2)}`, ...over }) });
      expect([result.status, result.json.error], JSON.stringify(over)).toEqual([status, error]);
    }
    expect((await call("POST", "/h1/task.run", { raw: "{not json" })).status).toBe(400);
    expect((await call("POST", "/h1/task.run", { raw: JSON.stringify({ pad: "x".repeat(70_000) }) })).status).toBe(413);
    expect(qm.submitted).toHaveLength(1); // none of the refused calls reached QM
  });
});

test("the same idempotency key with the same body is one run; with a different body it is a conflict", async () => {
  const qm = fakeQm();
  await withShim(qm, async (call) => {
    expect((await call("POST", "/h1/task.run", { body: runBody() })).status).toBe(202);
    const again = await call("POST", "/h1/task.run", { body: runBody() });
    expect(again).toMatchObject({ status: 200, json: { taskId: RUN, replay: true } });
    const different = await call("POST", "/h1/task.run", { body: runBody({ input: { text: "something else" } }) });
    expect([different.status, different.json.error]).toEqual([409, "idempotency_conflict"]);
    const dearer = await call("POST", "/h1/task.run", { body: runBody({ budgetMaxMicros: 9999 }) });
    expect(dearer.status).toBe(409);
    expect(qm.submitted).toHaveLength(1);
  });
});

test("task.get and task.cancel pass through the mapped state, and report missing runs", async () => {
  await withShim(fakeQm(), async (call) => {
    expect(await call("GET", `/h1/task.get?id=${RUN}`)).toMatchObject({ status: 200, json: { taskId: RUN, state: "succeeded", reply: "done" } });
    expect((await call("GET", "/h1/task.get?id=not-an-id")).status).toBe(400);
    expect((await call("GET", "/h1/task.get")).status).toBe(400);
    expect(await call("POST", "/h1/task.cancel", { body: { id: RUN } })).toMatchObject({ status: 200, json: { taskId: RUN, cancelled: true } });
    expect((await call("POST", "/h1/task.cancel", { body: { id: "../x" } })).status).toBe(400);
  });
  await withShim(fakeQm({ getRun: async () => ({ ok: false, notFound: true }), abort: async () => ({ ok: true, accepted: false }) }), async (call) => {
    expect((await call("GET", `/h1/task.get?id=${RUN}`)).status).toBe(404);
    expect((await call("POST", "/h1/task.cancel", { body: { id: RUN } })).json.cancelled).toBe(false); // already finished
  });
});

test("when QM fails or throws, the caller gets a short generic error and never QM's text", async () => {
  await withShim(fakeQm({ submit: async () => ({ ok: false }), getRun: async () => ({ ok: false }), abort: async () => ({ ok: false }) }), async (call) => {
    for (const result of [await call("POST", "/h1/task.run", { body: runBody() }), await call("GET", `/h1/task.get?id=${RUN}`), await call("POST", "/h1/task.cancel", { body: { id: RUN } })]) {
      expect([result.status, result.json.error]).toEqual([502, "upstream_unavailable"]);
    }
  });
  await withShim(fakeQm({ submit: async () => { throw new Error("password=hunter2 at db.internal:5432"); } }), async (call) => {
    const result = await call("POST", "/h1/task.run", { body: runBody() });
    expect([result.status, result.json.error]).toEqual([500, "internal_error"]);
    expect(JSON.stringify(result.json)).not.toContain("hunter2");
  });
});
