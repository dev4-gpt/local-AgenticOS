import { isValidAdapterId, isValidTenantSlug, validateTombstoneReceipt } from "./adapterContracts";
import { adapterRouteUrl, readCapped, type RpcFn } from "./adapterEventsPuller";

/**
 * Tells an adapter to erase its copies of notes the host has erased, and records the receipt it answers with (ADR-014).
 * The host's database lists what still has to be delivered (only for adapters registered with the `receipt` guarantee);
 * this sends each one to `POST /h1/memory.tombstone` with its own single-use token and checks the answer before it is
 * recorded.
 *
 * Rules:
 * - A receipt is recorded only if it is the adapter's answer to THIS request: same tenant, same adapter, same event id, a
 *   well-formed hash and count. Anything else is a failed attempt.
 * - An attempt is counted only when the adapter actually answered. A network error or a timeout is not the adapter's
 *   refusal and does not use up one of the ten tries.
 * - An adapter that answers with the same receipt twice is fine (the adapter replays a lost acknowledgement); the database
 *   refuses a different answer for the same event.
 * - A database that does not answer stops the run. Whatever was sent is simply sent again next time, which is safe.
 * - The report holds counts and reasons, never the text of a note.
 */
export const TOMBSTONE_BATCH = 20;
export const MAX_TOMBSTONE_BATCH = 100;
export const TOMBSTONE_TIMEOUT_MS = 15_000;
export const TOMBSTONE_MAX_RESPONSE_BYTES = 64 * 1024;

export interface DispatcherConfig {
  tenantSlug: string;
  adapterId: string;
  baseUrl: string;
  allowInsecureLoopback?: boolean;
  limit?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface DispatcherDeps {
  rpc: RpcFn;
  /** A fresh single-use host token with scope `memory.tombstone` for the configured tenant and adapter. */
  mintToken: () => string;
  fetchImpl?: typeof fetch;
}

export interface DispatchReport {
  adapterId: string;
  /** How many were due this run. */
  due: number;
  /** How many the adapter acknowledged with a receipt that was recorded. */
  acknowledged: number;
  /** Reason -> how many failed for it. */
  failed: Record<string, number>;
  /** The books after this run: still pending, given up on after ten answers, acknowledged, and publish exposures found at withdrawal. */
  summary: { pending: number; gaveUp: number; acknowledged: number; exposures: number } | null;
  stopped: "database_unavailable" | null;
}

interface DueRow { eventId: string; adapterEventId: string; contentSha256: string }
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const HEX32 = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function parseDue(value: unknown): DueRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: DueRow[] = [];
  for (const raw of value) {
    if (!isObject(raw) || typeof raw.event_id !== "string" || !UUID.test(raw.event_id) || typeof raw.adapter_event_id !== "string" || !HEX32.test(raw.adapter_event_id)
      || typeof raw.content_sha256 !== "string" || !HEX64.test(raw.content_sha256)) return null;
    rows.push({ eventId: raw.event_id, adapterEventId: raw.adapter_event_id, contentSha256: raw.content_sha256 });
  }
  return rows;
}

export async function dispatchTombstones(config: DispatcherConfig, deps: DispatcherDeps): Promise<DispatchReport> {
  if (!isValidTenantSlug(config.tenantSlug) || !isValidAdapterId(config.adapterId)) throw new Error("invalid tenant or adapter id");
  const limit = config.limit ?? TOMBSTONE_BATCH;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TOMBSTONE_BATCH) throw new Error("invalid batch limit");
  const url = adapterRouteUrl(config, "/h1/memory.tombstone"); // refuse a bad address before anything is sent
  const timeoutMs = config.timeoutMs ?? TOMBSTONE_TIMEOUT_MS;
  const maxBytes = config.maxResponseBytes ?? TOMBSTONE_MAX_RESPONSE_BYTES;
  const doFetch = deps.fetchImpl ?? fetch;
  const who = { p_tenant_slug: config.tenantSlug, p_adapter_id: config.adapterId };
  const report: DispatchReport = { adapterId: config.adapterId, due: 0, acknowledged: 0, failed: {}, summary: null, stopped: null };
  const fail = (reason: string) => { report.failed[reason] = (report.failed[reason] ?? 0) + 1; };

  const listed = await deps.rpc("client_adapter_tombstones_pending", { ...who, p_limit: limit });
  const due = listed.ok ? parseDue(listed.value) : null;
  if (!due) {
    report.stopped = "database_unavailable";
    return report;
  }
  report.due = due.length;

  for (const row of due) {
    let response: Response;
    try {
      response = await doFetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${deps.mintToken()}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ tenantSlug: config.tenantSlug, adapterId: config.adapterId, eventId: row.eventId, targets: [{ adapterEventId: row.adapterEventId, contentSha256: row.contentSha256 }] }),
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      fail("adapter_unreachable"); // not the adapter's answer, so not one of the ten tries
      continue;
    }
    // The adapter answered, whatever it said: that is one try.
    const counted = await deps.rpc("client_adapter_tombstone_attempt", { p_event_id: row.eventId });
    if (!counted.ok) { report.stopped = "database_unavailable"; break; }
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel().catch(() => undefined); fail("redirect_refused"); continue; }
    const raw = await readCapped(response, maxBytes).catch(() => null);
    let json: unknown = null;
    try {
      json = raw === null ? null : JSON.parse(raw);
    } catch {
      json = null;
    }
    if (!response.ok) {
      const error = isObject(json) && typeof json.error === "string" && /^[a-z_]{1,40}$/.test(json.error) ? json.error : `http_${response.status}`;
      fail(error);
      continue;
    }
    let receipt;
    try {
      if (!isObject(json) || json.ok !== true) throw new Error("not ok");
      receipt = validateTombstoneReceipt(json.receipt);
    } catch {
      fail("bad_receipt");
      continue;
    }
    if (receipt.tenantSlug !== config.tenantSlug || receipt.adapterId !== config.adapterId || receipt.eventId !== row.eventId || receipt.deletedCount > 1_000_000) {
      fail("receipt_for_another_request");
      continue;
    }
    const recorded = await deps.rpc("client_adapter_tombstone_ack", { p_event_id: row.eventId, p_receipt_sha256: receipt.receiptSha256, p_deleted_count: receipt.deletedCount });
    if (!recorded.ok) { report.stopped = "database_unavailable"; break; }
    if (recorded.value === true) report.acknowledged += 1;
    else fail("ack_refused");
  }

  const books = await deps.rpc("client_adapter_tombstone_summary", who);
  if (books.ok && isObject(books.value)) {
    const v = books.value;
    const n = (x: unknown) => (typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : 0);
    report.summary = { pending: n(v.pending), gaveUp: n(v.gave_up), acknowledged: n(v.acknowledged), exposures: n(v.exposures) };
  }
  return report;
}
