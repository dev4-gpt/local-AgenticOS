import { providerEnvKey } from "@/lib/providerKeys";
import { clientProviderEnabled } from "@/lib/clientRuntimePolicy";
import { isPrivateAddress, readBoundedResponseBytes, resolvesToPublicAddresses } from "@/lib/clientNetworkSafety";

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";
const MAX_URL_LENGTH = 2000;
type FirecrawlResponse = {
  success?: boolean;
  data?: { markdown?: unknown; metadata?: Record<string, unknown> };
};

export async function runClientSeoAdapter(input: { url: string; focus?: string }) {
  if (!clientProviderEnabled("FIRECRAWL_API_KEY")) return { ok: false as const, status: 403, error: "provider_not_allowlisted" };
  const key = providerEnvKey("FIRECRAWL_API_KEY");
  if (!key) return { ok: false as const, status: 503, error: "provider_not_configured" };
  const url = await resolveSafePublicUrl(input.url);
  if (!url) return { ok: false as const, status: 400, error: "seo_url_not_allowed" };

  const response = await fetch(FIRECRAWL_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      formats: ["markdown"],
      blockAds: true,
      storeInCache: true,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!response?.ok) return { ok: false as const, status: response?.status ?? 503, error: "provider_request_failed" };
  const responseBytes = await readBoundedResponseBytes(response, 4_000_000);
  let data: FirecrawlResponse | null = null;
  if (responseBytes) {
    try { data = JSON.parse(responseBytes.toString("utf8")) as FirecrawlResponse; } catch { data = null; }
  }
  const markdown = typeof data?.data?.markdown === "string" ? data.data.markdown.slice(0, 40_000) : "";
  if (!markdown) return { ok: false as const, status: 502, error: "provider_output_invalid" };
  return {
    ok: true as const,
    provider: "firecrawl",
    model: "scrape-markdown",
    url,
    focus: (input.focus ?? "").trim().slice(0, 500),
    markdown,
    metadata: data?.data?.metadata ?? {},
    estimatedCostMicros: Math.max(0, Math.round(Number(process.env.CLIENT_FIRECRAWL_COST_MICROS ?? 1000))),
  };
}

export async function resolveSafePublicUrl(value: string, allowedHosts?: string[]) {
  const safeUrl = safePublicUrl(value, allowedHosts);
  if (!safeUrl) return null;
  try {
    const hostname = new URL(safeUrl).hostname;
    return await resolvesToPublicAddresses(hostname) ? safeUrl : null;
  } catch {
    return null;
  }
}

export function safePublicUrl(value: string, allowedHosts?: string[]) {
  const raw = value.trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isPrivateAddress(hostname)) return null;
  const allowlist = allowedHosts ?? (process.env.CLIENT_SEO_ALLOWED_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (allowlist.length === 0 || !allowlist.some((host) => hostname === host || hostname.endsWith(`.${host}`))) return null;
  parsed.hash = "";
  return parsed.toString();
}

// --- Market research -------------------------------------------------------
//
// Scraping and searching need different safety postures, and collapsing them
// would either block the use case or widen the wrong thing.
//
// A direct scrape points our runtime at a host the tenant named, so it keeps
// the host allowlist and the DNS check: that is the path an attacker would use
// to reach something internal.
//
// A search names no host. Firecrawl does the fetching and returns text, so
// there is no request from our network to allowlist. The real risks there are
// cost and trusting the result, which are handled by a bounded result count and
// by treating every returned page as untrusted data that must be cited rather
// than believed.
//
// Following a search result is the middle case. It is allowed, because research
// that cannot read what it found is not research, but only for URLs that came
// back from the search in the same job - never a URL the caller supplied. That
// keeps the open web reachable while leaving the "point it at anything" path
// closed.

const FIRECRAWL_SEARCH_ENDPOINT = "https://api.firecrawl.dev/v1/search";
const MAX_SEARCH_RESULTS = 10;

export type MarketSearchResult = {
  url: string;
  title: string;
  description: string;
  markdown: string;
};

export async function runClientMarketSearch(input: { query: string; limit?: number; scrapeResults?: boolean }) {
  if (!clientProviderEnabled("FIRECRAWL_API_KEY")) return { ok: false as const, status: 403, error: "provider_not_allowlisted" };
  const key = providerEnvKey("FIRECRAWL_API_KEY");
  if (!key) return { ok: false as const, status: 503, error: "provider_not_configured" };
  const query = input.query.trim().slice(0, 400);
  if (!query) return { ok: false as const, status: 400, error: "research_query_required" };
  const limit = Math.max(1, Math.min(MAX_SEARCH_RESULTS, Math.round(input.limit ?? 5)));

  const response = await fetch(FIRECRAWL_SEARCH_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit,
      // Ask for page content only when the caller wants it: it multiplies cost
      // per result and is not needed to decide which sources are worth reading.
      ...(input.scrapeResults ? { scrapeOptions: { formats: ["markdown"], onlyMainContent: true } } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  }).catch(() => null);

  if (!response) return { ok: false as const, status: 503, error: "provider_unreachable" };
  if (!response.ok) return { ok: false as const, status: response.status === 429 ? 429 : 502, error: response.status === 429 ? "research_rate_limited" : "provider_request_failed" };

  const bytes = await readBoundedResponseBytes(response, 6_000_000);
  let parsed: { data?: unknown } | null = null;
  if (bytes) { try { parsed = JSON.parse(bytes.toString("utf8")) as { data?: unknown }; } catch { parsed = null; } }
  const rows = Array.isArray(parsed?.data) ? parsed.data : [];

  const results: MarketSearchResult[] = rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const url = typeof item.url === "string" ? item.url : "";
    // A result our own fetcher could not safely follow is still worth showing
    // as a source, but it is recorded with its origin so nothing is implied
    // about content we never read.
    if (!url || !/^https:\/\//i.test(url)) return [];
    return [{
      url,
      title: typeof item.title === "string" ? item.title.slice(0, 240) : "",
      description: typeof item.description === "string" ? item.description.slice(0, 600) : "",
      markdown: typeof item.markdown === "string" ? item.markdown.slice(0, 12_000) : "",
    }];
  }).slice(0, limit);

  const perResult = Math.max(0, Math.round(Number(process.env.CLIENT_FIRECRAWL_COST_MICROS ?? 1000)));
  return {
    ok: true as const,
    provider: "firecrawl",
    model: input.scrapeResults ? "search-scrape" : "search",
    query,
    results,
    // Searching costs one unit; scraping each result costs another.
    estimatedCostMicros: perResult * (input.scrapeResults ? results.length + 1 : 1),
  };
}

/**
 * A URL is followable when the search returned it in this same job. The caller
 * cannot widen this by passing its own list, because `discovered` comes from
 * the search response rather than from the request body.
 */
export async function resolveDiscoveredUrl(value: string, discovered: readonly string[]) {
  const raw = value.trim();
  if (!raw || !discovered.includes(raw)) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isPrivateAddress(hostname)) return null;
  return await resolvesToPublicAddresses(hostname) ? parsed.toString() : null;
}
