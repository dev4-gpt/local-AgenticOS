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
