import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as contracts from "../src/lib/clientProviderContracts";
import * as instructions from "../src/lib/instructionBudget";
import { loadReviewModule } from "./helpers/load-review-module";

const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;
test.afterEach(() => { process.env = { ...savedEnv }; globalThis.fetch = savedFetch; });

function adapter() {
  const source = readFileSync("src/lib/clientProviderAdapter.ts", "utf8");
  const mocks = Object.fromEntries([...source.matchAll(/from "(@\/lib\/[^\"]+)"/g)].map((match) => [match[1], {}]));
  Object.assign(mocks, {
    "@/lib/clientExecutionCredential": { clientExecutionCredential: async () => "fixture-credential" },
    "@/lib/clientRuntimePolicy": { clientProviderCallsEnabled: () => true, clientProviderEnabled: () => true, clientContextCompressionEnabled: () => false },
    "@/lib/clientInputSafety": { containsClientSecretLike: () => false },
    "@/lib/clientProviderContracts": contracts, "@/lib/instructionBudget": instructions,
    "@/lib/clientJobTrace": { traceClientJobStage: async (_stage: string, operation: () => Promise<unknown>) => operation() },
  });
  return loadReviewModule("src/lib/clientProviderAdapter.ts", mocks);
}

test("text accounting rejects malformed, negative and unsafe pricing without throwing", () => {
  const api = adapter();
  for (const value of ["null", "[]", "false", "{", '{"fixture":{"inputMicrosPer1k":-1,"outputMicrosPer1k":1}}',
    '{"fixture":{"inputMicrosPer1k":1e308,"outputMicrosPer1k":1e308}}']) {
    process.env.CLIENT_MODEL_PRICING_JSON = value;
    expect(() => api.clientTextUsageCostMicros("fixture", { inputTokens: 1000, outputTokens: 1000 })).not.toThrow();
    expect(api.clientTextUsageCostMicros("fixture", { inputTokens: 1000, outputTokens: 1000 })).toBeNull();
    expect(api.estimateClientTextCostMicros("fixture", [{ role: "user", content: "x".repeat(1000) }], 1000)).toBeNull();
  }
});

test("explicit free pricing and numeric token usage remain valid", () => {
  const api = adapter();
  process.env.CLIENT_MODEL_PRICING_JSON = '{"fixture":{"inputMicrosPer1k":0,"outputMicrosPer1k":0}}';
  expect(api.clientTextUsageCostMicros("fixture", { inputTokens: 1000, outputTokens: 10 })).toBe(0);
  process.env.CLIENT_MODEL_PRICING_JSON = '{"fixture":{"inputMicrosPer1k":100,"outputMicrosPer1k":200}}';
  expect(api.clientTextUsageCostMicros("fixture", { inputTokens: 1000, outputTokens: 10 })).toBe(102);
  for (const usage of [null, {}, { inputTokens: -1, outputTokens: 0 }, { inputTokens: "1", outputTokens: 0 }, { inputTokens: NaN, outputTokens: 0 }]) {
    expect(() => api.clientTextUsageCostMicros("fixture", usage)).not.toThrow();
    expect(api.clientTextUsageCostMicros("fixture", usage)).toBeNull();
  }
});

for (const provider of ["openai", "anthropic", "gemini"] as const) test(`${provider} usage normalization never coerces absent or nonnumeric fields to free tokens`, async () => {
  const api = adapter();
  process.env.CLIENT_MODEL_ALLOWLIST = "gpt-4o-mini";
  process.env.CLIENT_MODEL_PRICING_JSON = '{"gpt-4o-mini":{"inputMicrosPer1k":100,"outputMicrosPer1k":100}}';
  let calls = 0;
  for (const usage of [{ prompt_tokens: null, completion_tokens: null }, { prompt_tokens: false, completion_tokens: "" }, { prompt_tokens: "1", completion_tokens: "2" }, {}, { prompt_tokens: 0, completion_tokens: 0 }]) {
    globalThis.fetch = async () => { calls++; return Response.json(provider === "openai" ? { choices: [{ message: { content: "Fixture" } }], usage }
      : provider === "anthropic" ? { content: [{ type: "text", text: "Fixture" }], usage: { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens } }
        : { candidates: [{ content: { parts: [{ text: "Fixture" }] } }], usageMetadata: { promptTokenCount: usage.prompt_tokens, candidatesTokenCount: usage.completion_tokens } }); };
    const result = await api.runClientTextAdapter({ provider, model: "gpt-4o-mini", prompt: "Fixture", reserveBudget: false, disableReviewedPlanTool: true });
    expect(result.ok).toBe(true);
    expect(result.usage).toEqual(usage.prompt_tokens === 0 ? { inputTokens: 0, outputTokens: 0 } : undefined);
  }
  expect(calls).toBe(5);
});
