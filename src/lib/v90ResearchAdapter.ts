import {
  V90_CONTRACT_VERSION,
  normalizeV90ResearchRecord,
  validateV90ResearchRequest,
  type V90StructuredResearchRecord,
  type V90StructuredResearchRequest,
} from "@/lib/v90Contracts";

export type V90ResearchRequestInput = Omit<V90StructuredResearchRequest, "contractVersion">;

/** Build the provider-neutral request that ScrapeGraphAI or Firecrawl may implement. */
export function createV90ResearchRequest(input: V90ResearchRequestInput): V90StructuredResearchRequest {
  const request = { ...input, contractVersion: V90_CONTRACT_VERSION } satisfies V90StructuredResearchRequest;
  const errors = validateV90ResearchRequest(request);
  if (errors.length) throw new Error(`v90 research request rejected: ${errors.join("; ")}`);
  return request;
}

/**
 * Accept provider output only when it remains tenant-scoped and all evidence
 * stays on one of the explicitly allowlisted public origins. DNS resolution,
 * robots/terms checks, and rate limiting belong in the worker before fetch.
 */
export function acceptV90ResearchRecord(request: V90StructuredResearchRequest, record: V90StructuredResearchRecord) {
  if (record.tenantSlug !== request.tenantSlug) throw new Error("v90 research result crossed tenant scope");
  const allowedOrigins = new Set(request.sourceUrls.map((source) => new URL(source).origin));
  const urls = [record.sourceUrl, ...record.citations.map((citation) => citation.url)];
  if (urls.some((url) => !allowedOrigins.has(new URL(url).origin))) throw new Error("v90 research evidence is outside the source allowlist");
  const normalized = normalizeV90ResearchRecord(record);
  if (!normalized) throw new Error("v90 research result failed the citation and schema checks");
  return normalized;
}
