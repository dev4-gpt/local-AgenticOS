/**
 * Dependency-free native Brave Search boundary.
 *
 * This is intentionally not the Hermes MCP connector. The client runtime
 * supplies a tenant-approved server-side key and receives only bounded,
 * citation-ready web results.
 */

export const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
export const BRAVE_MAX_RESULTS = 3;
export const BRAVE_MAX_QUERY_LENGTH = 400;

export type BraveSearchResult = {
  url: string;
  title: string;
  description: string;
  markdown: string;
};

type BraveResponse = {
  web?: {
    results?: unknown;
  };
};

export function normalizeBraveSearchResponse(payload: unknown, limit = BRAVE_MAX_RESULTS): BraveSearchResult[] {
  const boundedLimit = Math.max(1, Math.min(BRAVE_MAX_RESULTS, Math.round(limit)));
  const rows = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as BraveResponse).web?.results
    : undefined;
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!/^https:\/\/[^\s]+$/i.test(url)) return [];
    let parsed: URL;
    try { parsed = new URL(url); } catch { return []; }
    if (parsed.username || parsed.password) return [];
    return [{
      url: parsed.toString(),
      title: typeof row.title === "string" ? row.title.trim().slice(0, 240) : "",
      description: typeof row.description === "string" ? row.description.trim().slice(0, 600) : "",
      markdown: "",
    } satisfies BraveSearchResult];
  }).slice(0, boundedLimit);
}

export async function searchBraveWeb(input: {
  query: string;
  limit?: number;
  apiKey: string;
  fetchImpl?: typeof fetch;
}) {
  const query = input.query.trim().slice(0, BRAVE_MAX_QUERY_LENGTH);
  if (!query) return { ok: false as const, status: 400, error: "research_query_required" };
  if (!input.apiKey.trim()) return { ok: false as const, status: 503, error: "provider_not_configured" };
  const limit = Math.max(1, Math.min(BRAVE_MAX_RESULTS, Math.round(input.limit ?? BRAVE_MAX_RESULTS)));
  const endpoint = new URL(BRAVE_SEARCH_ENDPOINT);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("count", String(limit));
  endpoint.searchParams.set("safesearch", "strict");
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": input.apiKey,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response) return { ok: false as const, status: 503, error: "provider_unreachable" };
  if (!response.ok) return { ok: false as const, status: response.status === 429 ? 429 : 502, error: response.status === 429 ? "research_rate_limited" : "provider_request_failed" };
  const raw = await response.text().catch(() => "");
  let payload: unknown = null;
  try { payload = JSON.parse(raw); } catch { /* malformed provider payload */ }
  const results = normalizeBraveSearchResponse(payload, limit);
  return {
    ok: true as const,
    provider: "brave" as const,
    model: "web-search",
    query,
    results,
    estimatedCostMicros: Math.max(0, Math.round(Number(process.env.CLIENT_BRAVE_COST_MICROS ?? 0))),
  };
}
