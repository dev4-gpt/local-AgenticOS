import { isIP } from "node:net";
import { providerEnvKey } from "@/lib/providerKeys";
import { clientProviderEnabled } from "@/lib/clientRuntimePolicy";

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";
const MAX_URL_LENGTH = 2000;

export async function runClientSeoAdapter(input: { url: string; focus?: string }) {
  if (!clientProviderEnabled("FIRECRAWL_API_KEY")) return { ok: false as const, status: 403, error: "provider_not_allowlisted" };
  const key = providerEnvKey("FIRECRAWL_API_KEY");
  if (!key) return { ok: false as const, status: 503, error: "provider_not_configured" };
  const url = safePublicUrl(input.url);
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
  const data = await response.json().catch(() => null) as {
    success?: boolean;
    data?: { markdown?: unknown; metadata?: Record<string, unknown> };
  } | null;
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

export function safePublicUrl(value: string, allowedHosts?: string[]) {
  const raw = value.trim();
  if (!raw || raw.length > MAX_URL_LENGTH) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return null; }
  if (!(["https:", "http:"].includes(parsed.protocol)) || parsed.username || parsed.password) return null;
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateAddress(hostname)) return null;
  const allowlist = allowedHosts ?? (process.env.CLIENT_SEO_ALLOWED_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (allowlist.length === 0 || !allowlist.some((host) => hostname === host || hostname.endsWith(`.${host}`))) return null;
  parsed.hash = "";
  return parsed.toString();
}

function isPrivateAddress(hostname: string) {
  const version = isIP(hostname);
  if (version === 4) {
    const octets = hostname.split(".").map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31
      || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19)
      || a >= 224;
  }
  if (version === 6) {
    const normalized = hostname.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd")
      || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")
      || normalized.startsWith("::ffff:");
  }
  return false;
}
