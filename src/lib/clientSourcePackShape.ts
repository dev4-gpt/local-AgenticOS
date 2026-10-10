import { containsClientSecretLike } from "@/lib/clientInputSafety";

export type ClientSourcePackShapeItem = {
  title: string;
  sourceUrl: string;
  tab: string | null;
  text: string;
  publishedAt: string | null;
  collectedAt: string | null;
  links: { url: string; text: string }[];
};

export type ClientSourcePackShape = {
  startUrl: string;
  sources: ClientSourcePackShapeItem[];
  skipped: string[];
  skippedCount: number;
  linkCount: number;
};

const MAX_SOURCES = 100;
const MAX_LINKS_PER_SOURCE = 100;
const SENSITIVE_QUERY_KEY = /^(?:api_?key|access_?token|refresh_?token|id_?token|token|secret|password|code|signature|sig|auth|authorization|jwt|session|session_?id|awsaccesskeyid|googleaccessid|key_pair_id|x_(?:amz|goog)_(?:algorithm|credential|date|expires|security_token|signature|signedheaders))$/i;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function safeClientSourceUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("source_pack_url_invalid");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("source_pack_url_invalid"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname || containsClientSecretLike(value)) throw new Error("source_pack_url_invalid");
  if ([...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key.replace(/[-\s]/g, "_")))) throw new Error("source_pack_url_invalid");
  url.hash = "";
  return url.toString();
}

export function parseClientSourcePackShape(input: unknown): ClientSourcePackShape {
  const pack = object(input);
  if (!pack || !Array.isArray(pack.sources) || !pack.sources.length || pack.sources.length > MAX_SOURCES) throw new Error("source_pack_size_invalid");
  const startUrl = safeClientSourceUrl(pack.startUrl);
  const seen = new Set<string>();
  const sources = pack.sources.map((value) => {
    const source = object(value);
    if (!source) throw new Error("source_pack_item_invalid");
    const title = typeof source.title === "string" ? source.title.trim() : "";
    const text = typeof source.text === "string" ? source.text.replace(/\r\n?/g, "\n").trim() : "";
    const tab = typeof source.tab === "string" ? source.tab.trim() : null;
    const sourceUrl = safeClientSourceUrl(source.url);
    if (source.publishedAt !== undefined && source.publishedAt !== null
      && (typeof source.publishedAt !== "string" || !isCalendarDate(source.publishedAt))) throw new Error("source_pack_item_invalid");
    const publishedAt = typeof source.publishedAt === "string" ? source.publishedAt : null;
    if (source.collectedAt !== undefined && source.collectedAt !== null
      && (typeof source.collectedAt !== "string" || Number.isNaN(Date.parse(source.collectedAt)))) throw new Error("source_pack_item_invalid");
    const collectedAt = typeof source.collectedAt === "string" ? new Date(source.collectedAt).toISOString() : null;
    if (!title || title.length > 240 || !text || text.length > 30_000 || (tab && tab.length > 240) || containsClientSecretLike(title, text)) throw new Error("source_pack_item_invalid");
    if (!Array.isArray(source.links) || source.links.length > MAX_LINKS_PER_SOURCE) throw new Error("source_pack_links_invalid");
    const links = source.links.map((value) => {
      const link = object(value);
      if (!link) throw new Error("source_pack_links_invalid");
      const url = safeClientSourceUrl(link.url);
      const text = typeof link.text === "string" ? link.text.trim() : "";
      if (text.length > 300 || containsClientSecretLike(text)) throw new Error("source_pack_links_invalid");
      return { url, text };
    });
    const identity = `${startUrl}\n${sourceUrl}\n${tab ?? ""}`;
    if (seen.has(identity)) throw new Error("source_pack_duplicate_source");
    seen.add(identity);
    return { title, sourceUrl, tab, text, publishedAt, collectedAt, links };
  });
  if (pack.skipped !== undefined && (!Array.isArray(pack.skipped) || pack.skipped.length > 100)) throw new Error("source_pack_skipped_invalid");
  const skipped = (pack.skipped ?? []).map((value: unknown) => {
    const entry = object(value);
    const detail = typeof value === "string" ? value.trim()
      : entry && typeof entry.label === "string" && typeof entry.reason === "string"
        ? `${typeof entry.section === "string" ? `${entry.section.trim()}: ` : ""}${entry.label.trim()} (${entry.reason.trim()})`
        : "";
    if (!detail || detail.length > 512 || containsClientSecretLike(detail)) throw new Error("source_pack_skipped_invalid");
    return detail;
  });
  return { startUrl, sources, skipped, skippedCount: skipped.length, linkCount: sources.reduce((total, source) => total + source.links.length, 0) };
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() > 0 && date.toISOString().slice(0, 10) === value;
}
