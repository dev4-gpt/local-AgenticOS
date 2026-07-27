#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeHostAllowlist, normalizeModelPricing, validateProviderActivation } from "./client-provider-policy.mjs";

const root = new URL("..", import.meta.url).pathname;
const provisioner = await readFile(join(root, "scripts/provision-gcp-client.mjs"), "utf8");
const failures = [];

expect(provisioner.includes("const providerCallsEnabled = manifest.providerCallsEnabled === true"), "provider activation must be explicit in the manifest");
expect(provisioner.includes('CLIENT_PROVIDER_CALLS_ENABLED: providerCallsEnabled ? "1" : "0"'), "provisioner must derive the provider-call switch");
expect(provisioner.includes("const runtimeEnv = { ...manifestRuntimeEnv, ...protectedRuntimeEnv }"), "protected runtime values must override free-form manifest environment values");
expect(provisioner.includes('CLIENT_RUNTIME_DATA_MODE: "supabase"'), "client deployments must use the tenant-scoped Supabase data plane");
expect(!provisioner.includes('CLIENT_PROVIDER_CALLS_ENABLED: "0",\n  ...manifestRuntimeEnv'), "manifest environment must not override the provider-call switch");

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
