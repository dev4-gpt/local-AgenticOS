export const PROVIDER_SECRET_KEYS = Object.freeze({
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  codex: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openclaw: "OPENROUTER_API_KEY",
  hermes: "OPENROUTER_API_KEY",
  freeclaude: "OPENROUTER_API_KEY",
  fusion: "OPENROUTER_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  kimi: "MOONSHOT_API_KEY",
  glm: "GLM_API_KEY",
  "glm-code": "GLM_API_KEY",
  xai: "XAI_API_KEY",
  grok: "XAI_API_KEY",
  sakana: "SAKANA_API_KEY",
  gemini: "GEMINI_API_KEY",
  antigravity: "GEMINI_API_KEY",
});

export function normalizeModelPricing(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const pricing = {};
  for (const [model, rates] of Object.entries(value)) {
    if (!rates || typeof rates !== "object" || Array.isArray(rates)) continue;
    const inputMicrosPer1k = Number(rates.inputMicrosPer1k);
    const outputMicrosPer1k = Number(rates.outputMicrosPer1k);
    if (Number.isFinite(inputMicrosPer1k) && inputMicrosPer1k >= 0 && Number.isFinite(outputMicrosPer1k) && outputMicrosPer1k >= 0) {
      pricing[model] = { inputMicrosPer1k, outputMicrosPer1k };
    }
  }
  return pricing;
}

export function validateProviderActivation({
  enabled,
  providerAllowlist,
  secretNames,
  modelAllowlist,
  providerModelAllowlist,
  modelPricing,
  enabledCapabilities,
  fail,
}) {
  if (!enabled) return;
  const models = new Set(modelAllowlist);
  const allowedSecrets = new Set(providerAllowlist);
  const availableSecrets = new Set(secretNames);
  if (models.size === 0 || Object.keys(providerModelAllowlist).length === 0) {
    fail("Provider activation requires modelAllowlist and providerModelAllowlist");
  }
  if (!enabledCapabilities.includes("text-agents")) {
    fail("Provider activation requires the reviewed text-agents capability");
  }
  for (const [provider, providerModels] of Object.entries(providerModelAllowlist)) {
    const providerKey = PROVIDER_SECRET_KEYS[provider];
    if (!providerKey) fail(`Provider activation does not recognize provider alias: ${provider}`);
    if (!allowedSecrets.has(providerKey) || !availableSecrets.has(providerKey)) {
      fail(`Provider activation requires an allowlisted Secret Manager slot for ${providerKey}`);
    }
    for (const model of providerModels) {
      if (!models.has(model)) fail(`providerModelAllowlist.${provider} references a model outside modelAllowlist: ${model}`);
      const rates = modelPricing[model];
      if (!rates || !Number.isFinite(Number(rates.inputMicrosPer1k)) || !Number.isFinite(Number(rates.outputMicrosPer1k))) {
        fail(`Provider activation requires pricing for allowlisted model: ${model}`);
      }
    }
  }
}
