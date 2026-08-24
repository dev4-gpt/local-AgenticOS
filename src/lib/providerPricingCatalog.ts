/**
 * Customer-visible pricing facts. These are snapshots, not promises: provider
 * prices and free tiers change, so execution must always persist the snapshot
 * id used for an estimate or settlement.
 */
export type PricingUnit =
  | "input-token-1m"
  | "output-token-1m"
  | "cached-token-1m"
  | "request-1k"
  | "request"
  | "page"
  | "character-1k"
  | "audio-hour"
  | "audio-minute"
  | "model-defined";

export type CustomerCostOwner = "client" | "veloce" | "shared";

export interface ProviderPricingOption {
  id: string;
  label: string;
  model: string;
  recommended?: boolean;
  units: readonly { unit: PricingUnit; priceMicros: number | null; display: string }[];
  notes?: string;
}

export interface ProviderPricingSnapshot {
  id: string;
  version: string;
  providerKey?: string;
  providerName: string;
  verifiedAt: string;
  sourceUrl: string;
  freeTier: string;
  costOwner: CustomerCostOwner;
  options: readonly ProviderPricingOption[];
  recommendedOptionId: string;
  staleAfterDays: number;
  lastVerifiedLabel: string;
  notes?: string;
}

const VERIFIED_AT = "2026-08-22";
const snapshot = (input: Omit<ProviderPricingSnapshot, "version" | "verifiedAt" | "staleAfterDays" | "lastVerifiedLabel">): ProviderPricingSnapshot => ({
  ...input,
  version: "v2026-08-22",
  verifiedAt: VERIFIED_AT,
  staleAfterDays: 30,
  lastVerifiedLabel: `Last verified ${VERIFIED_AT}`,
});

const snapshotAt = (verifiedAt: string, input: Omit<ProviderPricingSnapshot, "version" | "verifiedAt" | "staleAfterDays" | "lastVerifiedLabel">): ProviderPricingSnapshot => ({
  ...input,
  version: `v${verifiedAt}`,
  verifiedAt,
  staleAfterDays: 30,
  lastVerifiedLabel: `Last verified ${verifiedAt}`,
});

export const PROVIDER_PRICING_SNAPSHOTS: readonly ProviderPricingSnapshot[] = [
  snapshot({
    id: "pricing-openai-v2026-08-22", providerKey: "OPENAI_API_KEY", providerName: "OpenAI",
    sourceUrl: "https://platform.openai.com/pricing", freeTier: "No general API free tier stated; check account terms.", costOwner: "client",
    recommendedOptionId: "gpt-5.6-luna",
    options: [
      { id: "gpt-5.6-luna", label: "Lowest-cost text lane", model: "GPT-5.6 Luna", recommended: true, units: [{ unit: "input-token-1m", priceMicros: 200000, display: "$0.20 / 1M input tokens" }, { unit: "output-token-1m", priceMicros: 1200000, display: "$1.20 / 1M output tokens" }] },
      { id: "gpt-5.6-terra", label: "Balanced text lane", model: "GPT-5.6 Terra", units: [{ unit: "input-token-1m", priceMicros: 2000000, display: "$2.00 / 1M input tokens" }, { unit: "output-token-1m", priceMicros: 12000000, display: "$12.00 / 1M output tokens" }] },
      { id: "gpt-5.6-sol", label: "High-capability lane", model: "GPT-5.6 Sol", units: [{ unit: "input-token-1m", priceMicros: 5000000, display: "$5.00 / 1M input tokens" }, { unit: "cached-token-1m", priceMicros: 500000, display: "$0.50 / 1M cached tokens" }, { unit: "output-token-1m", priceMicros: 30000000, display: "$30.00 / 1M output tokens" }] },
    ],
  }),
  snapshot({
    id: "pricing-anthropic-v2026-08-22", providerKey: "ANTHROPIC_API_KEY", providerName: "Anthropic",
    sourceUrl: "https://www.anthropic.com/api", freeTier: "No general API free tier stated; check account terms.", costOwner: "client", recommendedOptionId: "claude-standard",
    options: [{ id: "claude-standard", label: "Standard API lane", model: "Selected Claude model", recommended: true, units: [{ unit: "input-token-1m", priceMicros: 3000000, display: "$3.00 / 1M input tokens" }, { unit: "output-token-1m", priceMicros: 15000000, display: "$15.00 / 1M output tokens" }] }, { id: "claude-batch", label: "Batch lane", model: "Selected Claude model", units: [{ unit: "input-token-1m", priceMicros: 1500000, display: "$1.50 / 1M input tokens" }, { unit: "output-token-1m", priceMicros: 7500000, display: "$7.50 / 1M output tokens" }] }],
  }),
  snapshot({
    id: "pricing-gemini-v2026-08-22", providerKey: "GEMINI_API_KEY", providerName: "Google Gemini",
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing", freeTier: "Limited free tier is model- and account-dependent.", costOwner: "client", recommendedOptionId: "gemini-flash-standard",
    options: [{ id: "gemini-flash-standard", label: "Flash standard", model: "Gemini 3.5 Flash", recommended: true, units: [{ unit: "input-token-1m", priceMicros: 1500000, display: "$1.50 / 1M input tokens" }, { unit: "output-token-1m", priceMicros: 9000000, display: "$9.00 / 1M output tokens" }] }, { id: "gemini-flash-batch", label: "Flash batch", model: "Gemini 3.5 Flash", units: [{ unit: "input-token-1m", priceMicros: 750000, display: "$0.75 / 1M input tokens" }, { unit: "output-token-1m", priceMicros: 4500000, display: "$4.50 / 1M output tokens" }] }],
  }),
  snapshot({
    id: "pricing-openrouter-v2026-08-22", providerKey: "OPENROUTER_API_KEY", providerName: "OpenRouter",
    sourceUrl: "https://openrouter.ai/pricing", freeTier: "25+ free models; 50 requests/day on free models (account/provider terms apply).", costOwner: "client", recommendedOptionId: "free-models",
    options: [{ id: "free-models", label: "Free-model lane", model: "Approved :free model", recommended: true, units: [{ unit: "request", priceMicros: 0, display: "$0 provider fee; 50 requests/day stated free limit" }], notes: "Free models remain subject to Veloce per-tenant quotas." }, { id: "payg", label: "Pay-as-you-go", model: "Selected model", units: [{ unit: "model-defined", priceMicros: null, display: "Model price plus stated platform fee" }] }],
  }),
  snapshot({
    id: "pricing-brave-v2026-08-22", providerKey: "BRAVE_API_KEY", providerName: "Brave Search", sourceUrl: "https://brave.com/search/api/", freeTier: "$5 monthly credits stated on the API page.", costOwner: "client", recommendedOptionId: "web-search", options: [{ id: "web-search", label: "Web Search", model: "Brave Search API", recommended: true, units: [{ unit: "request-1k", priceMicros: 5000000, display: "$5.00 / 1,000 search requests" }] }],
  }),
  snapshot({
    id: "pricing-jina-reader-v2026-08-22", providerKey: "JINA_READER_API_KEY", providerName: "Jina Reader", sourceUrl: "https://jina.ai/reader/", freeTier: "Basic reader endpoint is available without a key; rate limits apply.", costOwner: "veloce", recommendedOptionId: "reader-basic", options: [{ id: "reader-basic", label: "Native reader lane", model: "Jina Reader", recommended: true, units: [{ unit: "model-defined", priceMicros: 0, display: "No direct provider charge for the basic endpoint; infrastructure quota applies" }] }, { id: "reader-paid", label: "Paid reader key", model: "Jina Reader API", units: [{ unit: "input-token-1m", priceMicros: 50000, display: "Prototype reference: $0.050 / 1M tokens" }] }],
  }),
  snapshot({
    id: "pricing-firecrawl-v2026-08-22", providerKey: "FIRECRAWL_API_KEY", providerName: "Firecrawl", sourceUrl: "https://www.firecrawl.dev/pricing", freeTier: "1,000 credits/pages monthly stated on pricing page.", costOwner: "client", recommendedOptionId: "scrape", options: [{ id: "scrape", label: "Scrape", model: "Firecrawl scrape/crawl/map", recommended: true, units: [{ unit: "page", priceMicros: null, display: "1 credit/page; provider plan determines dollar value" }] }, { id: "search", label: "Search", model: "Firecrawl search", units: [{ unit: "request", priceMicros: null, display: "2 credits / 10 results" }] }],
  }),
  snapshot({
    id: "pricing-elevenlabs-v2026-08-22", providerKey: "ELEVENLABS_API_KEY", providerName: "ElevenLabs", sourceUrl: "https://elevenlabs.io/pricing/api", freeTier: "Plan-dependent free characters/minutes; verify in account.", costOwner: "client", recommendedOptionId: "flash-tts", options: [{ id: "flash-tts", label: "Flash/Turbo TTS", model: "Flash/Turbo", recommended: true, units: [{ unit: "character-1k", priceMicros: 50000, display: "$0.05 / 1K characters" }] }, { id: "multilingual-tts", label: "Multilingual TTS", model: "Multilingual v2/v3", units: [{ unit: "character-1k", priceMicros: 100000, display: "$0.10 / 1K characters" }] }],
  }),
  snapshotAt("2026-08-24", {
    id: "pricing-glm-v2026-08-24", providerKey: "GLM_API_KEY", providerName: "GLM / Z.ai", sourceUrl: "https://docs.z.ai/guides/overview/pricing", freeTier: "GLM-4.7-Flash is listed as free; account and model terms apply.", costOwner: "client", recommendedOptionId: "glm-5.1",
    options: [{ id: "glm-5.1", label: "Flagship text lane", model: "GLM-5.1", recommended: true, units: [{ unit: "input-token-1m", priceMicros: 1400000, display: "$1.40 / 1M input tokens" }, { unit: "cached-token-1m", priceMicros: 260000, display: "$0.26 / 1M cached input tokens" }, { unit: "output-token-1m", priceMicros: 4400000, display: "$4.40 / 1M output tokens" }] }, { id: "glm-4.7-flash", label: "Free flash lane", model: "GLM-4.7-Flash", units: [{ unit: "model-defined", priceMicros: 0, display: "Free provider rate listed; account and quota terms apply" }] }],
  }),
  snapshotAt("2026-08-24", {
    id: "pricing-xai-v2026-08-24", providerKey: "XAI_API_KEY", providerName: "xAI / Grok", sourceUrl: "https://docs.x.ai/developers/models/grok-4.6", freeTier: "No API free tier assumed; account terms and rate limits apply.", costOwner: "client", recommendedOptionId: "grok-4.6",
    options: [{ id: "grok-4.6", label: "Grok text lane", model: "grok-4.6", recommended: true, units: [{ unit: "input-token-1m", priceMicros: 2000000, display: "$2.00 / 1M input tokens" }, { unit: "cached-token-1m", priceMicros: 500000, display: "$0.50 / 1M cached tokens" }, { unit: "output-token-1m", priceMicros: 6000000, display: "$6.00 / 1M output tokens" }] }],
  }),
  snapshotAt("2026-08-24", {
    id: "pricing-sakana-v2026-08-24", providerKey: "SAKANA_API_KEY", providerName: "Sakana Fugu", sourceUrl: "https://console.sakana.ai/pricing", freeTier: "No verified free API tier; subscription and pay-as-you-go terms apply.", costOwner: "client", recommendedOptionId: "fugu-ultra",
    options: [{ id: "fugu-ultra", label: "Fugu Ultra", model: "fugu-ultra-v1.1", recommended: true, units: [{ unit: "input-token-1m", priceMicros: 5000000, display: "$5.00 / 1M input tokens" }, { unit: "cached-token-1m", priceMicros: 500000, display: "$0.50 / 1M cached input tokens" }, { unit: "output-token-1m", priceMicros: 30000000, display: "$30.00 / 1M output tokens" }] }],
    notes: "Sakana states that orchestration tokens in token_details are real billable usage and must be included in settlement.",
  }),
  snapshotAt("2026-08-24", {
    id: "pricing-groq-stt-v2026-08-24", providerKey: "GROQ_API_KEY", providerName: "Groq Speech-to-Text", sourceUrl: "https://console.groq.com/docs/speech-to-text", freeTier: "25 MB file limit on the free tier; account terms apply.", costOwner: "client", recommendedOptionId: "whisper-large-v3-turbo",
    options: [{ id: "whisper-large-v3-turbo", label: "Fast transcription", model: "whisper-large-v3-turbo", recommended: true, units: [{ unit: "audio-hour", priceMicros: 40000, display: "$0.04 / audio hour" }] }, { id: "whisper-large-v3", label: "Higher-accuracy transcription", model: "whisper-large-v3", units: [{ unit: "audio-hour", priceMicros: 111000, display: "$0.111 / audio hour" }] }],
  }),
  snapshotAt("2026-08-24", {
    id: "pricing-elevenlabs-music-v2026-08-24", providerKey: "ELEVENLABS_MUSIC_API_KEY", providerName: "ElevenLabs Music", sourceUrl: "https://elevenlabs.io/pricing/api", freeTier: "Plan-dependent generation minutes; API access and commercial terms apply.", costOwner: "client", recommendedOptionId: "eleven-music",
    options: [{ id: "eleven-music", label: "Music generation", model: "Eleven Music", recommended: true, units: [{ unit: "audio-minute", priceMicros: 150000, display: "$0.15 / generated minute" }] }],
    notes: "The official API page notes enterprise availability for Eleven Music API; keep account entitlement and rights approval as separate gates.",
  }),
  snapshotAt("2026-08-24", {
    id: "pricing-heygen-v2026-08-24", providerKey: "HEYGEN_API_KEY", providerName: "HeyGen", sourceUrl: "https://developers.heygen.com/docs/pricing", freeTier: "No credit card needed for the self-serve trial; API wallet and account terms apply.", costOwner: "client", recommendedOptionId: "avatar-video",
    options: [{ id: "avatar-video", label: "Avatar video", model: "Avatar III–V", recommended: true, units: [{ unit: "model-defined", priceMicros: null, display: "$0.0167–$0.0667 / output second depending on avatar engine" }] }, { id: "cinematic-video", label: "Cinematic avatar", model: "Cinematic Avatar", units: [{ unit: "request", priceMicros: 7000000, display: "$7.00 / video" }] }],
    notes: "HeyGen bills API usage from a prepaid USD wallet; the provider's API pricing page is the authority for engine and output-duration selection.",
  }),
  snapshotAt("2026-08-24", {
    id: "pricing-hunter-v2026-08-24", providerKey: "HUNTER_API_KEY", providerName: "Hunter", sourceUrl: "https://help.hunter.io/en/articles/1970956-hunter-api", freeTier: "Free plan includes 50 credits per month; account plan terms apply.", costOwner: "client", recommendedOptionId: "domain-search",
    options: [{ id: "domain-search", label: "Domain search", model: "Hunter Domain Search", recommended: true, units: [{ unit: "request", priceMicros: null, display: "1 credit per 1–10 returned email addresses; plan sets dollar value" }] }, { id: "email-verifier", label: "Email verification", model: "Hunter Email Verifier", units: [{ unit: "request", priceMicros: null, display: "0.5 credits per verification; plan sets dollar value" }] }],
    notes: "Hunter's API documentation defines credit consumption; the exact dollar value depends on the client's selected plan and must be captured in the tenant estimate.",
  }),
];

const FALLBACK_SOURCE = "https://veloceos.cloud/provider-catalog";
export function pricingSnapshotForCredential(providerKey: string) {
  if (!providerKey.trim()) return null;
  return PROVIDER_PRICING_SNAPSHOTS.find((item) => item.providerKey === providerKey) ?? snapshot({ id: `pricing-${providerKey.toLowerCase()}-unverified`, providerKey, providerName: providerKey, sourceUrl: FALLBACK_SOURCE, freeTier: "No verified free tier in the current snapshot.", costOwner: "client", recommendedOptionId: "provider-defined", options: [{ id: "provider-defined", label: "Provider-defined", model: "Selected provider model", recommended: true, units: [{ unit: "model-defined", priceMicros: null, display: "Verify current provider pricing before execution" }] }] });
}

export function verifiedPricingSnapshotForCredential(providerKey: string) {
  if (!providerKey.trim()) return null;
  return PROVIDER_PRICING_SNAPSHOTS.find((item) => item.providerKey === providerKey) ?? null;
}

export function pricingSnapshotForCatalog(input: { credentialKey?: string; name: string }) {
  return input.credentialKey ? pricingSnapshotForCredential(input.credentialKey) : null;
}

export function pricingDisplay(snapshotValue: ProviderPricingSnapshot | null) {
  if (!snapshotValue) return "No direct provider fee; platform or worker cost may apply.";
  return snapshotValue.options.flatMap((option) => option.units.map((unit) => `${option.model}: ${unit.display}`)).join(" · ");
}
