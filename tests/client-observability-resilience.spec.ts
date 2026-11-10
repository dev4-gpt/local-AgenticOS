import { expect, test } from "@playwright/test";
import { clientJobTraceSnapshot, safeClientJobTrace, traceClientJobStage, withClientJobTrace } from "../src/lib/clientJobTrace";
import { logClientRuntimeEvent } from "../src/lib/clientRuntimeObservability";
import { readFileSync } from "node:fs";
import { loadReviewModule } from "./helpers/load-review-module";
import { clientRetentionExpiresAt } from "../src/lib/clientRetention";

const jobId = "00000000-0000-4000-8000-000000000001";
const savedEnv = { ...process.env };
const savedInfo = console.info;
const savedFetch = globalThis.fetch;
test.afterEach(() => { process.env = { ...savedEnv }; console.info = savedInfo; globalThis.fetch = savedFetch; });

test("trace outcome-observer failure cannot replace a successful operation result", async () => {
  const result = await withClientJobTrace(jobId, async () => {
    const value = await traceClientJobStage("budget_settle", async () => "durably-settled", () => { throw new Error("private-observer-error"); });
    return { value, trace: clientJobTraceSnapshot(jobId) };
  });
  expect(result.value).toBe("durably-settled");
  expect(result.trace).toMatchObject({ stageSummary: [{ stage: "budget_settle", ok: 0, error: 0, unknown: 1 }],
    spans: [{ stage: "budget_settle", outcome: "unknown" }] });
  expect(JSON.stringify(result.trace)).not.toContain("private-observer-error");
});

test("telemetry console failure cannot turn durable completion into a retry", () => {
  delete process.env.CLIENT_POSTHOG_CAPTURE_ENABLED;
  delete process.env.SENTRY_DSN;
  console.info = () => { throw new Error("log-sink-unavailable"); };
  expect(() => logClientRuntimeEvent("runtime.job_completion_failed", { jobId, status: 503 })).not.toThrow();
});

test("optional vendor failures cannot escape as unhandled rejections", async () => {
  Object.assign(process.env, { CLIENT_POSTHOG_CAPTURE_ENABLED: "1", POSTHOG_API_KEY: "fixture-only-key",
    POSTHOG_HOST: "https://posthog.invalid", SENTRY_DSN: "https://fixture-only-key@sentry.invalid/1" });
  let requests = 0;
  console.info = () => undefined;
  globalThis.fetch = () => { requests++; throw new Error("fixture-vendor-failure"); };
  expect(() => logClientRuntimeEvent("runtime.provider_failed", { tenant: "tenant-a", jobId, status: 503 })).not.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(requests).toBe(2);
});

test("bounded traces retain settlement outcomes after the detailed span limit", async () => {
  const trace = await withClientJobTrace(jobId, async () => {
    for (let index = 0; index < 35; index++) await traceClientJobStage("provider_call", async () => true);
    await traceClientJobStage("budget_settle", async () => false, Boolean);
    return clientJobTraceSnapshot(jobId);
  });
  expect(trace?.spans).toHaveLength(32);
  expect(trace?.spans.at(-1)).toMatchObject({ stage: "budget_settle", outcome: "error" });
  expect(trace).toMatchObject({ version: 2, truncated: true,
    stageSummary: [{ stage: "provider_call", ok: 35, error: 0, unknown: 0 }, { stage: "budget_settle", ok: 0, error: 1, unknown: 0 }] });
  expect(safeClientJobTrace(trace, jobId)).toEqual(trace);
});

test("operation errors retain their exact identity and are never swallowed by tracing", async () => {
  const failure = new Error("private-provider-error");
  const trace = await withClientJobTrace(jobId, async () => {
    await expect(traceClientJobStage("provider_call", async () => { throw failure; })).rejects.toBe(failure);
    return clientJobTraceSnapshot(jobId);
  });
  expect(trace).toMatchObject({ inFlight: 0, stageSummary: [{ stage: "provider_call", ok: 0, error: 1, unknown: 0 }] });
  expect(JSON.stringify(trace)).not.toContain(failure.message);
});

test("trace snapshots cannot mutate later persisted spans or summaries", async () => {
  await withClientJobTrace(jobId, async () => {
    await traceClientJobStage("claim", async () => true);
    const first = clientJobTraceSnapshot(jobId)!;
    first.spans[0].outcome = "error";
    first.stageSummary![0].ok = 999;
    const next = clientJobTraceSnapshot(jobId)!;
    expect(next.spans[0].outcome).toBe("ok");
    expect(next.stageSummary![0].ok).toBe(1);
    expect(safeClientJobTrace(next, jobId)).toEqual(next);
  });
});

test("concurrent and nested work reports in-flight stages without claiming their outcome", async () => {
  await withClientJobTrace(jobId, async () => {
    await traceClientJobStage("claim", async () => {
      expect(clientJobTraceSnapshot(jobId)).toMatchObject({ inFlight: 1, stageSummary: [], spans: [] });
      await traceClientJobStage("budget_reserve", async () => true);
      expect(clientJobTraceSnapshot(jobId)).toMatchObject({ inFlight: 1, stageSummary: [{ stage: "budget_reserve", ok: 1 }] });
    });
    const trace = clientJobTraceSnapshot(jobId)!;
    expect(trace.inFlight).toBe(0);
    expect(safeClientJobTrace(trace, jobId)).toEqual(trace);
  });
});

test("trace reader rejects impossible timelines, summary drift, duplicates and overflow", async () => {
  const trace = await withClientJobTrace(jobId, async () => {
    await traceClientJobStage("claim", async () => true);
    return clientJobTraceSnapshot(jobId)!;
  });
  const invalid = [
    { ...trace, spans: [{ ...trace.spans[0], offsetMs: trace.totalDurationMs + 1 }] },
    { ...trace, stageSummary: undefined },
    { ...trace, stageSummary: [{ stage: "claim", ok: 0, error: 1, unknown: 0 }] },
    { ...trace, stageSummary: [trace.stageSummary![0], trace.stageSummary![0]] },
    { ...trace, stageSummary: [{ stage: "claim", ok: 1_000_001, error: 0, unknown: 0 }] },
    { ...trace, stageSummary: [{ stage: "private-source-text", ok: 1, error: 0, unknown: 0 }] },
    { ...trace, inFlight: -1 }, { ...trace, truncated: true }, { ...trace, summaryTruncated: true },
  ];
  for (const value of invalid) expect(safeClientJobTrace(value, jobId)).toBeNull();
  const untrusted = { ...trace, privateText: "private-source-text", stageSummary: trace.stageSummary!.map((item) => ({ ...item, token: "private-token" })) };
  expect(JSON.stringify(safeClientJobTrace(untrusted, jobId))).not.toMatch(/private-source-text|private-token/);
  const legacy = { version: 1, jobId, totalDurationMs: 5, truncated: false, spans: [{ stage: "claim", offsetMs: 0, durationMs: 5, outcome: "ok" }] };
  expect(safeClientJobTrace(legacy, jobId)).toEqual(legacy);
  expect(safeClientJobTrace({ ...legacy, spans: [{ ...legacy.spans[0], outcome: "unknown" }] }, jobId)).toBeNull();
});

test("legacy independently rounded timing allows one millisecond without weakening version two", () => {
  const span = { stage: "claim", offsetMs: Math.round(0.6), durationMs: Math.round(1.2 - 0.6), outcome: "ok" };
  const legacy = { version: 1, jobId, totalDurationMs: Math.round(1.2), truncated: false, spans: [span] };
  expect(safeClientJobTrace(legacy, jobId)).toEqual(legacy);
  expect(safeClientJobTrace({ ...legacy, spans: [{ ...span, durationMs: 2 }] }, jobId)).toBeNull();
  expect(safeClientJobTrace({ ...legacy, spans: [{ ...span, offsetMs: 2, durationMs: 0 }] }, jobId)).toBeNull();
  expect(safeClientJobTrace({ ...legacy, version: 2, summaryTruncated: false, inFlight: 0,
    stageSummary: [{ stage: "claim", ok: 1, error: 0, unknown: 0 }],
  }, jobId)).toBeNull();
});

test("parallel summaries remain isolated even after one trace exceeds its detail limit", async () => {
  const otherId = "00000000-0000-4000-8000-000000000002";
  const [first, second] = await Promise.all([
    withClientJobTrace(jobId, async () => {
      for (let index = 0; index < 40; index++) await traceClientJobStage("provider_call", async () => true);
      await traceClientJobStage("budget_settle", async () => false, Boolean);
      return clientJobTraceSnapshot(jobId)!;
    }),
    withClientJobTrace(otherId, async () => {
      await traceClientJobStage("artifact_confirm", async () => true);
      return clientJobTraceSnapshot(otherId)!;
    }),
  ]);
  expect(first.stageSummary).toEqual([{ stage: "provider_call", ok: 40, error: 0, unknown: 0 }, { stage: "budget_settle", ok: 0, error: 1, unknown: 0 }]);
  expect(second.stageSummary).toEqual([{ stage: "artifact_confirm", ok: 1, error: 0, unknown: 0 }]);
  expect(clientJobTraceSnapshot(jobId)).toBeNull();
});

test("observability exposes validated late-stage summaries and drops tampered trace evidence", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const trace = await withClientJobTrace(jobId, async () => {
    for (let index = 0; index < 35; index++) await traceClientJobStage("provider_call", async () => true);
    await traceClientJobStage("budget_settle", async () => false, Boolean);
    return clientJobTraceSnapshot(jobId)!;
  });
  let stored = { ...trace, prompt: "private-source-content" };
  const route = loadReviewModule("src/app/api/client-runtime/observability/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "fixture-member" }), currentClientMember: async () => true },
    "@/lib/clientJobTrace": { safeClientJobTrace },
    "@/lib/clientInputSafety": { containsClientSecretLike: () => false },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      countClientRecords: async () => ({ ok: true, count: 0 }),
      selectClientRecords: async (table: string) => ({ ok: true, records: table === "client_runtime_jobs" ? [{
        id: jobId, tenant_slug: "tenant-a", status: "failed", output_metadata: { __veloceExecutionTrace: stored },
      }] : [] }),
    },
  });
  const response = await route.GET();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.recentJobs[0].trace).toEqual(trace);
  expect(JSON.stringify(body)).not.toContain("private-source-content");
  stored = { ...stored, stageSummary: [{ stage: "budget_settle", ok: 1, error: 0, unknown: 0 }] };
  expect((await (await route.GET()).json()).recentJobs[0].trace).toBeNull();
});

test("a real worker completion remains durable when the optional console sink fails", async () => {
  Object.assign(process.env, { CLIENT_RUNTIME_WORKER_ENABLED: "1", CLIENT_WORKER_TOKEN: "fixture-worker-token-at-least-24-characters", CLIENT_SLUG: "tenant-a" });
  delete process.env.CLIENT_POSTHOG_CAPTURE_ENABLED;
  delete process.env.SENTRY_DSN;
  const source = readFileSync("src/app/api/internal/client-runtime/jobs/route.ts", "utf8");
  const mocks = Object.fromEntries([...source.matchAll(/from "(@\/lib\/[^\"]+)"/g)].map((match) => [match[1], {}])) as Record<string, unknown>;
  let completed = 0;
  mocks["next/server"] = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
  mocks["@/lib/clientTaskAuth"] = { validClientTaskIdentity: async () => true };
  mocks["@/lib/clientRetention"] = { clientRetentionExpiresAt };
  mocks["@/lib/clientJobTrace"] = { clientJobTraceSnapshot, traceClientJobStage, withClientJobTrace };
  mocks["@/lib/capabilityTraits"] = { validateTraitBundle: () => ["invalid"] };
  mocks["@/lib/clientRuntimeObservability"] = { logClientRuntimeEvent };
  mocks["@/lib/clientDataPlane"] = { workerRpc: async (name: string, body: Record<string, unknown>) => {
    if (name === "claim_client_runtime_job") return traceClientJobStage("claim", async () => ({ ok: true, value: { id: jobId, capability: "text-agents", input_metadata: {} } }));
    if (name === "complete_client_runtime_job") {
      completed++;
      expect(body.p_status).toBe("failed");
      expect(body.p_output_metadata).toMatchObject({ __veloceExecutionTrace: { version: 2, stageSummary: [{ stage: "claim", ok: 1 }] } });
      return { ok: true, value: true };
    }
    throw new Error("unexpected worker request");
  } };
  console.info = () => { throw new Error("sink-unavailable"); };
  const route = loadReviewModule("src/app/api/internal/client-runtime/jobs/route.ts", mocks);
  const response = await route.POST(new Request("https://fixture.invalid/api/internal/client-runtime/jobs", {
    method: "POST", body: JSON.stringify({ jobId, tenantSlug: "tenant-a" }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "failed" });
  expect(completed).toBe(1);
});
