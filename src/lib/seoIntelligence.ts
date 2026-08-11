import {
  CAPABILITY_CONTRACT_VERSION,
  isValidCapabilityTenantSlug,
  isValidCapabilityRequestId,
  type CapabilityCitationReference,
} from "@/lib/capabilityContracts";
import { isAllowedV96ResearchUrl } from "@/lib/v96Contracts";

export const SEO_INTELLIGENCE_PROVIDERS = ["firecrawl", "openseo"] as const;
export type SeoIntelligenceProvider = (typeof SEO_INTELLIGENCE_PROVIDERS)[number];
export const SEO_METRICS = ["keywords", "rankings", "competitors", "backlinks", "audits", "ai-visibility"] as const;
export type SeoMetric = (typeof SEO_METRICS)[number];

export interface SeoIntelligenceRequest {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  requestId: string;
  tenantSlug: string;
  provider: SeoIntelligenceProvider;
  domain: string;
  metrics: readonly SeoMetric[];
  maxRows: number;
}

export interface SeoIntelligenceRecord {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  requestId: string;
  tenantSlug: string;
  provider: SeoIntelligenceProvider;
  domain: string;
  retrievedAt: string;
  status: "complete" | "partial" | "failed";
  metrics: Readonly<Record<SeoMetric, readonly Record<string, string | number | boolean | null>[]>>;
  citations: readonly CapabilityCitationReference[];
  providerCostMicros: number;
  failureReason?: string;
}

export function createSeoIntelligenceRequest(input: Omit<SeoIntelligenceRequest, "contractVersion">): SeoIntelligenceRequest {
  const request = { ...input, contractVersion: CAPABILITY_CONTRACT_VERSION } satisfies SeoIntelligenceRequest;
  const errors = validateSeoIntelligenceRequest(request);
  if (errors.length) throw new Error(`seo intelligence request rejected: ${errors.join("; ")}`);
  return request;
}

export function validateSeoIntelligenceRequest(input: Partial<SeoIntelligenceRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.requestId || !isValidCapabilityRequestId(input.requestId)) errors.push("requestId is invalid");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.provider || !(SEO_INTELLIGENCE_PROVIDERS as readonly string[]).includes(input.provider)) errors.push("provider is invalid");
  if (!input.domain || !isAllowedV96ResearchUrl(input.domain)) errors.push("domain must be a public https URL");
  if (!Array.isArray(input.metrics) || input.metrics.length < 1 || input.metrics.length > SEO_METRICS.length) errors.push("metrics must contain 1 to 6 values");
  if (Array.isArray(input.metrics) && input.metrics.some((metric) => !(SEO_METRICS as readonly string[]).includes(metric))) errors.push("metrics contains an unsupported value");
  if (!Number.isInteger(input.maxRows) || (input.maxRows ?? 0) < 1 || (input.maxRows ?? 0) > 100) errors.push("maxRows must be between 1 and 100");
  return errors;
}

export function normalizeSeoIntelligenceRecord(input: SeoIntelligenceRecord): SeoIntelligenceRecord | null {
  if (validateSeoIntelligenceRequest({
    contractVersion: input.contractVersion,
    requestId: input.requestId,
    tenantSlug: input.tenantSlug,
    provider: input.provider,
    domain: input.domain,
    metrics: SEO_METRICS,
    maxRows: 1,
  }).length > 0) return null;
  if (!input.retrievedAt || !Number.isFinite(Date.parse(input.retrievedAt))) return null;
  if (!Number.isSafeInteger(input.providerCostMicros) || input.providerCostMicros < 0) return null;
  if (!Array.isArray(input.citations) || input.citations.some((citation) => !citation.id || !isAllowedV96ResearchUrl(citation.url) || !citation.evidence.trim())) return null;
  if (input.status === "failed" && !input.failureReason?.trim()) return null;
  return {
    ...input,
    providerCostMicros: Math.max(0, Math.round(input.providerCostMicros)),
    citations: input.citations.map((citation) => ({ ...citation, evidence: citation.evidence.slice(0, 4000) })),
  };
}

export function firecrawlSearchToSeoIntelligenceRecord(input: {
  request: SeoIntelligenceRequest;
  results: readonly { url: string; title: string; description: string; markdown: string }[];
  providerCostMicros: number;
  retrievedAt?: string;
}): SeoIntelligenceRecord {
  const retrievedAt = input.retrievedAt ?? new Date().toISOString();
  const citations = input.results.flatMap((result, index) => {
    const evidence = (result.markdown || result.description).trim().slice(0, 4000);
    return evidence && isAllowedV96ResearchUrl(result.url)
      ? [{ id: `seo-citation-${index + 1}`, url: result.url, retrievedAt, evidence }]
      : [];
  });
  const rows = input.results.slice(0, input.request.maxRows).map((result) => ({
    source: result.url,
    title: result.title || null,
    summary: result.description || null,
    hasPageContent: Boolean(result.markdown.trim()),
  }));
  const metrics = {
    keywords: [],
    rankings: [],
    competitors: rows,
    backlinks: [],
    audits: [],
    "ai-visibility": [],
  } satisfies SeoIntelligenceRecord["metrics"];
  return {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    requestId: input.request.requestId,
    tenantSlug: input.request.tenantSlug,
    provider: input.request.provider,
    domain: input.request.domain,
    retrievedAt,
    status: citations.length ? (citations.length === rows.length ? "complete" : "partial") : "failed",
    metrics,
    citations,
    providerCostMicros: Math.max(0, Math.round(input.providerCostMicros)),
    ...(citations.length ? {} : { failureReason: "no attributable evidence returned" }),
  };
}

/**
 * Normalize an operator-supplied OpenSEO/DataForSEO response without allowing
 * the upstream payload shape to leak into the client contract. The adapter is
 * intentionally pure: network access, credential lookup, DNS policy, and
 * budget settlement stay in the worker that calls it.
 */
export function openSeoPayloadToIntelligenceRecord(input: {
  request: SeoIntelligenceRequest;
  payload: unknown;
  providerCostMicros: number;
  retrievedAt?: string;
}): SeoIntelligenceRecord {
  const retrievedAt = input.retrievedAt ?? new Date().toISOString();
  const payload = input.payload && typeof input.payload === "object" ? input.payload as Record<string, unknown> : {};
  const rowsFor = (metric: SeoMetric) => {
    const raw = payload[metric] ?? payload[metric === "ai-visibility" ? "ai_visibility" : metric];
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, input.request.maxRows).flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const row = value as Record<string, unknown>;
      const normalized: Record<string, string | number | boolean | null> = {};
      for (const [key, entry] of Object.entries(row).slice(0, 32)) {
        if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(key)) continue;
        if (entry === null || typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") normalized[key] = typeof entry === "string" ? entry.slice(0, 500) : entry;
      }
      return Object.keys(normalized).length ? [normalized] : [];
    });
  };
  const metrics = {
    keywords: rowsFor("keywords"),
    rankings: rowsFor("rankings"),
    competitors: rowsFor("competitors"),
    backlinks: rowsFor("backlinks"),
    audits: rowsFor("audits"),
    "ai-visibility": rowsFor("ai-visibility"),
  } satisfies SeoIntelligenceRecord["metrics"];
  const citations = Object.values(metrics).flatMap((rows) => rows.flatMap((row, index) => {
    const url = typeof row.url === "string" ? row.url : typeof row.source_url === "string" ? row.source_url : "";
    const evidence = typeof row.evidence === "string" ? row.evidence : typeof row.title === "string" ? row.title : "";
    return isAllowedV96ResearchUrl(url) && evidence.trim()
      ? [{ id: `openseo-citation-${index + 1}`, url, retrievedAt, evidence: evidence.trim().slice(0, 4000) }]
      : [];
  }));
  const hasRows = Object.values(metrics).some((rows) => rows.length > 0);
  return {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    requestId: input.request.requestId,
    tenantSlug: input.request.tenantSlug,
    provider: "openseo",
    domain: input.request.domain,
    retrievedAt,
    status: hasRows ? (citations.length ? "complete" : "partial") : "failed",
    metrics,
    citations,
    providerCostMicros: Math.max(0, Math.round(input.providerCostMicros)),
    ...(hasRows ? {} : { failureReason: "no bounded SEO metrics returned" }),
  };
}
