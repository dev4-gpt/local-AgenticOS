import { createHash } from "node:crypto";
import { isValidAdapterId, isValidTenantSlug } from "./adapterContracts";
import { scanMemoryContent } from "./adapterMemoryGuard";

/**
 * The host side of the adapter `events` feed (ADR-005, ADR-013, tracker 10j). The host pulls; an adapter never calls
 * the host, so it holds no host credential. For each memory proposal the host recomputes the content hash, runs its own
 * scan and hands the result to the database, which stores a private note, its provenance and a quarantined promotion in
 * one step. Nothing the adapter sends is a label: the adapter id, the requester and the scan all come from here.
 *
 * Rules:
 * - One short-lived single-use token per request, scope `events` only.
 * - HTTPS only (plain http only to a loopback address, for tests). No redirects, a timeout, and a response size cap.
 * - Every event is checked strictly. A malformed or unknown event is counted and skipped, so one bad event cannot stall
 *   the feed. A feed that is out of order is not trusted at all.
 * - A full review queue, an inactive adapter or an unreachable database STOPS the run without moving the cursor past
 *   what was handled, so the next run continues from there.
 * - The report holds counts and reasons, never note text.
 */
export const EVENTS_PAGE_SIZE = 50;
export const MAX_PAGES_PER_RUN = 10;
export const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_RESPONSE_BYTES = 1024 * 1024;
/** The adapter's own limit on a proposed fact (Content OS, MAX_PROPOSAL_CHARS). Anything longer is refused here too. */
export const MAX_PROPOSAL_CHARS = 2_000;
const PROPOSAL_KEYS = ["adapterVersion", "agentPrincipal", "citationId", "content", "retrievedAt", "sourceTaskId", "sourceUrl"] as const;
const EVENT_ID = /^[0-9a-f]{32}$/;
const TASK_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type RpcResult = { ok: boolean; status: number; value: unknown };
export type RpcFn = (functionName: string, body: Record<string, unknown>) => Promise<RpcResult>;

export interface PullerConfig {
  tenantSlug: string;
  adapterId: string;
  /** Where the adapter's service lives, from deployment configuration (never from the database or an event). */
  baseUrl: string;
  /** Allows plain http to 127.0.0.1, localhost or [::1]. For tests and local runs only. */
  allowInsecureLoopback?: boolean;
  pageSize?: number;
  maxPages?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface PullerDeps {
  rpc: RpcFn;
  /** A fresh single-use host token with scope `events` for the configured tenant and adapter. */
  mintToken: () => string;
  fetchImpl?: typeof fetch;
}

export type StopReason =
  | "adapter_unreachable" | "adapter_refused" | "redirect_refused" | "bad_response" | "feed_out_of_order"
  | "adapter_not_active" | "queue_full" | "database_unavailable" | "cursor_conflict" | "page_limit";

export interface PullReport {
  adapterId: string;
  startCursor: number;
  cursor: number;
  pages: number;
  events: number;
  created: number;
  duplicates: number;
  tasksSeen: number;
  /** Reason -> how many events were skipped for it. */
  rejected: Record<string, number>;
  stopped: StopReason | null;
}

interface FeedEvent { seq: number; id: string; at: string; kind: string; taskId: string; data: unknown }
interface Page { events: FeedEvent[]; next: number; hasMore: boolean }
export interface Proposal { content: string; sourceUrl: string; adapterVersion: string; agentPrincipal: string; sourceTaskId: string }

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isWhole = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const text = (v: unknown, min: number, max: number): v is string => typeof v === "string" && v.length >= min && v.length <= max;

/** The events URL for a configured adapter, or an Error naming what is wrong (never the value). */
export function eventsUrl(config: Pick<PullerConfig, "baseUrl" | "allowInsecureLoopback">, after: number, limit: number): string {
  return `${adapterRouteUrl(config, "/h1/events")}?after=${after}&limit=${limit}`;
}

/** The address of one h1 route of a configured adapter, under the same rules as every call the host makes to an adapter. */
export function adapterRouteUrl(config: Pick<PullerConfig, "baseUrl" | "allowInsecureLoopback">, route: string): string {
  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new Error("the adapter url is not a url");
  }
  const loopback = LOOPBACK.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && config.allowInsecureLoopback === true && loopback)) throw new Error("the adapter url must be https");
  if (url.username || url.password || url.search || url.hash) throw new Error("the adapter url must not carry credentials, a query or a fragment");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}${route}`;
}

/** Strict check of one `memory.propose` payload. The adapter may not add fields, and may not name another adapter. */
export function validateProposal(data: unknown, adapterId: string): Proposal | null {
  if (!isObject(data)) return null;
  const keys = Object.keys(data).sort();
  if (keys.length !== PROPOSAL_KEYS.length || keys.some((key, i) => key !== PROPOSAL_KEYS[i])) return null;
  const { content, sourceUrl, adapterVersion, agentPrincipal, sourceTaskId, citationId, retrievedAt } = data;
  if (!text(content, 1, MAX_PROPOSAL_CHARS) || !text(adapterVersion, 1, 40) || !text(citationId, 1, 128)) return null;
  if (agentPrincipal !== adapterId || typeof sourceTaskId !== "string" || !TASK_ID.test(sourceTaskId)) return null;
  if (!text(retrievedAt, 1, 40) || !Number.isFinite(Date.parse(retrievedAt))) return null;
  if (!text(sourceUrl, 1, 2048)) return null;
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return { content, sourceUrl, adapterVersion, agentPrincipal, sourceTaskId };
}

/** Checks the shape of a page and that its numbers continue exactly from the cursor. */
export function parsePage(body: unknown, cursor: number, pageSize: number): Page | null {
  if (!isObject(body) || body.ok !== true || !Array.isArray(body.events) || body.events.length > pageSize) return null;
  if (!isWhole(body.next) || typeof body.hasMore !== "boolean") return null;
  const events: FeedEvent[] = [];
  for (const [index, raw] of body.events.entries()) {
    if (!isObject(raw) || raw.seq !== cursor + index + 1 || typeof raw.id !== "string" || !EVENT_ID.test(raw.id)) return null;
    // Only the envelope has to be sound for the page to be trusted. A bad payload is that one event's problem: it is
    // counted and skipped (validateProposal), so a single poisoned event cannot stall the whole feed.
    if (!text(raw.at, 1, 40) || !text(raw.kind, 1, 40) || !text(raw.taskId, 1, 128)) return null;
    events.push({ seq: raw.seq, id: raw.id, at: raw.at, kind: raw.kind, taskId: raw.taskId, data: raw.data });
  }
  if (body.next !== (events.length ? events[events.length - 1]!.seq : cursor)) return null;
  return { events, next: body.next, hasMore: body.hasMore };
}

/** The response body as text, or null when it is missing or larger than the cap (the rest is never read). */
export async function readCapped(response: Response, max: number): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function pullAdapterEvents(config: PullerConfig, deps: PullerDeps): Promise<PullReport> {
  if (!isValidTenantSlug(config.tenantSlug) || !isValidAdapterId(config.adapterId)) throw new Error("invalid tenant or adapter id");
  const pageSize = config.pageSize ?? EVENTS_PAGE_SIZE;
  const maxPages = config.maxPages ?? MAX_PAGES_PER_RUN;
  const timeoutMs = config.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxBytes = config.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isInteger(maxPages) || maxPages < 1) throw new Error("invalid page limits");
  eventsUrl(config, 0, pageSize); // refuse a bad address before anything is sent
  const doFetch = deps.fetchImpl ?? fetch;
  const who = { p_tenant_slug: config.tenantSlug, p_adapter_id: config.adapterId };

  const cursorRead = await deps.rpc("client_adapter_events_cursor_get", who);
  const start = Number(cursorRead.value);
  if (!cursorRead.ok || !isWhole(start)) {
    return { adapterId: config.adapterId, startCursor: 0, cursor: 0, pages: 0, events: 0, created: 0, duplicates: 0, tasksSeen: 0, rejected: {}, stopped: "database_unavailable" };
  }
  const report: PullReport = { adapterId: config.adapterId, startCursor: start, cursor: start, pages: 0, events: 0, created: 0, duplicates: 0, tasksSeen: 0, rejected: {}, stopped: null };
  const reject = (reason: string) => { report.rejected[reason] = (report.rejected[reason] ?? 0) + 1; };

  /** Moves the stored cursor to what has been handled. False means someone else moved it, and this run must stop. */
  async function save(handledUpTo: number): Promise<boolean> {
    if (handledUpTo === report.cursor) return true;
    const moved = await deps.rpc("client_adapter_events_cursor_advance", { ...who, p_expected: report.cursor, p_next: handledUpTo });
    if (!moved.ok || moved.value !== true) return false;
    report.cursor = handledUpTo;
    return true;
  }

  while (report.pages < maxPages) {
    let response: Response;
    try {
      response = await doFetch(eventsUrl(config, report.cursor, pageSize), {
        method: "GET",
        headers: { authorization: `Bearer ${deps.mintToken()}`, accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      report.stopped = "adapter_unreachable";
      return report;
    }
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel().catch(() => undefined); report.stopped = "redirect_refused"; return report; }
    if (!response.ok) { await response.body?.cancel().catch(() => undefined); report.stopped = "adapter_refused"; return report; }
    const raw = await readCapped(response, maxBytes).catch(() => null);
    let json: unknown = null;
    try {
      json = raw === null ? null : JSON.parse(raw);
    } catch {
      json = null;
    }
    const page = parsePage(json, report.cursor, pageSize);
    if (!page) { report.stopped = json === null || !isObject(json) ? "bad_response" : "feed_out_of_order"; return report; }
    report.pages += 1;

    let handled = report.cursor;
    for (const event of page.events) {
      report.events += 1;
      if (event.kind === "task.state") {
        report.tasksSeen += 1;
        handled = event.seq;
        continue;
      }
      if (event.kind !== "memory.propose") { reject("unknown_kind"); handled = event.seq; continue; }
      const proposal = validateProposal(event.data, config.adapterId);
      if (!proposal || event.taskId !== proposal.sourceTaskId) { reject("bad_proposal"); handled = event.seq; continue; }
      const sha = createHash("sha256").update(proposal.content, "utf8").digest("hex");
      const scan = scanMemoryContent(proposal.content, { sourceUrl: proposal.sourceUrl });
      const stored = await deps.rpc("client_adapter_ingest_memory_proposal", {
        p_tenant_slug: config.tenantSlug,
        p_adapter_id: config.adapterId,
        p_idempotency_key: event.id,
        p_content: proposal.content,
        p_content_sha256: sha,
        p_scan_result: scan,
        p_adapter_version: proposal.adapterVersion,
        p_agent_principal: proposal.agentPrincipal,
        p_source_task_id: proposal.sourceTaskId,
        p_source_url: proposal.sourceUrl,
        p_confidence: null, // an adapter that reports none is stored as "not reported"; the feed carries none
      });
      const status = stored.ok && isObject(stored.value) ? stored.value.status : null;
      if (status === "created") report.created += 1;
      else if (status === "duplicate") report.duplicates += 1;
      else if (status === "invalid_proposal" || status === "hash_mismatch" || status === "scan_mismatch") reject(String(status));
      else {
        report.stopped = status === "queue_full" ? "queue_full" : status === "adapter_not_active" ? "adapter_not_active" : "database_unavailable";
        if (!(await save(handled))) report.stopped = "cursor_conflict";
        return report;
      }
      handled = event.seq;
    }
    if (!(await save(handled))) { report.stopped = "cursor_conflict"; return report; }
    if (!page.hasMore || page.events.length === 0) return report;
  }
  report.stopped = "page_limit"; // not an error: more is waiting, and the next run continues from the cursor
  return report;
}
