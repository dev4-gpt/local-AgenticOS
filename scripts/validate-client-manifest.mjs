#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const file = process.argv[2];
if (!file) fail("Usage: node scripts/validate-client-manifest.mjs path/to/client.json");
const absolute = path.resolve(process.cwd(), file);
if (!existsSync(absolute)) fail(`Manifest not found: ${absolute}`);
const raw = readFileSync(absolute, "utf8");
const manifest = JSON.parse(raw);

for (const field of ["clientSlug", "clientName", "gcp", "access", "enabledCapabilities", "providerAllowlist", "budget", "storage", "retention"]) {
  if (manifest[field] === undefined) fail(`Missing manifest field: ${field}`);
}

const env = manifest.runtimeEnv ?? {};
if (!env || typeof env !== "object" || Array.isArray(env)) fail("runtimeEnv must be an object when provided");
for (const [key, expected] of [
  ["VELOCE_CLIENT_EDITION", "1"],
  ["AGENTIC_OS_DISABLE_LOCAL_CLI", "1"],
  ["AGENTIC_OS_DISABLE_LOCAL_FILES", "1"],
  ["AGENTIC_OS_REQUIRE_APPROVALS", "1"],
  ["CLIENT_RUNTIME_ENFORCE_AUTH", "1"],
]) if (String(env[key] ?? "") !== expected) fail(`${key} must be ${expected}`);

if (!Array.isArray(manifest.access.allowedUserEmails) || manifest.access.allowedUserEmails.length === 0) fail("At least one approved runtime email is required");
if (!Array.isArray(manifest.enabledCapabilities) || manifest.enabledCapabilities.length === 0) fail("At least one explicitly reviewed capability is required");
if (Number(manifest.gcp.minInstances) !== 0) fail("minInstances must be explicitly set to 0 for the low-cost default");
if (Number(manifest.gcp.maxInstances) < 1) fail("maxInstances must be at least 1");
if (Number(manifest.budget.warningThreshold) >= Number(manifest.budget.monthlyCap)) fail("warningThreshold must be below monthlyCap");
if (/sk-[A-Za-z0-9_-]{20,}|api[_ -]?key\s*[:=]|secret\s*[:=]|password\s*[:=]/i.test(raw)) fail("Manifest appears to contain a raw credential value");

const models = Array.isArray(manifest.modelAllowlist) ? manifest.modelAllowlist.map(String) : [];
const secretEnv = manifest.secretEnv ?? manifest.secretRefs ?? {};
const secretNames = Array.isArray(secretEnv)
  ? secretEnv.map((item) => String(item).trim().toUpperCase().replace(/-/g, "_"))
  : secretEnv && typeof secretEnv === "object" ? Object.keys(secretEnv).map((item) => item.trim().toUpperCase()) : [];
for (const operatorOnly of ["SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "AWS_SECRET_ACCESS_KEY", "CLAUDE_CODE_SESSION", "CODEX_SESSION"]) {
  if (secretNames.includes(operatorOnly)) fail(`Operator-only secret cannot be placed in a client manifest: ${operatorOnly}`);
}
const providerModels = manifest.providerModelAllowlist ?? {};
if (!providerModels || typeof providerModels !== "object" || Array.isArray(providerModels)) fail("providerModelAllowlist must be an object when provided");
for (const [provider, values] of Object.entries(providerModels)) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(provider) || !Array.isArray(values) || values.length === 0) fail(`Invalid providerModelAllowlist.${provider}`);
  if (values.some((model) => typeof model !== "string" || !models.includes(model))) fail(`providerModelAllowlist.${provider} must only reference modelAllowlist entries`);
}
if (String(env.CLIENT_PROVIDER_CALLS_ENABLED ?? "0") === "1") {
  if (models.length === 0 || Object.keys(providerModels).length === 0) fail("Provider calls require modelAllowlist and providerModelAllowlist");
  for (const provider of Object.keys(providerModels)) {
    const providerKey = {
      anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", codex: "OPENAI_API_KEY",
      openrouter: "OPENROUTER_API_KEY", openclaw: "OPENROUTER_API_KEY", hermes: "OPENROUTER_API_KEY",
      freeclaude: "OPENROUTER_API_KEY", fusion: "OPENROUTER_API_KEY", moonshot: "MOONSHOT_API_KEY", kimi: "MOONSHOT_API_KEY",
      glm: "GLM_API_KEY", "glm-code": "GLM_API_KEY", xai: "XAI_API_KEY", grok: "XAI_API_KEY",
      sakana: "SAKANA_API_KEY", gemini: "GEMINI_API_KEY", antigravity: "GEMINI_API_KEY",
    }[provider];
    if (!providerKey || !secretNames.includes(providerKey)) fail(`Provider calls require a Secret Manager slot for ${providerKey ?? provider}`);
  }
  let pricing;
  try { pricing = JSON.parse(String(env.CLIENT_MODEL_PRICING_JSON ?? "{}")); } catch { fail("CLIENT_MODEL_PRICING_JSON must be valid JSON when provider calls are enabled"); }
  for (const model of models) if (!pricing[model] || !Number.isFinite(Number(pricing[model].inputMicrosPer1k)) || !Number.isFinite(Number(pricing[model].outputMicrosPer1k))) fail(`Missing pricing for allowlisted model: ${model}`);
}

console.log(`Client manifest validation passed: ${manifest.clientSlug}`);
function fail(message) { console.error(message); process.exit(1); }
