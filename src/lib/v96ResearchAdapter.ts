import {
  V96_CONTRACT_VERSION,
  normalizeV96ResearchRecord,
  validateV96ResearchRequest,
  type V96StructuredResearchRecord,
  type V96StructuredResearchRequest,
} from "@/lib/v96Contracts";

export type V96ResearchRequestInput = Omit<V96StructuredResearchRequest, "contractVersion">;

/** Build the provider-neutral request that ScrapeGraphAI or Firecrawl may implement. */
export function createV96ResearchRequest(input: V96ResearchRequestInput): V96StructuredResearchRequest {
  const request = { ...input, contractVersion: V96_CONTRACT_VERSION } satisfies V96StructuredResearchRequest;
  const errors = validateV96ResearchRequest(request);
  if (errors.length) throw new Error(`v96 research request rejected: ${errors.join("; ")}`);
  return request;
}

/**
 * Accept provider output only when it remains tenant-scoped and all evidence
 * stays on one of the explicitly allowlisted public origins. DNS resolution,
 * robots/terms checks, and rate limiting belong in the worker before fetch.
 */
export function acceptV96ResearchRecord(request: V96StructuredResearchRequest, record: V96StructuredResearchRecord) {
  if (record.tenantSlug !== request.tenantSlug) throw new Error("v96 research result crossed tenant scope");
  const allowedOrigins = new Set(request.sourceUrls.map((source) => new URL(source).origin));
  const urls = [record.sourceUrl, ...record.citations.map((citation) => citation.url)];
  if (urls.some((url) => !allowedOrigins.has(new URL(url).origin))) throw new Error("v96 research evidence is outside the source allowlist");
  const normalized = normalizeV96ResearchRecord(record);
  if (!normalized) throw new Error("v96 research result failed the citation and schema checks");
  return normalized;
}
