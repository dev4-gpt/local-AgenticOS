#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeCapabilityProviderAllowlist, normalizeHostAllowlist, normalizeModelPricing, validateProviderActivation } from "./client-provider-policy.mjs";

const root = new URL("..", import.meta.url).pathname;
const provisioner = await readFile(join(root, "scripts/provision-gcp-client.mjs"), "utf8");
const contracts = await readFile(join(root, "src/lib/clientProviderContracts.ts"), "utf8");
const adapter = await readFile(join(root, "src/lib/clientProviderAdapter.ts"), "utf8");
const failures = [];

expect(provisioner.includes("const providerCallsEnabled = manifest.providerCallsEnabled === true"), "provider activation must be explicit in the manifest");
expect(provisioner.includes('CLIENT_PROVIDER_CALLS_ENABLED: providerCallsEnabled ? "1" : "0"'), "provisioner must derive the provider-call switch");
expect(provisioner.includes("const runtimeEnv = { ...manifestRuntimeEnv, ...protectedRuntimeEnv }"), "protected runtime values must override free-form manifest environment values");
expect(provisioner.includes('CLIENT_RUNTIME_DATA_MODE: "supabase"'), "client deployments must use the tenant-scoped Supabase data plane");
expect(!provisioner.includes('CLIENT_PROVIDER_CALLS_ENABLED: "0",\n  ...manifestRuntimeEnv'), "manifest environment must not override the provider-call switch");
expect(contracts.includes("CLIENT_REVIEWED_PLAN_TOOL") && contracts.includes("approvalRequired: true"), "reviewed-plan contracts must produce approval-required bounded plans");
expect(contracts.includes("input_schema") && contracts.includes("functionDeclarations") && contracts.includes("tool_choice"), "reviewed-plan contracts must cover Anthropic, Gemini, and OpenAI-compatible tool shapes");
expect(contracts.includes("GEMINI_FUNCTION_SCHEMA_FIELDS") && contracts.includes("toGeminiFunctionSchema(REVIEWED_PLAN_PARAMETERS)"), "Gemini reviewed-plan contracts must use a provider-compatible function schema subset");
expect(adapter.includes("tool_calls") && adapter.includes("tool_use") && adapter.includes("functionCall") && adapter.includes("serializeClientReviewedPlan"), "provider adapters must normalize provider-specific reviewed-plan tool results");
expect(adapter.includes("redactKnownProviderSecrets") && adapter.includes("openRouterKey()") && adapter.includes("[Redacted provider secret.]"), "provider output and metadata must redact exact configured provider secret values");
expect(!adapter.includes("child_process") && !adapter.includes("writeFile") && !adapter.includes("exec("), "provider adapters must not execute local tools or write local files");

const active = { message: null };
validateProviderActivation({
  enabled: true,
  providerAllowlist: ["ANTHROPIC_API_KEY"],
  secretNames: ["ANTHROPIC_API_KEY"],
  modelAllowlist: ["claude-test"],
  providerModelAllowlist: { anthropic: ["claude-test"] },
  modelPricing: normalizeModelPricing({ "claude-test": { inputMicrosPer1k: 1, outputMicrosPer1k: 2 } }),
  enabledCapabilities: ["text-agents"],
  fail: (message) => { active.message = message; },
});
expect(active.message === null, "valid provider activation must pass");

const selectedMedia = { message: null };
validateProviderActivation({
  enabled: true,
  providerAllowlist: ["ANTHROPIC_API_KEY", "HEYGEN_API_KEY"],
  secretNames: ["ANTHROPIC_API_KEY", "HEYGEN_API_KEY"],
  modelAllowlist: ["claude-test"],
  providerModelAllowlist: { anthropic: ["claude-test"] },
  modelPricing: normalizeModelPricing({ "claude-test": { inputMicrosPer1k: 1, outputMicrosPer1k: 2 } }),
  enabledCapabilities: ["text-agents", "media"],
  capabilityProviderAllowlist: normalizeCapabilityProviderAllowlist({ media: ["heygen"] }),
  fail: (message) => { selectedMedia.message = message; },
});
expect(selectedMedia.message === null, "one selected media provider must not require unrelated media secrets");

const firecrawlResearch = { message: null };
validateProviderActivation({
  enabled: true,
  providerAllowlist: ["ANTHROPIC_API_KEY", "FIRECRAWL_API_KEY"],
  secretNames: ["ANTHROPIC_API_KEY", "FIRECRAWL_API_KEY"],
  modelAllowlist: ["claude-test"],
  providerModelAllowlist: { anthropic: ["claude-test"] },
  modelPricing: normalizeModelPricing({ "claude-test": { inputMicrosPer1k: 1, outputMicrosPer1k: 2 } }),
  enabledCapabilities: ["text-agents", "seo-research"],
  seoAllowedHosts: ["example.com"],
  researchProvider: "firecrawl",
  fail: (message) => { firecrawlResearch.message = message; },
});
expect(firecrawlResearch.message === null, "Firecrawl-only research activation must not require a Brave key");

const braveResearch = { message: null };
validateProviderActivation({
  enabled: true,
  providerAllowlist: ["ANTHROPIC_API_KEY", "BRAVE_API_KEY"],
  secretNames: ["ANTHROPIC_API_KEY", "BRAVE_API_KEY"],
  modelAllowlist: ["claude-test"],
  providerModelAllowlist: { anthropic: ["claude-test"] },
  modelPricing: normalizeModelPricing({ "claude-test": { inputMicrosPer1k: 1, outputMicrosPer1k: 2 } }),
  enabledCapabilities: ["text-agents", "seo-research"],
  seoAllowedHosts: ["example.com"],
  researchProvider: "brave",
  fail: (message) => { braveResearch.message = message; },
});
expect(braveResearch.message === null, "Brave-only research activation must require only the selected Brave key");

const firecrawlWithoutKey = { message: null };
validateProviderActivation({
  enabled: true,
  providerAllowlist: ["ANTHROPIC_API_KEY", "BRAVE_API_KEY"],
  secretNames: ["ANTHROPIC_API_KEY", "BRAVE_API_KEY"],
  modelAllowlist: ["claude-test"],
  providerModelAllowlist: { anthropic: ["claude-test"] },
  modelPricing: normalizeModelPricing({ "claude-test": { inputMicrosPer1k: 1, outputMicrosPer1k: 2 } }),
  enabledCapabilities: ["text-agents", "seo-research"],
  seoAllowedHosts: ["example.com"],
  researchProvider: "firecrawl",
  capabilityProviderAllowlist: { "seo-research": ["firecrawl"] },
  fail: (message) => { firecrawlWithoutKey.message = message; },
});
expect(typeof firecrawlWithoutKey.message === "string" && firecrawlWithoutKey.message.includes("FIRECRAWL_API_KEY"), "selected Firecrawl research must reject a missing Firecrawl key");

const unknownResearch = { messages: [] };
validateProviderActivation({
  enabled: true,
  providerAllowlist: ["ANTHROPIC_API_KEY", "FIRECRAWL_API_KEY", "BRAVE_API_KEY"],
  secretNames: ["ANTHROPIC_API_KEY", "FIRECRAWL_API_KEY", "BRAVE_API_KEY"],
  modelAllowlist: ["claude-test"],
  providerModelAllowlist: { anthropic: ["claude-test"] },
  modelPricing: normalizeModelPricing({ "claude-test": { inputMicrosPer1k: 1, outputMicrosPer1k: 2 } }),
  enabledCapabilities: ["text-agents", "seo-research"],
  seoAllowedHosts: ["example.com"],
  capabilityProviderAllowlist: { "seo-research": ["unknown-provider"] },
  fail: (message) => { unknownResearch.messages.push(message); },
});
expect(unknownResearch.messages.some((message) => message.includes("does not recognize provider")), "unknown research providers must fail closed");

for (const [label, config, expected] of [
  ["missing secret slot", { providerAllowlist: [], secretNames: [] }, "Secret Manager slot"],
  ["missing pricing", { modelPricing: {} }, "pricing"],
  ["missing text capability", { enabledCapabilities: [] }, "text-agents"],
  ["missing media providers", { enabledCapabilities: ["text-agents", "media"], providerAllowlist: ["ANTHROPIC_API_KEY"], secretNames: ["ANTHROPIC_API_KEY"] }, "Capability media"],
  ["missing SEO hosts", { enabledCapabilities: ["text-agents", "seo"], providerAllowlist: ["ANTHROPIC_API_KEY", "FIRECRAWL_API_KEY"], secretNames: ["ANTHROPIC_API_KEY", "FIRECRAWL_API_KEY"] }, "SEO capability"],
]) {
  const result = { message: null };
  validateProviderActivation({
    enabled: true,
    providerAllowlist: config.providerAllowlist ?? ["ANTHROPIC_API_KEY"],
    secretNames: config.secretNames ?? ["ANTHROPIC_API_KEY"],
    modelAllowlist: ["claude-test"],
    providerModelAllowlist: { anthropic: ["claude-test"] },
    modelPricing: config.modelPricing ?? normalizeModelPricing({ "claude-test": { inputMicrosPer1k: 1, outputMicrosPer1k: 2 } }),
    enabledCapabilities: config.enabledCapabilities ?? ["text-agents"],
    capabilityProviderAllowlist: config.capabilityProviderAllowlist ?? {},
    seoAllowedHosts: config.seoAllowedHosts ?? [],
    deliveryAllowedHosts: config.deliveryAllowedHosts ?? [],
    fail: (message) => { result.message = message; },
  });
  expect(typeof result.message === "string" && result.message.includes(expected), `${label} must fail closed`);
}

if (failures.length) {
  console.error("Client provider policy verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Client provider policy verification passed.");

function expect(condition, message) {
  if (!condition) failures.push(message);
}
