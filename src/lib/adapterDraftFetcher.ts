import { isValidAdapterId, isValidTenantSlug } from "./adapterContracts";
import { scanMemoryContent, type ScanResult } from "./adapterMemoryGuard";
import { adapterRouteUrl, readCapped } from "./adapterEventsPuller";

/**
 * Fetches the draft text of a finished adapter task, on demand, for a reviewer to read (ADR-017). The host never stores
 * it: this returns the text to the caller and that is all. The text is an adapter's output, so it is untrusted: the host
 * runs its own scan on every body and returns the verdict beside it, and the caller must show it as plain text.
 *
 * Nothing calls this from a page yet. Showing a draft in the web app would mean the Next.js server holds the host's signing
 * key, which can mint a token for any operation; that is a separate decision (ADR-017), so this stays a library.
 *
 * Rules:
 * - One short-lived single-use token, scope `task.result` only. HTTPS only (plain http only to loopback, for tests). No
 *   redirects, a timeout, and a response size cap.
 * - The answer is checked strictly: exact fields, the task id the host asked for, at most five drafts and 60,000 characters
 *   in total. A draft the adapter left out for its own caps is counted in `omitted`, never invented.
 * - Failures are reasons, never the adapter's message, and never any text.
 */
export const DRAFT_TIMEOUT_MS = 15_000;
export const DRAFT_MAX_RESPONSE_BYTES = 400 * 1024;
export const MAX_DRAFTS = 5;
export const MAX_DRAFT_TOTAL_CHARS = 60_000;
export const MAX_TITLE_CHARS = 300;
const TASK_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const ASSET_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export interface DraftFetchConfig {
  tenantSlug: string;
  adapterId: string;
  baseUrl: string;
  allowInsecureLoopback?: boolean;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface DraftFetchDeps {
  /** A fresh single-use host token with scope `task.result` for the configured tenant and adapter. */
  mintToken: () => string;
  fetchImpl?: typeof fetch;
}

export interface FetchedDraft {
  assetId: string;
  title: string;
  body: string;
  /** The host's own scan of the body. A blocked or flagged draft is still returned, so a reviewer can see why. */
  scan: ScanResult;
}

export type DraftFetchFailure = "invalid_task" | "not_found" | "adapter_unreachable" | "adapter_refused" | "redirect_refused" | "too_large" | "bad_response";
export type DraftFetchResult = { ok: true; taskId: string; drafts: FetchedDraft[]; omitted: number } | { ok: false; reason: DraftFetchFailure };

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const sameKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const wanted = [...keys].sort();
  return actual.length === wanted.length && actual.every((key, i) => key === wanted[i]);
};

export async function fetchTaskDrafts(config: DraftFetchConfig, deps: DraftFetchDeps, taskId: string): Promise<DraftFetchResult> {
  if (!isValidTenantSlug(config.tenantSlug) || !isValidAdapterId(config.adapterId)) throw new Error("invalid tenant or adapter id");
  const base = adapterRouteUrl(config, "/h1/task.result"); // refuse a bad address before anything is sent
  if (typeof taskId !== "string" || !TASK_ID.test(taskId)) return { ok: false, reason: "invalid_task" };
  const timeoutMs = config.timeoutMs ?? DRAFT_TIMEOUT_MS;
  const maxBytes = config.maxResponseBytes ?? DRAFT_MAX_RESPONSE_BYTES;
  const doFetch = deps.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch(`${base}?id=${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${deps.mintToken()}`, accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: "adapter_unreachable" };
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "redirect_refused" };
  }
  if (response.status === 404) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "not_found" };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "adapter_refused" };
  }
  const raw = await readCapped(response, maxBytes).catch(() => null);
  if (raw === null) return { ok: false, reason: "too_large" };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "bad_response" };
  }

  if (!isObject(json) || !sameKeys(json, ["ok", "taskId", "drafts", "omitted"]) || json.ok !== true || json.taskId !== taskId) return { ok: false, reason: "bad_response" };
  const { drafts, omitted } = json;
  if (!Array.isArray(drafts) || drafts.length > MAX_DRAFTS || typeof omitted !== "number" || !Number.isSafeInteger(omitted) || omitted < 0 || omitted > 1000) return { ok: false, reason: "bad_response" };
  const out: FetchedDraft[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const item of drafts) {
    if (!isObject(item) || !sameKeys(item, ["assetId", "title", "body"])) return { ok: false, reason: "bad_response" };
    const { assetId, title, body } = item;
    if (typeof assetId !== "string" || !ASSET_ID.test(assetId) || seen.has(assetId)) return { ok: false, reason: "bad_response" };
    if (typeof title !== "string" || title.length > MAX_TITLE_CHARS || typeof body !== "string" || body.length < 1) return { ok: false, reason: "bad_response" };
    total += body.length;
    if (total > MAX_DRAFT_TOTAL_CHARS) return { ok: false, reason: "bad_response" };
    seen.add(assetId);
    out.push({ assetId, title, body, scan: scanMemoryContent(body) });
  }
  return { ok: true, taskId, drafts: out, omitted };
}
