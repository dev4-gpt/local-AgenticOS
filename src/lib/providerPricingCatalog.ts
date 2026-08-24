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
}

const VERIFIED_AT = "2026-08-22";
const snapshot = (input: Omit<ProviderPricingSnapshot, "version" | "verifiedAt" | "staleAfterDays" | "lastVerifiedLabel">): ProviderPricingSnapshot => ({
  ...input,
  version: "v2026-08-22",
  verifiedAt: VERIFIED_AT,
  staleAfterDays: 30,
  lastVerifiedLabel: `Last verified ${VERIFIED_AT}`,
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
