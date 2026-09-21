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
  groq: "GROQ_API_KEY",
  gemini: "GEMINI_API_KEY",
  antigravity: "GEMINI_API_KEY",
});

const CAPABILITY_SECRET_KEYS = Object.freeze({
  media: ["ELEVENLABS_API_KEY", "ELEVENLABS_MUSIC_API_KEY", "HEYGEN_API_KEY", "SUNO_API_KEY", "OPENAI_API_KEY"],
  // Firecrawl remains the default. A Brave key is required only when Brave
  // is selected explicitly by the server-side research-provider manifest.
  "seo-research": ["FIRECRAWL_API_KEY"],
  seo: ["FIRECRAWL_API_KEY"],
});

const CAPABILITY_PROVIDERS = Object.freeze({
  media: Object.freeze({
    elevenlabs: "ELEVENLABS_API_KEY",
    // Music is a separate ElevenLabs product with its own key and meter, so it
    // is a separate provider here too and cannot be enabled by approving speech.
    "elevenlabs-music": "ELEVENLABS_MUSIC_API_KEY",
    heygen: "HEYGEN_API_KEY",
    suno: "SUNO_API_KEY",
    openai: "OPENAI_API_KEY",
  }),
  "seo-research": Object.freeze({ firecrawl: "FIRECRAWL_API_KEY", brave: "BRAVE_API_KEY" }),
  seo: Object.freeze({ firecrawl: "FIRECRAWL_API_KEY", brave: "BRAVE_API_KEY" }),
});

export const RESEARCH_WORKER_IDS = Object.freeze(["crawl4ai", "crawlee", "jina-reader"]);

export function normalizeCapabilityProviderAllowlist(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output = {};
  for (const [capability, providers] of Object.entries(value)) {
    if (!Array.isArray(providers)) {
      output[capability] = [];
      continue;
    }
    output[capability] = [...new Set(providers.map((provider) => String(provider).trim().toLowerCase()).filter(Boolean))];
  }
  return output;
}

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

export function normalizeHostAllowlist(value) {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const hosts = values.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return [...new Set(hosts.filter((host) => /^(?=.{1,253}$)(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)))];
}

export function normalizeResearchWorkerConfig(value) {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value).map(([id, config]) => ({ id, ...(config && typeof config === "object" && !Array.isArray(config) ? config : {}) }))
      : [];
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const id = String(entry.id ?? "").trim().toLowerCase();
    const endpoint = String(entry.endpoint ?? "").trim();
    const secretEnv = String(entry.secretEnv ?? "").trim().toUpperCase();
    if (!RESEARCH_WORKER_IDS.includes(id) || !isPublicWorkerEndpoint(endpoint) || !/^[A-Z][A-Z0-9_]{1,80}$/.test(secretEnv)) return null;
    return {
      id,
      endpoint,
      secretEnv,
      enabled: entry.enabled === true,
      allowed: entry.allowed !== false,
      capabilities: ["extract"],
      costMicros: boundedNumber(entry.costMicros, 0, 100_000_000, 0),
      latencyMs: boundedNumber(entry.latencyMs, 0, 120_000, 30_000),
      reliability: boundedNumber(entry.reliability, 0, 1, 0.9),
      ...(typeof entry.evidenceRef === "string" && entry.evidenceRef.trim() ? { evidenceRef: entry.evidenceRef.trim().slice(0, 240) } : {}),
    };
  }).filter(Boolean);
}

export function validateResearchWorkerConfig({ value, secretNames = [], providerAllowlist = [], fail }) {
  if (value == null) return;
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value).map(([id, config]) => ({ id, ...(config && typeof config === "object" && !Array.isArray(config) ? config : {}) }))
      : null;
  if (!entries) return fail("researchWorkerConfig must be an array or object");
  const seen = new Set();
  const allowedSecrets = new Set(providerAllowlist.map((item) => String(item).trim().toUpperCase()));
  const availableSecrets = new Set(secretNames.map((item) => String(item).trim().toUpperCase()));
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail("researchWorkerConfig entries must be objects");
    const id = String(entry.id ?? "").trim().toLowerCase();
    const endpoint = String(entry.endpoint ?? "").trim();
    const secretEnv = String(entry.secretEnv ?? "").trim().toUpperCase();
    if (!RESEARCH_WORKER_IDS.includes(id)) return fail(`researchWorkerConfig does not recognize worker: ${id}`);
    if (seen.has(id)) return fail(`researchWorkerConfig contains duplicate worker: ${id}`);
    seen.add(id);
    if (!isPublicWorkerEndpoint(endpoint)) return fail(`researchWorkerConfig.${id} requires a public HTTPS endpoint`);
    if (!/^[A-Z][A-Z0-9_]{1,80}$/.test(secretEnv)) return fail(`researchWorkerConfig.${id} has an invalid secretEnv`);
    if (!allowedSecrets.has(secretEnv) || !availableSecrets.has(secretEnv)) return fail(`researchWorkerConfig.${id} requires an allowlisted secret: ${secretEnv}`);
    if (entry.enabled === true && (typeof entry.evidenceRef !== "string" || !entry.evidenceRef.trim())) return fail(`researchWorkerConfig.${id} cannot enable without evidenceRef`);
  }
}

function isPublicWorkerEndpoint(value) {
  if (!value || value.length > 500 || !/^https:\/\/[^\s]+$/i.test(value)) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return !url.username && !url.password && !["localhost", "127.0.0.1", "::1"].includes(host)
      && !host.endsWith(".internal") && !host.endsWith(".local")
      && !/^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  } catch {
    return false;
  }
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function validateProviderActivation({
  enabled,
  providerAllowlist,
  secretNames,
  modelAllowlist,
  providerModelAllowlist,
  modelPricing,
  enabledCapabilities,
  capabilityProviderAllowlist = {},
  researchProvider = "firecrawl",
  seoAllowedHosts = [],
  deliveryAllowedHosts = [],
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
  const selectedCapabilities = normalizeCapabilityProviderAllowlist(capabilityProviderAllowlist);
  for (const capability of enabledCapabilities) {
    const configuredProviders = selectedCapabilities[capability];
    const selectedProviders = configuredProviders ?? ((capability === "seo" || capability === "seo-research") && researchProvider === "brave" ? ["brave"] : undefined);
    const providerKeys = selectedProviders
      ? selectedProviders.map((provider) => {
        const providerKey = CAPABILITY_PROVIDERS[capability]?.[provider];
        if (!providerKey) fail(`Capability ${capability} does not recognize provider: ${provider}`);
        return providerKey;
      })
      : CAPABILITY_SECRET_KEYS[capability] ?? [];
    if (selectedProviders && selectedProviders.length === 0) fail(`Capability ${capability} requires at least one selected provider`);
    for (const providerKey of providerKeys) {
      if (!allowedSecrets.has(providerKey) || !availableSecrets.has(providerKey)) {
        fail(`Capability ${capability} requires an allowlisted Secret Manager slot for ${providerKey}`);
      }
    }
  }
  if ((enabledCapabilities.includes("seo") || enabledCapabilities.includes("seo-research")) && seoAllowedHosts.length === 0) {
    fail("SEO capability requires a non-empty public host allowlist");
  }
  if (enabledCapabilities.includes("delivery") && deliveryAllowedHosts.length === 0) {
    fail("Delivery capability requires a non-empty approved webhook host allowlist");
  }
}
