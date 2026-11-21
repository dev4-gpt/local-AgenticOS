import { expect, test } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { loadReviewModule } from "./helpers/load-review-module";

// Reading an adapter task's state and result for the Adapters page (ADR-020): single-use host tokens with one operation each,
// https only, no redirects, a size cap, and only a short whitelisted summary back; never the proposal's code. Everything is made up.
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const tokens = loadReviewModule("src/lib/adapterTokens.ts", { "./adapterContracts": contracts });
const grants = loadReviewModule("src/lib/adapterModelGrant.ts", { "./adapterContracts": contracts, "./adapterTokens": tokens });
const guard = loadReviewModule("src/lib/adapterMemoryGuard.ts", { "./adapterContracts": contracts });
const puller = loadReviewModule("src/lib/adapterEventsPuller.ts", { "./adapterContracts": contracts, "./adapterMemoryGuard": guard });
const request = loadReviewModule("src/lib/adapterTaskRequest.ts", { "./adapterContracts": contracts, "./adapterModelGrant": grants });
const status = loadReviewModule("src/lib/adapterTaskStatus.ts", {
  "./adapterContracts": contracts, "./adapterTokens": tokens, "./adapterEventsPuller": puller, "./adapterTaskRequest": request,
});

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const TASK = "ft-aaaaaaaaaaaaaaaaaaaaaaaa";
const BASE = "https://proofmint.example.test";
const config = { tenantSlug: "tenant-a", adapterId: "veloce-proofmint", baseUrl: BASE };
const GET_BODY = { ok: true, taskId: TASK, task: "proofmint.round", state: "succeeded", family: "dates", createdAt: "2026-11-10T10:00:00.000Z", spentMicros: 20_010 };
const RESULT_BODY = { ok: true, taskId: TASK, verdict: "proposed", needsApproval: true, toolId: "t-dates-r-1", candidateSha: "a".repeat(64), code: "def normalize(raw):\n    return 'SECRET-CODE'\n", costMicros: 20_010, visible: { candidate: 12, total: 12 }, heldout: { candidate: 10, total: 10 } };

function fakeAdapter(o: { get?: () => Response | Promise<Response>; result?: () => Response | Promise<Response> } = {}) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    if (url.startsWith(`${BASE}/h1/task.get`)) return o.get ? o.get() : Response.json(GET_BODY);
    if (url.startsWith(`${BASE}/h1/task.result`)) return o.result ? o.result() : Response.json(RESULT_BODY);
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}
const ops: string[] = [];
const mintToken = (operation: string) => { ops.push(operation); return `token-${operation}-${ops.length}`; };

// ---- reading one task ----

test("a finished task is read with one task.get and one task.result token, and only a short summary comes back", async () => {
  ops.length = 0;
  const a = fakeAdapter();
  const result = await status.fetchTaskStatus(config, { mintToken, fetchImpl: a.fetchImpl }, TASK);
  expect(result).toEqual({
    ok: true,
    summary: { taskId: TASK, state: "succeeded", spentMicros: 20_010, result: { verdict: "proposed", needsApproval: true, candidateSha: "a".repeat(64), costMicros: 20_010, visible: { candidate: 12, total: 12 }, heldout: { candidate: 10, total: 10 } } },
  });
  expect(JSON.stringify(result)).not.toContain("SECRET-CODE"); // the proposal's code stays in the adapter
  expect(a.seen.map((s) => s.url)).toEqual([`${BASE}/h1/task.get?id=${TASK}`, `${BASE}/h1/task.result?id=${TASK}`]);
  expect(ops).toEqual(["task.get", "task.result"]);
  expect(a.seen.map((s) => (s.init.headers as Record<string, string>).authorization)).toEqual(["Bearer token-task.get-1", "Bearer token-task.result-2"]);
  expect(a.seen.every((s) => s.init.redirect === "manual" && s.init.method === "GET")).toBe(true);
});

test("a task that has not succeeded is read with task.get only, and keeps only a short error code", async () => {
  for (const [state, extra] of [["running", {}], ["queued", {}], ["failed", { error: "timed_out", spentMicros: 250_000 }], ["cancelled", {}]] as [string, Record<string, unknown>][]) {
    ops.length = 0;
    const a = fakeAdapter({ get: () => Response.json({ ...GET_BODY, state, spentMicros: undefined, ...extra }) });
    const result = await status.fetchTaskStatus(config, { mintToken, fetchImpl: a.fetchImpl }, TASK);
    expect(result, state).toEqual({ ok: true, summary: { taskId: TASK, state, ...extra } });
    expect(ops, state).toEqual(["task.get"]);
  }
  // an error that is not a short code is left out rather than shown
  const a = fakeAdapter({ get: () => Response.json({ ...GET_BODY, state: "failed", error: "The provider said <b>no</b>" }) });
  expect(await status.fetchTaskStatus(config, { mintToken, fetchImpl: a.fetchImpl }, TASK)).toEqual({ ok: true, summary: { taskId: TASK, state: "failed", spentMicros: 20_010 } });
});

test("a result the summary cannot use is left out, and the task's state is still shown", async () => {
  for (const reply of [() => new Response("{}", { status: 500 }), () => new Response("not json"), () => Response.json({ ok: true, taskId: "ft-other0000000000000000000", verdict: "proposed" }), () => { throw new Error("down"); }]) {
    const a = fakeAdapter({ result: reply as () => Response });
    expect(await status.fetchTaskStatus(config, { mintToken, fetchImpl: a.fetchImpl }, TASK)).toEqual({ ok: true, summary: { taskId: TASK, state: "succeeded", spentMicros: 20_010, resultUnavailable: true } });
  }
  // fields of the wrong shape are dropped one by one, never passed on
  const a = fakeAdapter({ result: () => Response.json({ ok: true, taskId: TASK, verdict: "<b>x</b>", needsApproval: "yes", candidateSha: "short", costMicros: -1, visible: { candidate: "12", total: 12 }, heldout: [1] }) });
  expect(await status.fetchTaskStatus(config, { mintToken, fetchImpl: a.fetchImpl }, TASK)).toEqual({ ok: true, summary: { taskId: TASK, state: "succeeded", spentMicros: 20_010, result: {} } });
});

test("an adapter that refuses, redirects, is unreachable, answers badly or too much fails with a reason only", async () => {
  const cases: [() => Response | Promise<Response>, string][] = [
    [() => new Response("{}", { status: 404 }), "not_found"],
    [() => new Response("{}", { status: 503 }), "adapter_refused"],
    [() => new Response(null, { status: 302, headers: { location: "https://elsewhere.test" } }), "redirect_refused"],
    [() => { throw new Error("down"); }, "adapter_unreachable"],
    [() => new Response("not json"), "bad_response"],
    [() => Response.json({ ...GET_BODY, taskId: "ft-other0000000000000000000" }), "bad_response"],
    [() => Response.json({ ...GET_BODY, ok: false }), "bad_response"],
    [() => Response.json({ ...GET_BODY, state: "weird" }), "bad_response"],
    [() => Response.json({ ...GET_BODY, spentMicros: -5 }), "bad_response"],
    [() => new Response("x".repeat(70_000)), "too_large"],
  ];
  for (const [reply, reason] of cases) {
    const a = fakeAdapter({ get: reply });
    expect(await status.fetchTaskStatus(config, { mintToken, fetchImpl: a.fetchImpl }, TASK), reason).toEqual({ ok: false, reason });
  }
  const a = fakeAdapter();
  expect(await status.fetchTaskStatus(config, { mintToken, fetchImpl: a.fetchImpl }, "bad/id")).toEqual({ ok: false, reason: "invalid_task" });
  expect(a.seen).toHaveLength(0);
  await expect(status.fetchTaskStatus({ ...config, baseUrl: "http://proofmint.example.test" }, { mintToken, fetchImpl: a.fetchImpl }, TASK)).rejects.toThrow();
  // a bad address in the host's own setting is refused before the task id is even looked at
  await expect(status.fetchTaskStatus({ ...config, baseUrl: "http://proofmint.example.test" }, { mintToken, fetchImpl: a.fetchImpl }, "bad/id")).rejects.toThrow();
});

// ---- the page's read: options and recent rounds, or one task ----

const TASKS = JSON.stringify({ "veloce-proofmint": { tasks: ["proofmint.round"], budgetMaxMicros: 250_000, ownSpend: true, input: { field: "family", choices: ["dates", "money"] } } });
const ENDPOINTS = JSON.stringify({ "veloce-proofmint": BASE });
function readDeps(o: { manager?: boolean; env?: Record<string, unknown>; recent?: unknown; fetchImpl?: typeof fetch } = {}) {
  return {
    env: { tenantSlug: "tenant-a", privateKey, tasksJson: TASKS, endpointsJson: ENDPOINTS, allowLoopback: false, ...o.env },
    isManager: async () => o.manager ?? false,
    readRecent: async () => (o.recent === undefined ? { ok: true, records: [] } : o.recent),
    fetchImpl: o.fetchImpl ?? fakeAdapter().fetchImpl,
    now: 1_800_000_000,
  };
}
const params = (q: string) => new URLSearchParams(q);

test("without a task, the page gets what it may offer, whether this person may start one, and the recent rounds", async () => {
  const recent = { ok: true, records: [
    { created_at: "2026-11-10T10:00:00.000Z", metadata: { adapter_id: "veloce-proofmint", task: "proofmint.round", task_key: "veloce-proofmint-x", adapter_task_id: TASK, replay: false } },
    { created_at: "2026-11-10T09:00:00.000Z", metadata: { adapter_id: "BAD", task: "proofmint.round", adapter_task_id: TASK, replay: false } },
    { created_at: "2026-11-10T08:00:00.000Z", metadata: { adapter_id: "veloce-proofmint", task: "proofmint.round", adapter_task_id: "bad id", replay: false } },
    { created_at: 5, metadata: { adapter_id: "veloce-proofmint", task: "proofmint.round", adapter_task_id: TASK, replay: false } },
    { created_at: "2026-11-10T07:00:00.000Z", metadata: null },
  ] };
  expect(await status.handleAdapterTaskRead(params(""), readDeps({ manager: true, recent }))).toEqual({
    status: 200,
    body: { ok: true, canStart: true, options: [{ adapterId: "veloce-proofmint", task: "proofmint.round", budgetMaxMicros: 250_000, field: "family", choices: ["dates", "money"] }],
      recent: [{ adapterId: "veloce-proofmint", task: "proofmint.round", taskId: TASK, at: "2026-11-10T10:00:00.000Z" }] },
  });
  // a plain member sees the same, but may not start; unreadable recent rounds are null, not empty
  expect((await status.handleAdapterTaskRead(params(""), readDeps({ recent: { ok: false, records: [] } }))).body).toMatchObject({ canStart: false, recent: null });
  // a host without the task setting offers nothing
  expect((await status.handleAdapterTaskRead(params(""), readDeps({ env: { tasksJson: undefined } }))).body).toMatchObject({ options: [] });
});

test("one task's status is read only for a listed adapter, from the host's own address, with fresh tokens", async () => {
  const a = fakeAdapter();
  const answer = await status.handleAdapterTaskRead(params(`adapterId=veloce-proofmint&taskId=${TASK}`), readDeps({ fetchImpl: a.fetchImpl }));
  expect(answer.status).toBe(200);
  expect(answer.body).toMatchObject({ ok: true, taskId: TASK, state: "succeeded", result: { verdict: "proposed" } });
  // the tokens are real host tokens, one operation each, for this tenant and adapter
  const [getToken, resultToken] = a.seen.map((s) => (s.init.headers as Record<string, string>).authorization.replace("Bearer ", ""));
  expect(tokens.verifyAdapterToken({ token: getToken, publicKey, expectedTenant: "tenant-a", expectedAdapterId: "veloce-proofmint", requiredOperation: "task.get", now: 1_800_000_001 }).ok).toBe(true);
  expect(tokens.verifyAdapterToken({ token: getToken, publicKey, expectedTenant: "tenant-a", expectedAdapterId: "veloce-proofmint", requiredOperation: "task.result", now: 1_800_000_001 }).ok).toBe(false);
  expect(tokens.verifyAdapterToken({ token: resultToken, publicKey, expectedTenant: "tenant-a", expectedAdapterId: "veloce-proofmint", requiredOperation: "task.result", now: 1_800_000_001 }).ok).toBe(true);

  for (const [q, code, error] of [
    ["adapterId=veloce-proofmint", 400, "invalid_input"], [`taskId=${TASK}`, 400, "invalid_input"], [`adapterId=veloce-proofmint&taskId=${TASK}&x=1`, 400, "invalid_input"],
    [`adapterId=veloce-proofmint&adapterId=veloce-proofmint&taskId=${TASK}`, 400, "invalid_input"], ["adapterId=veloce-proofmint&taskId=bad%2Fid", 400, "invalid_input"],
    [`adapterId=creator-os&taskId=${TASK}`, 403, "task_not_allowed"], [`adapterId=BAD&taskId=${TASK}`, 400, "invalid_input"],
  ] as [string, number, string][]) {
    const b = fakeAdapter();
    expect(await status.handleAdapterTaskRead(params(q), readDeps({ fetchImpl: b.fetchImpl })), q).toEqual({ status: code, body: { ok: false, error } });
    expect(b.seen, q).toHaveLength(0);
  }
  for (const env of [{ endpointsJson: undefined }, { privateKey: null }]) {
    expect(await status.handleAdapterTaskRead(params(`adapterId=veloce-proofmint&taskId=${TASK}`), readDeps({ env })), JSON.stringify(env)).toEqual({ status: 503, body: { ok: false, error: "host_not_configured" } });
  }
  expect(await status.handleAdapterTaskRead(params(`adapterId=veloce-proofmint&taskId=${TASK}`), readDeps({ env: { tasksJson: undefined } }))).toEqual({ status: 503, body: { ok: false, error: "tasks_not_configured" } });
  for (const [reply, code, error] of [[() => new Response("{}", { status: 404 }), 404, "not_found"], [() => new Response("{}", { status: 500 }), 502, "adapter_unavailable"], [() => { throw new Error("x"); }, 502, "adapter_unavailable"]] as [() => Response, number, string][]) {
    const b = fakeAdapter({ get: reply });
    expect(await status.handleAdapterTaskRead(params(`adapterId=veloce-proofmint&taskId=${TASK}`), readDeps({ fetchImpl: b.fetchImpl })), error).toEqual({ status: code, body: { ok: false, error } });
  }
});
