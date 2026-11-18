import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as traits from "../src/lib/capabilityTraits";
import * as trace from "../src/lib/clientJobTrace";
import * as retention from "../src/lib/clientRetention";
import * as review from "../src/lib/clientArtifactReview";
import * as ruflo from "../src/lib/clientRufloAdapter";
import * as loop from "../src/lib/clientLoopAdapter";
import * as registry from "../src/lib/clientLoopRegistry";
import * as cost from "../src/lib/loopCostLedger";
import * as room from "../src/lib/clientRoomAdapter";
import { loadReviewModule } from "./helpers/load-review-module";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

type Row = Record<string, unknown>;
const jobId = "00000000-0000-4000-8000-000000000001";
const artifactId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000003";
const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;
test.beforeEach(() => {
  Object.assign(process.env, { CLIENT_SLUG: "tenant-a", CLIENT_RETENTION_DAYS: "28", CLIENT_RUNTIME_WORKER_ENABLED: "1", CLIENT_WORKER_TOKEN: "fixture-worker-token-at-least-24" });
  globalThis.fetch = async () => { throw new Error("Network forbidden in settlement tests"); };
});
test.afterEach(() => { process.env = { ...savedEnv }; globalThis.fetch = savedFetch; });

function harness(capability: "ruflo-swarm" | "loop-run" | "room-round", options: { roomDomainUnavailable?: "before-call" | "after-call" | "after-settlement"; roomDirectives?: boolean; settle?: boolean; actualPerCall?: number; rejectOverrun?: boolean; settlementThrows?: boolean; missingUsageAt?: number; unpriceableAt?: number; failedAt?: number; pricePrompt?: boolean; inflateQuoteAfterCall?: boolean; outputChars?: number; quote?: number } = {}) {
  const input: Row = capability === "ruflo-swarm" ? { objective: "Review a synthetic plan", preset: "seo" }
    : capability === "loop-run" ? { goal: "Review a synthetic plan", maxRounds: 1, builder: { provider: "openai", model: "fixture" }, judge: { provider: "openai", model: "fixture" } }
      : { conversationId, roomCreatedAt: new Date(Date.now()-1000).toISOString(), roomRetentionExpiresAt: new Date(Date.now()+27*86400000).toISOString(), agents: [{ id: "claude", name: "Claude", color: "#444444", provider: "openai", model: "fixture" }], transcript: [], contextText: "" };
  const state = { job: { id: jobId, tenant_slug: "tenant-a", requested_by: "member-a", capability, provider: "openai", model: "fixture", status: "queued",
    input_metadata: { ...input, __veloceTraits: traits.traitBundleMetadata(traits.resolveCapabilityTraits({ capability, provider: "openai" })) },
    output_metadata: {} as Row, error_code: null as unknown },
    artifact: null as Row | null, objects: new Map<string, Buffer>(), providerCalls: 0, quote: 0, calls: [] as Array<{ model: string; prompt: string }>,
    settlements: [] as Row[], reservations: [] as Row[], domain: [] as Array<{ name: string; body: Row }>, completions: [] as Row[], downloads: 0, cancellations: 0,
    completionAllowed: true, afterStorage: null as (() => void) | null };
  const data = {
    reserveClientRuntimeBudgetWorker: async (input: Row) => { state.reservations.push(input); state.quote = Number(input.amountMicros); return true; },
    settleClientRuntimeBudgetWorker: async (input: Row) => {
      state.settlements.push(input);
      if (options.settlementThrows) throw new Error("fixture-settlement-response-unknown");
      return options.settle !== false && (!options.rejectOverrun || Number(input.actualAmountMicros) <= state.quote);
    },
    workerRpc: async (name: string, body: Row) => {
      expect(body.p_tenant_slug).toBe("tenant-a");
      expect(body.p_worker_token).toBe("fixture-worker-token-at-least-24");
      if (name === "claim_client_runtime_job") {
        if (state.job.status !== "queued") return { ok: true, value: null };
        state.job.status = "running";
        return { ok: true, value: structuredClone(state.job) };
      }
      if (name === "complete_client_runtime_job") {
        state.completions.push(body);
        if (!state.completionAllowed) return { ok: false, value: false };
        state.job.status = String(body.p_status);
        state.job.error_code = body.p_error_code;
        state.job.output_metadata = body.p_output_metadata as Row;
        return { ok: true, value: true };
      }
      if (name === "create_client_runtime_artifact_worker") {
        state.artifact = { id: artifactId, tenant_slug: "tenant-a", job_id: jobId, status: "pending", created_by: null,
          original_name: body.p_original_name, object_key: body.p_object_key, content_type: body.p_content_type,
          byte_size: body.p_byte_size, retention_expires_at: body.p_retention_expires_at };
        return { ok: true, value: artifactId };
      }
      if (name === "confirm_client_runtime_artifact_worker") {
        state.artifact!.status = "ready";
        return { ok: true, value: true };
      }
      if (name === "create_client_runtime_record_worker") {
        state.domain.push({ name, body });
        return { ok: true, value: artifactId };
      }
      if (["settle_client_ruflo_swarm_worker", "settle_client_ruflo_agent_worker", "settle_client_loop_run_worker", "append_client_loop_round_worker",
        "update_client_room_round_worker", "append_client_room_message_worker"].includes(name)) {
        state.domain.push({ name, body });
        if (capability === "room-round" && ((options.roomDomainUnavailable === "before-call" && name === "update_client_room_round_worker" && body.p_status === "running")
          || (options.roomDomainUnavailable === "after-call" && name === "append_client_room_message_worker" && body.p_role === "agent")
          || (options.roomDomainUnavailable === "after-settlement" && name === "update_client_room_round_worker" && body.p_status === "succeeded"))) return { ok: true, value: false };
        return { ok: true, value: true };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
    selectClientRecords: async (table: string, filters: Record<string, string>) => {
      expect(filters.tenant_slug).toBe("eq.tenant-a");
      return { ok: true, records: table === "client_runtime_jobs" ? [structuredClone(state.job)] : state.artifact ? [structuredClone(state.artifact)] : [] };
    },
  };
  const storage = {
    clientStorageConfig: () => ({ bucket: "fixture-bucket", namespace: "tenant-a" }),
    clientGcpAccessToken: async () => "fixture-storage-token",
    safeClientObjectKey: (key: string) => key.startsWith("tenant-a/"), safeClientFileName: (name: string) => name,
    uploadClientStorageObject: async (input: { objectKey: string; bytes: Buffer }) => { state.objects.set(input.objectKey, input.bytes); return true; },
    proxyClientStorageObject: async () => {
      state.downloads++;
      state.afterStorage?.();
      const bytes = state.objects.get(String(state.artifact!.object_key))!;
      let sent = false;
      return { body: new ReadableStream<Uint8Array>({ pull(controller) {
        if (sent) controller.close();
        else { sent = true; controller.enqueue(new Uint8Array(bytes)); }
      }, cancel() { state.cancellations++; } }), contentType: "text/html", contentLength: String(bytes.length) };
    },
  };
  const source = readFileSync("src/app/api/internal/client-runtime/jobs/route.ts", "utf8");
  const mocks = Object.fromEntries([...source.matchAll(/from "(@\/lib\/[^\"]+)"/g)].map((match) => [match[1], {}])) as Record<string, unknown>;
  Object.assign(mocks, {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientTaskAuth": { validClientTaskIdentity: async () => true }, "@/lib/clientDataPlane": data,
    "@/lib/clientAuth": { currentClientUser: async () => ({ id: "member-a" }), currentClientMember: async () => true },
    "@/lib/clientRuntimePolicy": { clientProviderCallsEnabled: () => true, clientCapabilityEnabled: () => true },
    "@/lib/clientRuntimeObservability": { logClientRuntimeEvent: () => undefined },
    "@/lib/clientRetention": retention, "@/lib/capabilityTraits": traits, "@/lib/clientJobTrace": trace,
    "@/lib/clientArtifactReview": review, "@/lib/clientRufloAdapter": ruflo, "@/lib/clientLoopAdapter": loop,
    "@/lib/clientLoopRegistry": registry, "@/lib/loopCostLedger": cost, "@/lib/clientRoomAdapter": room,
    "@/lib/clientStorage": storage,
    "@/lib/clientWorkspaceExecution": { artifactFromWorkspaceOutput: () => ({ fileName: "fixture.html", contentType: "text/html", bytes: Buffer.from("<p>Fixture</p>"), previewHtml: "<p>Fixture</p>" }) },
    "@/lib/clientProviderAdapter": {
      clientTextMaxOutputTokens: () => 1000, estimateClientTextCostMicros: (model: string, messages: Array<{ content: string }>) =>
        options.inflateQuoteAfterCall && state.providerCalls > 0 ? 1_000_000 : options.pricePrompt
          ? (messages.reduce((n, m) => n + m.content.length, 0) + 1000) * (model === "expensive-judge" ? 10 : 1) : options.quote ?? 100,
      clientTextUsageCostMicros: () => state.providerCalls === options.unpriceableAt ? null : options.actualPerCall ?? 5, safeClientProviderOutput: (value: string) => value,
      runClientTextAdapter: async (input: { model: string; prompt: string }) => { state.providerCalls++; state.calls.push(input);
        if (state.providerCalls === options.failedAt) return { ok: false, status: 504, error: "provider_timeout" };
        return { ok: true, provider: "openai", model: "fixture", usage: state.providerCalls === options.missingUsageAt ? undefined : { inputTokens: 1, outputTokens: 1 },
        output: capability === "loop-run" && state.providerCalls % 2 === 0 ? '{"pass":true,"score":95,"issues":[],"summary":"Fixture passes"}' : options.roomDirectives ? "Review this synthetic idea.\nNOTE:: Decision\nPIPELINE:: Draft a plan" : options.outputChars ? "x".repeat(options.outputChars) : "<p>Fixture</p>" }; },
    },
  });
  const worker = loadReviewModule("src/app/api/internal/client-runtime/jobs/route.ts", mocks);
  const artifacts = loadReviewModule("src/app/api/client-runtime/artifacts/route.ts", mocks);
  const download = loadReviewModule("src/app/api/client-runtime/artifacts/[id]/download/route.ts", mocks);
  const execute = () => worker.POST(new Request("https://fixture.invalid/api/internal/client-runtime/jobs", { method: "POST", body: JSON.stringify({ jobId, tenantSlug: "tenant-a" }) }));
  return { state, execute, artifacts, primary: () => artifacts.GET(new Request(`https://fixture.invalid/api/client-runtime/artifacts?id=${artifactId}`)),
    download: () => download.GET(new Request(`https://fixture.invalid/api/client-runtime/artifacts/${artifactId}/download`), { params: Promise.resolve({ id: artifactId }) }) };
}

for (const settle of [true, false]) {
  test(`Room directives require human review and never create domain records during generation (settle=${settle})`, async () => {
    const h = harness("room-round", { roomDirectives: true, settle });
    await h.execute();
    expect(h.state.domain.filter((call) => call.name === "create_client_runtime_record_worker")).toHaveLength(0);
    if (settle) {
      expect(h.state.job.output_metadata.roomDirectives).toEqual([
        { kind: "note", label: "Decision", body: "Review this synthetic idea.", agentId: "claude", agentName: "Claude" },
        { kind: "pipeline", label: "Draft a plan", body: "Draft a plan", agentId: "claude", agentName: "Claude" },
      ]);
      expect(h.state.job.status).toBe("succeeded");
    } else expect(h.state.job.status).toBe("failed");
  });
}

for (const stage of ["before-call", "after-call", "after-settlement"] as const) {
  test(`Room stops on unavailable/expired domain state ${stage} without replaying or losing measured cost`, async () => {
    const h = harness("room-round", { roomDomainUnavailable: stage, roomDirectives: true });
    expect(await (await h.execute()).json()).toMatchObject({ status: "failed" });
    expect(h.state.providerCalls).toBe(stage === "before-call" ? 0 : 1);
    expect(h.state.settlements).toHaveLength(1);
    expect(h.state.settlements[0].actualAmountMicros).toBe(stage === "before-call" ? 0 : 5);
    expect(h.state.job).toMatchObject({ status: "failed", error_code: "room_round_unavailable" });
    expect(h.state.job.output_metadata).not.toHaveProperty("roomDirectives");
    await h.execute();
    expect(h.state.providerCalls).toBe(stage === "before-call" ? 0 : 1);
  });
}

test("Room refuses missing, malformed and expired source clocks before reservation or provider work", async () => {
  for (const invalid of [undefined, "invalid", new Date(Date.now()-1000).toISOString()]) {
    const h = harness("room-round");
    h.state.job.input_metadata.roomCreatedAt = new Date(Date.now()-2*86400000).toISOString();
    h.state.job.input_metadata.roomRetentionExpiresAt = invalid;
    await h.execute();
    expect(h.state.providerCalls).toBe(0);
    expect(h.state.reservations).toHaveLength(0);
    expect(h.state.job.status).toBe("failed");
    expect(h.state.job.error_code).toMatch(/^room_retention_/);
  }
});

for (const capability of ["ruflo-swarm", "loop-run", "room-round"] as const) {
  test(`${capability} rejects invalid or overflowing envelope quotes before reservation and provider work`, async () => {
    for (const quote of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER]) {
      const h = harness(capability, { quote });
      if (capability === "room-round") (h.state.job.input_metadata.agents as Row[]).push({ id: "gemini", name: "Gemini", color: "#444444", provider: "openai", model: "fixture" });
      expect(await (await h.execute()).json()).toMatchObject({ status: "failed" });
      expect(h.state.providerCalls).toBe(0);
      expect(h.state.reservations).toHaveLength(0);
      expect(h.state.settlements).toHaveLength(0);
      expect(h.state.job.error_code).toBe("budget_exceeded");
    }
  });

  test(`${capability} allows a fully zero-priced envelope without treating unknown usage as zero`, async () => {
    const h = harness(capability, { quote: 0, actualPerCall: 0 });
    expect(await (await h.execute()).json()).toMatchObject({ status: "succeeded" });
    expect(h.state.reservations).toHaveLength(1);
    expect(h.state.quote).toBe(0);
    expect(h.state.settlements[0].actualAmountMicros).toBe(0);
    if (capability === "loop-run") expect(h.state.job.output_metadata.loopStopReason).toBe("verdict-pass");
  });

  test(`${capability} fails blocked when known-cost envelope settlement fails`, async () => {
    const h = harness(capability, { inflateQuoteAfterCall: true, settle: false });
    if (capability === "room-round") (h.state.job.input_metadata.agents as Row[]).push({ id: "gemini", name: "Gemini", color: "#444444", provider: "openai", model: "fixture" });
    await h.execute();
    expect(h.state.providerCalls).toBe(1);
    expect(h.state.settlements[0].actualAmountMicros).toBe(5);
    expect(h.state.job).toMatchObject({ status: "failed", error_code: "budget_settlement_failed", output_metadata: {
      failureDisposition: "blocked", budgetAccounting: { status: "reconciliation_required", knownCostMicros: 5 },
    } });
    expect(h.state.domain.at(-1)?.body).toMatchObject({ p_status: "failed", p_error_code: "budget_settlement_failed" });
  });

  test(`${capability} does not replay an envelope stop after completion persistence fails`, async () => {
    const h = harness(capability, { inflateQuoteAfterCall: true });
    if (capability === "room-round") (h.state.job.input_metadata.agents as Row[]).push({ id: "gemini", name: "Gemini", color: "#444444", provider: "openai", model: "fixture" });
    h.state.completionAllowed = false;
    await expect(h.execute()).rejects.toThrow("job_completion_failed");
    expect(h.state.job.status).toBe("running");
    expect(h.state.providerCalls).toBe(1);
    expect(h.state.settlements).toHaveLength(1);
    expect(h.state.settlements[0].actualAmountMicros).toBe(5);
    expect(await (await h.execute()).json()).toMatchObject({ status: "already_claimed" });
    expect(h.state.providerCalls).toBe(1);
    expect(h.state.settlements).toHaveLength(1);
  });

  test(`${capability} stops before a call that no longer fits the reserved envelope`, async () => {
    const h = harness(capability, { inflateQuoteAfterCall: true });
    if (capability === "room-round") (h.state.job.input_metadata.agents as Row[]).push({ id: "gemini", name: "Gemini", color: "#444444", provider: "openai", model: "fixture" });
    expect(await (await h.execute()).json()).toMatchObject({ status: "failed" });
    expect(h.state.providerCalls).toBe(1);
    expect(h.state.settlements).toHaveLength(1);
    expect(h.state.settlements[0].actualAmountMicros).toBe(5);
    expect(h.state.job.error_code).toBe("budget_envelope_exceeded");
    expect(h.state.artifact).toBeNull();
    expect(await (await h.execute()).json()).toMatchObject({ status: "already_claimed" });
    expect(h.state.providerCalls).toBe(1);
  });
  for (const uncertainty of ["missingUsageAt", "unpriceableAt", "failedAt"] as const) {
    test(`${capability} stops without zero settlement when ${uncertainty} is unresolved`, async () => {
      const h = harness(capability, { [uncertainty]: 1 });
      expect(await (await h.execute()).json()).toMatchObject({ status: "failed" });
      expect(h.state.providerCalls).toBe(1);
      expect(h.state.settlements).toHaveLength(0);
      expect(h.state.job).toMatchObject({ status: "failed", error_code: "budget_usage_unverified", output_metadata: {
        failureDisposition: "blocked", budgetAccounting: { status: "reconciliation_required", knownCostMicros: 0, reservationDisposition: "unsettled" },
      } });
      expect(h.state.artifact).toBeNull();
      expect(h.state.domain.at(-1)?.body).toMatchObject({ p_status: "failed", p_error_code: "budget_usage_unverified" });
      expect(await (await h.execute()).json()).toMatchObject({ status: "already_claimed" });
      expect(h.state.providerCalls).toBe(1);
    });
  }

  test(`${capability} cannot succeed when required budget settlement fails`, async () => {
    const { state, execute } = harness(capability, { settle: false });
    const response = await execute();
    expect(await response.json()).toMatchObject({ status: "failed" });
    expect(state.job).toMatchObject({ status: "failed", error_code: "budget_settlement_failed", output_metadata: { failureDisposition: "blocked" } });
    expect(state.settlements).toHaveLength(1);
    expect(state.domain.at(-1)?.body).toMatchObject({ p_status: "failed", p_error_code: "budget_settlement_failed" });
    expect(state.completions).toHaveLength(1);
  });

  test(`${capability} succeeds only after one successful settlement and does not replay provider work`, async () => {
    const h = harness(capability);
    expect(await (await h.execute()).json()).toMatchObject({ status: "succeeded" });
    expect(h.state.job.status).toBe("succeeded");
    expect(h.state.settlements).toHaveLength(1);
    expect(h.state.completions).toHaveLength(1);
    const calls = h.state.providerCalls;
    expect(calls).toBeGreaterThan(0);
    expect(await (await h.execute()).json()).toMatchObject({ status: "already_claimed" });
    expect(h.state.providerCalls).toBe(calls);
    expect(h.state.settlements).toHaveLength(1);
    if (h.state.artifact) {
      expect((await h.primary()).status).toBe(200);
      expect(await (await h.download()).text()).toBe("<p>Fixture</p>");
    }
  });

  test(`${capability} preserves failed accounting on duplicate queue delivery`, async () => {
    const h = harness(capability, { settle: false });
    await h.execute();
    const calls = h.state.providerCalls;
    expect(await (await h.execute()).json()).toMatchObject({ status: "already_claimed" });
    expect(h.state.providerCalls).toBe(calls);
    expect(h.state.completions).toHaveLength(1);
    expect(h.state.job.status).toBe("failed");
    if (h.state.artifact) {
      expect((await h.primary()).status).toBe(409);
      expect((await h.download()).status).toBe(409);
      expect(h.state.downloads).toBe(0);
    }
  });

  test(`${capability} cannot manufacture completion after an unknown settlement response`, async () => {
    const h = harness(capability, { settlementThrows: true });
    await expect(h.execute()).rejects.toThrow("fixture-settlement-response-unknown");
    expect(h.state.job.status).toBe("running");
    expect(h.state.completions).toHaveLength(0);
    const calls = h.state.providerCalls;
    expect(await (await h.execute()).json()).toMatchObject({ status: "already_claimed" });
    expect(h.state.providerCalls).toBe(calls);
    if (h.state.artifact) {
      expect((await h.primary()).status).toBe(409);
      expect((await h.download()).status).toBe(409);
    }
  });

  test(`${capability} permits an explicitly measured zero-cost round`, async () => {
    const h = harness(capability, { actualPerCall: 0 });
    expect(await (await h.execute()).json()).toMatchObject({ status: "succeeded" });
    expect(h.state.settlements).toHaveLength(1);
    expect(h.state.settlements[0].actualAmountMicros).toBe(0);
    expect(h.state.job.status).toBe("succeeded");
  });

  test(`${capability} never accumulates unsafe integer costs`, async () => {
    const h = harness(capability, { actualPerCall: Number.MAX_SAFE_INTEGER, rejectOverrun: true });
    if (capability === "room-round") (h.state.job.input_metadata.agents as Row[]).push({ id: "gemini", name: "Gemini", color: "#444444", provider: "openai", model: "fixture" });
    expect(await (await h.execute()).json()).toMatchObject({ status: "failed" });
    expect(h.state.providerCalls).toBe(1);
    expect(h.state.settlements).toHaveLength(1);
    expect(h.state.settlements[0].actualAmountMicros).toBe(Number.MAX_SAFE_INTEGER);
    expect(h.state.job.error_code).toBe("budget_settlement_failed");
    expect(h.state.job.output_metadata).toMatchObject({ budgetAccounting: { knownCostMicros: Number.MAX_SAFE_INTEGER, status: "reconciliation_required" } });
  });

  test(`${capability} cannot refund unknown usage when blocked completion cannot be persisted`, async () => {
    const h = harness(capability, { missingUsageAt: 1 });
    h.state.completionAllowed = false;
    await expect(h.execute()).rejects.toThrow("job_completion_failed");
    expect(h.state.job.status).toBe("running");
    expect(h.state.settlements).toHaveLength(0);
    expect(h.state.providerCalls).toBe(1);
    expect(await (await h.execute()).json()).toMatchObject({ status: "already_claimed" });
    expect(h.state.providerCalls).toBe(1);
  });
}

test("a fully free quality-streak Loop finishes its bounded verification streak", async () => {
  const h = harness("loop-run", { quote: 0, actualPerCall: 0 });
  h.state.job.input_metadata.loopContractId = "quality-streak";
  h.state.job.input_metadata.maxRounds = registry.QUALITY_STREAK_TARGET;
  expect(await (await h.execute()).json()).toMatchObject({ status: "succeeded" });
  expect(h.state.providerCalls).toBe(registry.QUALITY_STREAK_TARGET * 2);
  expect(h.state.job.output_metadata).toMatchObject({ loopRounds: registry.QUALITY_STREAK_TARGET, loopStopReason: "quality-streak" });
  expect(h.state.settlements[0].actualAmountMicros).toBe(0);
});

test("a free Loop still denies the next call when its quote becomes nonzero", async () => {
  const h = harness("loop-run", { quote: 0, actualPerCall: 0, inflateQuoteAfterCall: true });
  await h.execute();
  expect(h.state.providerCalls).toBe(1);
  expect(h.state.job.error_code).toBe("budget_envelope_exceeded");
  expect(h.state.settlements[0].actualAmountMicros).toBe(0);
});

test("Ruflo reserves full specialist prompts and the bounded coordinator findings", async () => {
  const h = harness("ruflo-swarm", { pricePrompt: true, outputChars: 40_000 });
  h.state.job.input_metadata.objective = "g".repeat(4000);
  await h.execute();
  const expected = h.state.calls.reduce((n, c) => n + c.prompt.length + 1000, 0);
  expect(h.state.quote).toBe(expected);
});

test("Loop reserves repeated builder prompts and the judge at its own rate", async () => {
  const h = harness("loop-run", { pricePrompt: true, outputChars: 40_000 });
  h.state.job.input_metadata.maxRounds = 3;
  h.state.job.input_metadata.judge = { provider: "openai", model: "expensive-judge" };
  const goal = String(h.state.job.input_metadata.goal);
  const first = loop.loopBuilderPrompt({ goal, previous: "", issues: [] }).length + 1000;
  const later = loop.loopBuilderPrompt({ goal, previous: "x".repeat(40_000), issues: [] }).length + 1000;
  const judge = (loop.loopJudgePrompt({ goal, artifact: "x".repeat(40_000) }).length + 1000) * 10;
  await h.execute();
  expect(h.state.quote).toBe(first + 2 * later + 3 * judge);
});

test("Room reserves later agents against transcript growth rather than the empty starting transcript", async () => {
  const h = harness("room-round", { pricePrompt: true, outputChars: 40_000 });
  (h.state.job.input_metadata.agents as Row[]).push({ id: "gemini", name: "Gemini", color: "#444444", provider: "openai", model: "fixture" });
  await h.execute();
  expect(h.state.calls).toHaveLength(2);
  const expected = h.state.calls.reduce((n, c) => n + c.prompt.length + 1000, 0);
  expect(h.state.quote).toBe(expected);
});

for (const [capability, stage, call] of [
  ["ruflo-swarm", "ruflo-report", ruflo.rufloRoster("seo").length + 1],
  ["loop-run", "loop-judge", 2], ["room-round", "room-agent", 2],
] as const) {
  for (const uncertainty of ["missingUsageAt", "unpriceableAt", "failedAt"] as const) {
    test(`${capability} preserves known prior cost without settling unknown ${stage} ${uncertainty}`, async () => {
      const h = harness(capability, { [uncertainty]: call });
      if (capability === "room-round") (h.state.job.input_metadata.agents as Row[]).push({ id: "gemini", name: "Gemini", color: "#444444", provider: "openai", model: "fixture" });
      expect(await (await h.execute()).json()).toMatchObject({ status: "failed" });
      expect(h.state.providerCalls).toBe(call);
      expect(h.state.settlements).toHaveLength(0);
      expect(h.state.job.output_metadata).toMatchObject({ failureDisposition: "blocked", budgetAccounting: {
        status: "reconciliation_required", knownCostMicros: (call - 1) * 5, stage, reservationDisposition: "unsettled",
      } });
      expect(h.state.artifact).toBeNull();
      expect(await (await h.execute()).json()).toMatchObject({ status: "already_claimed" });
      expect(h.state.providerCalls).toBe(call);
    });
  }
}

test("Room submits actual usage without clipping it to a reservation", async () => {
  const { state, execute } = harness("room-round", { actualPerCall: 150, rejectOverrun: true });
  await execute();
  expect(state.quote).toBe(100);
  expect(state.settlements[0].actualAmountMicros).toBe(150);
  expect(state.job.status).toBe("failed");
});

test("generated artifacts from accounting-blocked jobs cannot use either download path", async () => {
  const h = harness("ruflo-swarm");
  await h.execute();
  h.state.job.status = "failed";
  h.state.job.error_code = "budget_settlement_failed";
  h.state.job.output_metadata = { artifactId, failureDisposition: "blocked" };
  expect((await h.primary()).status).toBe(409);
  expect((await h.download()).status).toBe(409);
  expect(h.state.downloads).toBe(0);
});

test("generated artifact release fails closed on unsuccessful jobs and inconsistent completion metadata", async () => {
  const h = harness("loop-run");
  await h.execute();
  const good = structuredClone(h.state.job);
  for (const patch of [
    { status: "running" }, { status: "queued" }, { status: "failed" }, { status: "cancelled" },
    { error_code: "budget_settlement_failed" }, { output_metadata: { failureDisposition: "blocked" } }, { output_metadata: null },
  ]) {
    Object.assign(h.state.job, good, patch);
    expect((await h.primary()).status).toBe(409);
    expect((await h.download()).status).toBe(409);
    const listed = await (await h.artifacts.GET(new Request("https://fixture.invalid/api/client-runtime/artifacts"))).json();
    expect(listed.artifacts[0]).toMatchObject({ job_released: false, review_available: false });
  }
  expect(h.state.downloads).toBe(0);
  Object.assign(h.state.job, good);
  expect((await h.primary()).status).toBe(200);
});

test("generated download rechecks release after storage responds and cancels revoked bytes", async () => {
  const h = harness("ruflo-swarm");
  await h.execute();
  h.state.afterStorage = () => { h.state.job.status = "failed"; h.state.job.error_code = "budget_settlement_failed"; };
  const response = await h.download();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "artifact_job_not_released" });
  expect(h.state.cancellations).toBe(1);
});

for (const capability of ["ruflo-swarm", "loop-run"] as const) {
  test(`${capability} with failed completion persistence leaves ready bytes unreleased`, async () => {
    const h = harness(capability);
    h.state.completionAllowed = false;
    await expect(h.execute()).rejects.toThrow("job_completion_failed");
    expect(h.state.artifact?.status).toBe("ready");
    expect(h.state.job.status).toBe("running");
    expect((await h.primary()).status).toBe(409);
    expect((await h.download()).status).toBe(409);
    expect(h.state.downloads).toBe(0);
  });
}

test("runtime SQL rejects unclipped settlement overrun and cannot reclaim terminal or already running work", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const token = "fixture-worker-token-at-least-24";
  const scalar = async (sql: string, args: unknown[] = []) => (await db.query<{ value: unknown }>(`select ${sql} as value`, args)).rows[0].value;
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema extensions;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create function client_member(text) returns boolean language sql as $$ select false $$;
      create table client_tenants(slug text primary key,name text,status text,retention_days integer,created_at timestamptz,updated_at timestamptz);
      create table client_runtime_jobs(id uuid primary key,tenant_slug text,requested_by uuid,capability text,provider text,model text,idempotency_key text,
        input_metadata jsonb default '{}',output_metadata jsonb default '{}',status text default 'queued',attempt_count integer default 0,
        started_at timestamptz,finished_at timestamptz,error_code text,unique(tenant_slug,idempotency_key));
      create table client_runtime_budget_ledger(id bigserial primary key,tenant_slug text,job_id uuid,provider text,model text,
        amount_micros bigint,usage_metadata jsonb,created_at timestamptz default now());`);
    const sql = readFileSync("product-experience/supabase-client-runtime-controls.sql", "utf8");
    await db.exec(sql);
    await db.exec(sql);
    await db.query("insert into client_tenants(slug,status,worker_token_hash) values ('tenant-a','active',encode(extensions.digest($1,'sha256'),'hex'))", [token]);
    await db.query("insert into client_runtime_jobs(id,tenant_slug,capability) values ($1,'tenant-a','room-round'),($2,'tenant-a','loop-run')", [jobId, artifactId]);
    await db.exec("set role anon");
    expect(await scalar("claim_client_runtime_job('tenant-a',$1,'incorrect-worker-token-value')", [jobId])).toBeNull();
    expect(await scalar("claim_client_runtime_job('tenant-b',$1,$2)", [jobId, token])).toBeNull();
    expect(await scalar("claim_client_runtime_job('tenant-a',$1,$2)", [jobId, token])).toMatchObject({ id: jobId, status: "running", attempt_count: 1 });
    expect(await scalar("claim_client_runtime_job('tenant-a',$1,$2)", [jobId, token])).toBeNull();
    expect(await scalar("reserve_client_runtime_budget_worker('tenant-a','openai','fixture',100,1000,$1,$2)", [jobId, token])).toBe(true);
    expect(await scalar("settle_client_runtime_budget_worker('tenant-a',$1,$2,150,'{\"actualAmountMicros\":150}')", [jobId, token])).toBe(false);
    expect(await scalar("complete_client_runtime_job('tenant-a',$1,$2,'failed','{\"failureDisposition\":\"blocked\"}','budget_settlement_failed')", [jobId, token])).toBe(true);
    expect(await scalar("claim_client_runtime_job('tenant-a',$1,$2)", [jobId, token])).toBeNull();
    expect(await scalar("claim_client_runtime_job('tenant-a',$1,$2)", [artifactId, token])).toMatchObject({ id: artifactId, attempt_count: 1 });
    expect(await scalar("reserve_client_runtime_budget_worker('tenant-a','openai','fixture',100,1000,$1,$2)", [artifactId, token])).toBe(true);
    expect(await scalar("settle_client_runtime_budget_worker('tenant-a',$1,$2,50,'{\"actualAmountMicros\":50}')", [artifactId, token])).toBe(true);
    expect(await scalar("complete_client_runtime_job('tenant-a',$1,$2,'succeeded','{}',null)", [artifactId, token])).toBe(true);
    expect(await scalar("claim_client_runtime_job('tenant-a',$1,$2)", [artifactId, token])).toBeNull();
    await db.exec("reset role");
    expect(await scalar("(select amount_micros from client_runtime_budget_ledger where job_id=$1)", [jobId])).toBe(100);
    expect(await scalar("(select amount_micros from client_runtime_budget_ledger where job_id=$1)", [artifactId])).toBe(50);
    expect((await db.query("select status,attempt_count from client_runtime_jobs order by id")).rows)
      .toEqual([{ status: "failed", attempt_count: 1 }, { status: "succeeded", attempt_count: 1 }]);
  } finally { await db.close(); }
});
