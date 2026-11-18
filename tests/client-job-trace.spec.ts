import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { clientJobTraceSnapshot, safeClientJobTrace, traceClientJobStage, withClientJobTrace } from "../src/lib/clientJobTrace";
import { runClientTextAdapter } from "../src/lib/clientProviderAdapter";
import { clientRetentionExpiresAt } from "../src/lib/clientRetention";
import { loadReviewModule } from "./helpers/load-review-module";

const jobId = "00000000-0000-4000-8000-000000000001";
const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;
test.afterEach(() => { process.env = { ...savedEnv }; globalThis.fetch = savedFetch; });

test("job trace records bounded stages without prompt, output, or credential data", async () => {
  const trace = await withClientJobTrace(jobId, async () => {
    await traceClientJobStage("claim", async () => ({ ok: true, secret: "never-persist" }), (result) => result.ok);
    await traceClientJobStage("provider_call", async () => ({ ok: false, prompt: "private-prompt" }), (result) => result.ok);
    return clientJobTraceSnapshot(jobId);
  });
  expect(trace?.spans.map((span) => [span.stage, span.outcome])).toEqual([["claim", "ok"], ["provider_call", "error"]]);
  expect(trace?.totalDurationMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(trace)).not.toMatch(/never-persist|private-prompt/);
  const untrusted = { ...trace, prompt: "private-prompt", spans: trace?.spans.map((span) => ({ ...span, apiKey: "never-persist" })) };
  expect(JSON.stringify(safeClientJobTrace(untrusted, jobId))).not.toMatch(/never-persist|private-prompt/);
  expect(safeClientJobTrace(untrusted, "00000000-0000-4000-8000-000000000002")).toBeNull();
  expect(safeClientJobTrace({ ...trace, spans: [{ stage: "claim", offsetMs: 0, durationMs: 1, outcome: { toString: "ok" } }] }, jobId)).toBeNull();
  expect(safeClientJobTrace({ ...trace, jobId: "------------------------------------" }, "------------------------------------")).toBeNull();
});

test("parallel job traces stay isolated and cap long multi-agent runs", async () => {
  const otherId = "00000000-0000-4000-8000-000000000002";
  const [first, second] = await Promise.all([
    withClientJobTrace(jobId, async () => {
      for (let i = 0; i < 35; i++) await traceClientJobStage("provider_call", async () => true);
      return clientJobTraceSnapshot(jobId);
    }),
    withClientJobTrace(otherId, async () => {
      await traceClientJobStage("artifact_upload", async () => true);
      return clientJobTraceSnapshot(otherId);
    }),
  ]);
  expect(first).toMatchObject({ jobId, truncated: true });
  expect(first?.spans).toHaveLength(32);
  expect(second).toMatchObject({ jobId: otherId, truncated: false });
  expect(second?.spans.map((span) => span.stage)).toEqual(["artifact_upload"]);
  expect(clientJobTraceSnapshot(jobId)).toBeNull();
});

test("worker RPC and provider adapter add stages without sending real requests", async () => {
  Object.assign(process.env, {
    VELOCE_CLIENT_EDITION: "1", SUPABASE_URL: "https://db.invalid", SUPABASE_ANON_KEY: "anon", CLIENT_SLUG: "tenant-a",
    CLIENT_WORKER_TOKEN: "worker-token-at-least-24-characters", OPENAI_API_KEY: "test-only-provider-credential",
    CLIENT_PROVIDER_CALLS_ENABLED: "1", CLIENT_PROVIDER_ALLOWLIST: "OPENAI_API_KEY", CLIENT_MODEL_ALLOWLIST: "gpt-4o-mini",
    CLIENT_MODEL_PRICING_JSON: JSON.stringify({ "gpt-4o-mini": { inputMicrosPer1k: 100, outputMicrosPer1k: 100 } }),
  });
  const dataPlane = loadReviewModule("src/lib/clientDataPlane.ts", {
    "@/lib/clientAuth": { supabaseAuthConfig: () => ({ url: "https://db.invalid", key: "anon" }) },
    "@/lib/clientRuntimeObservability": {},
    "@/lib/capabilityTraits": {},
    "@/lib/clientJobTrace": { traceClientJobStage },
  });
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    if (path === "/rest/v1/rpc/claim_client_runtime_job") return Response.json({ id: jobId });
    if (path === "/rest/v1/rpc/reserve_client_runtime_budget_worker") return Response.json(true);
    if (path === "/rest/v1/rpc/client_provider_execution_allowed") return Response.json(true);
    if (path === "/v1/chat/completions") return Response.json({ choices: [{ message: { content: "Approved result" }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 3 } });
    throw new Error(`Unexpected test request: ${path}`);
  };
  const result = await withClientJobTrace(jobId, async () => {
    await dataPlane.workerRpc("claim_client_runtime_job", { p_job_id: jobId });
    await dataPlane.workerRpc("reserve_client_runtime_budget_worker", { p_job_id: jobId });
    const provider = await runClientTextAdapter({ provider: "openai", model: "gpt-4o-mini", prompt: "Hello", reserveBudget: false, jobId });
    return { provider, trace: clientJobTraceSnapshot(jobId) };
  });
  expect(result.provider).toMatchObject({ ok: true, output: "Approved result" });
  expect(result.trace?.spans.map((span) => [span.stage, span.outcome])).toEqual([["claim", "ok"], ["budget_reserve", "ok"], ["provider_call", "ok"]]);
  expect(calls).toEqual(["/rest/v1/rpc/claim_client_runtime_job", "/rest/v1/rpc/reserve_client_runtime_budget_worker", "/rest/v1/rpc/client_provider_execution_allowed", "/v1/chat/completions"]);
  expect(JSON.stringify(result.trace)).not.toMatch(/test-only-provider-credential|Hello|Approved result/);
});

test("worker persists the redacted claim trace when a claimed job fails admission", async () => {
  process.env.CLIENT_RUNTIME_WORKER_ENABLED = "1";
  process.env.CLIENT_WORKER_TOKEN = "test-worker-token-at-least-24-characters";
  process.env.CLIENT_SLUG = "tenant-a";
  const source = readFileSync("src/app/api/internal/client-runtime/jobs/route.ts", "utf8");
  const mocks = Object.fromEntries([...source.matchAll(/from "(@\/lib\/[^\"]+)"/g)].map((match) => [match[1], {}])) as Record<string, unknown>;
  let completed: Record<string, unknown> | null = null;
  mocks["next/server"] = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
  mocks["@/lib/clientTaskAuth"] = { validClientTaskIdentity: async () => true };
  mocks["@/lib/clientRetention"] = { clientRetentionExpiresAt };
  mocks["@/lib/clientJobTrace"] = { clientJobTraceSnapshot, traceClientJobStage, withClientJobTrace };
  mocks["@/lib/capabilityTraits"] = { validateTraitBundle: () => ["invalid"] };
  mocks["@/lib/clientRuntimeObservability"] = { logClientRuntimeEvent: () => undefined };
  mocks["@/lib/clientDataPlane"] = {
    workerRpc: async (name: string, body: Record<string, unknown>) => {
      if (name === "claim_client_runtime_job") return traceClientJobStage("claim", async () => ({ ok: true, value: { id: jobId, capability: "text-agents", input_metadata: { __veloceTraits: { key: "private-prompt" } } } }));
      if (name === "complete_client_runtime_job") { completed = body; return { ok: true, value: true }; }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  const route = loadReviewModule("src/app/api/internal/client-runtime/jobs/route.ts", mocks);
  const response = await route.POST(new Request("https://tenant.invalid/api/internal/client-runtime/jobs", { method: "POST", body: JSON.stringify({ jobId, tenantSlug: "tenant-a" }) }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "failed" });
  const trace = (completed as Record<string, unknown> | null)?.p_output_metadata as Record<string, unknown> | undefined;
  expect(trace?.__veloceExecutionTrace).toMatchObject({ jobId, spans: [{ stage: "claim", outcome: "ok" }] });
  expect(JSON.stringify(trace)).not.toContain("private-prompt");
});
