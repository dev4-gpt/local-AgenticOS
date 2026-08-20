export type GovernedResearchProvider = "firecrawl" | "brave";

export type ResearchProviderDecision = {
  provider: GovernedResearchProvider;
  mode: "manifest" | "automatic";
  policyVersion: "research-routing-v1";
  reason: "manifest-provider" | "bounded-search-cost" | "content-extraction" | "external-worker-extraction" | "brave-unavailable" | "firecrawl-fallback";
  eligibleProviders: GovernedResearchProvider[];
  estimatedCostMicros: number;
};

type ProviderState = {
  available: boolean;
  allowed: boolean;
  costMicros: number;
};

type ProviderSelectionInput = {
  configuredProvider: GovernedResearchProvider;
  routingEnabled: boolean;
  scrapeRequested: boolean;
  externalExtractionAvailable?: boolean;
  firecrawl: ProviderState;
  brave: ProviderState;
};

/** Select only among server-approved, configured research providers. */
export function selectResearchProvider(input: ProviderSelectionInput): ResearchProviderDecision | { error: "provider_not_configured" | "provider_not_allowlisted" } {
  const eligibleProviders = (Object.entries({ firecrawl: input.firecrawl, brave: input.brave }) as Array<[GovernedResearchProvider, ProviderState]>)
    .filter(([, state]) => state.available && state.allowed)
    .map(([provider]) => provider);

  const choose = (provider: GovernedResearchProvider, mode: ResearchProviderDecision["mode"], reason: ResearchProviderDecision["reason"]): ResearchProviderDecision => ({
    provider,
    mode,
    policyVersion: "research-routing-v1",
    reason,
    eligibleProviders,
    estimatedCostMicros: input[provider].costMicros,
  });

  if (!input.routingEnabled) {
    if (!input[input.configuredProvider].available) return { error: "provider_not_configured" };
    if (!input[input.configuredProvider].allowed) return { error: "provider_not_allowlisted" };
    return choose(input.configuredProvider, "manifest", "manifest-provider");
  }

  if (input.scrapeRequested) {
    if (input.firecrawl.available && input.firecrawl.allowed) return choose("firecrawl", "automatic", "content-extraction");
    // Brave remains the bounded search provider. If Firecrawl extraction is
    // unavailable, an approved isolated Veloce worker may read only the
    // HTTPS URLs returned by that search. The worker is selected separately
    // from the content type and cost policy; it is never a client selector.
    if (input.externalExtractionAvailable && input.brave.available && input.brave.allowed) {
      return choose("brave", "automatic", "external-worker-extraction");
    }
    return { error: input.firecrawl.available ? "provider_not_allowlisted" : "provider_not_configured" };
  }

  const searchCandidates = (['brave', 'firecrawl'] as GovernedResearchProvider[])
    .filter((provider) => input[provider].available && input[provider].allowed)
    .sort((left, right) => input[left].costMicros - input[right].costMicros);
  const cheapest = searchCandidates[0];
  if (cheapest === "brave") return choose("brave", "automatic", "bounded-search-cost");
  if (cheapest === "firecrawl") {
    return choose("firecrawl", "automatic", input.brave.available && input.brave.allowed ? "firecrawl-fallback" : "brave-unavailable");
  }
  if (!input.brave.available && !input.firecrawl.available) return { error: "provider_not_configured" };
  return { error: "provider_not_allowlisted" };
}
