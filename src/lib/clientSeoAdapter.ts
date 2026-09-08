import { clientExecutionCredential } from "@/lib/clientExecutionCredential";
import { randomUUID } from "node:crypto";
import { V96_CONTRACT_VERSION, type V96StructuredResearchRecord } from "@/lib/v96Contracts";
import { clientProviderEnabled } from "@/lib/clientRuntimePolicy";
import { isPrivateAddress, readBoundedResponseBytes, resolvesToPublicAddresses } from "@/lib/clientNetworkSafety";
import { searchBraveWeb, type BraveSearchResult } from "@/lib/braveSearchAdapter";

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";
const MAX_URL_LENGTH = 2000;
type FirecrawlResponse = {
  success?: boolean;
  data?: { markdown?: unknown; metadata?: Record<string, unknown> };
};

export async function runClientSeoAdapter(input: { url: string; focus?: string }) {
  if (!clientProviderEnabled("FIRECRAWL_API_KEY")) return { ok: false as const, status: 403, error: "provider_not_allowlisted" };
  const key = await clientExecutionCredential("FIRECRAWL_API_KEY");
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

export type MarketSearchProvider = "firecrawl" | "brave";

export async function runClientMarketSearch(input: { query: string; limit?: number; scrapeResults?: boolean; provider?: MarketSearchProvider }) {
  const provider = input.provider === "brave" ? "brave" : "firecrawl";
  const providerKey = provider === "brave" ? "BRAVE_API_KEY" : "FIRECRAWL_API_KEY";
  if (!clientProviderEnabled(providerKey)) return { ok: false as const, status: 403, error: "provider_not_allowlisted" };
  const key = await clientExecutionCredential(providerKey);
  if (!key) return { ok: false as const, status: 503, error: "provider_not_configured" };
  const query = input.query.trim().slice(0, 400);
  if (!query) return { ok: false as const, status: 400, error: "research_query_required" };
  const limit = Math.max(1, Math.min(MAX_SEARCH_RESULTS, Math.round(input.limit ?? 5)));

  if (provider === "brave") {
    const result = await searchBraveWeb({ query, limit, apiKey: key });
    return result.ok ? { ...result, results: result.results satisfies BraveSearchResult[] } : result;
  }

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

// --- AEO ------------------------------------------------------------------
//
// Answer Engine Optimisation asks whether AI crawlers may read a site, whether
// it publishes an llms.txt, and whether its pages carry structured data. It
// reads only robots.txt and llms.txt on a host the client named, so it goes
// through the same allowlist and DNS checks as any other named-target fetch.

export type AeoCrawlerVerdict = { name: string; agent: string; allowed: boolean };

export type AeoReport = {
  site: string;
  robotsChecked: boolean;
  crawlers: AeoCrawlerVerdict[];
  llmsTxt: { present: boolean; url: string };
  structuredData: { present: boolean };
  fetchedAt: string;
};

const AEO_AGENTS: ReadonlyArray<{ name: string; agent: string }> = [
  { name: "ChatGPT", agent: "GPTBot" },
  { name: "ChatGPT-User", agent: "ChatGPT-User" },
  { name: "Claude", agent: "ClaudeBot" },
  { name: "Perplexity", agent: "PerplexityBot" },
  { name: "Google-Extended", agent: "Google-Extended" },
  { name: "Applebot-Extended", agent: "Applebot-Extended" },
];

/**
 * Absence of a rule means allowed, which is how robots.txt actually works: a
 * crawler not named anywhere is not blocked. Reporting "unknown" would be
 * softer but wrong, and the whole point of the check is to tell a client
 * whether these crawlers can read them today.
 */
export function evaluateRobotsForAgents(robots: string): AeoCrawlerVerdict[] {
  const lines = robots.split("\n").map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean);
  const groups: Array<{ agents: string[]; disallows: string[] }> = [];
  let current: { agents: string[]; disallows: string[] } | null = null;
  let previousWasAgent = false;
  for (const line of lines) {
    const [rawField, ...rest] = line.split(":");
    const field = rawField.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (field === "user-agent") {
      if (!current || !previousWasAgent) { current = { agents: [], disallows: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      previousWasAgent = true;
    } else if (current && field === "disallow") {
      current.disallows.push(value);
      previousWasAgent = false;
    } else {
      previousWasAgent = false;
    }
  }
  const blocks = (agent: string) => {
    const lower = agent.toLowerCase();
    const matching = groups.filter((group) => group.agents.includes(lower));
    const applicable = matching.length ? matching : groups.filter((group) => group.agents.includes("*"));
    // A bare "Disallow:" clears a block; "Disallow: /" blocks the whole site.
    return applicable.some((group) => group.disallows.some((rule) => rule === "/"));
  };
  return AEO_AGENTS.map((entry) => ({ ...entry, allowed: !blocks(entry.agent) }));
}

export async function runClientAeoCheck(input: { site: string }) {
  if (!clientProviderEnabled("FIRECRAWL_API_KEY")) return { ok: false as const, status: 403, error: "provider_not_allowlisted" };
  const host = input.site.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const origin = await resolveSafePublicUrl(`https://${host}/`);
  if (!origin) return { ok: false as const, status: 400, error: "seo_url_not_allowed" };
  const base = new URL(origin).origin;

  async function readText(path: string) {
    const target = await resolveSafePublicUrl(`${base}${path}`);
    if (!target) return null;
    const response = await fetch(target, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!response?.ok) return null;
    const bytes = await readBoundedResponseBytes(response, 500_000);
    return bytes ? bytes.toString("utf8") : null;
  }

  const robots = await readText("/robots.txt");
  const llms = await readText("/llms.txt");
  const home = await readText("/");

  return {
    ok: true as const,
    provider: "firecrawl",
    model: "aeo-check",
    report: {
      site: host,
      robotsChecked: robots !== null,
      // With no robots.txt every crawler is allowed, which is the honest read.
      crawlers: robots === null ? AEO_AGENTS.map((entry) => ({ ...entry, allowed: true })) : evaluateRobotsForAgents(robots),
      llmsTxt: { present: llms !== null && llms.trim().length > 0, url: `${base}/llms.txt` },
      structuredData: { present: typeof home === "string" && /application\/ld\+json/i.test(home) },
      fetchedAt: new Date().toISOString(),
    } satisfies AeoReport,
    estimatedCostMicros: 0,
  };
}

// --- v96 normalisation -----------------------------------------------------

/**
 * Every search result becomes a citation-bearing v96 record. A result whose
 * page was not scraped still carries its snippet as evidence, marked partial:
 * that is genuinely less than a read page, and saying so is the difference
 * between a source and a claim.
 */
export function marketSearchToV96Records(input: {
  tenantSlug: string;
  query: string;
  results: readonly MarketSearchResult[];
  scraped: boolean;
  provider?: MarketSearchProvider;
}): V96StructuredResearchRecord[] {
  const retrievedAt = new Date().toISOString();
  return input.results.map((result) => {
    const evidence = (result.markdown || result.description || "").trim().slice(0, 600);
    const complete = input.scraped && Boolean(result.markdown.trim());
    return {
      contractVersion: V96_CONTRACT_VERSION,
      id: randomUUID(),
      tenantSlug: input.tenantSlug,
      provider: input.provider ?? "firecrawl",
      sourceUrl: result.url,
      retrievedAt,
      fields: {
        query: input.query,
        title: result.title || null,
        summary: result.description || null,
      },
      citations: evidence ? [{ url: result.url, title: result.title || undefined, retrievedAt, evidence }] : [],
      confidence: complete ? 1 : evidence ? 0.5 : 0,
      status: evidence ? (complete ? "complete" : "partial") : "failed",
      ...(evidence ? {} : { failureReason: "the result carried neither page content nor a summary" }),
    } satisfies V96StructuredResearchRecord;
  });
}
