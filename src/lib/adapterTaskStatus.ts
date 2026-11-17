/**
 * What the Adapters page reads about adapter tasks (ADR-020):
 *   - with no task named: which adapters and tasks it may offer (from the host's ADAPTER_TASKS_JSON), whether the signed-in
 *     person may start one, and the last few starts from the audit log (ids and times only);
 *   - for one task: its state from the adapter's task.get and, once it has succeeded, a summary of its task.result.
 * Each read uses a fresh single-use host token for that one operation, https only, no redirects, a timeout and a size cap.
 * Only a short whitelisted summary is returned: state, a short error code, what it cost, and for a finished round its verdict,
 * whether it needs approval, the proposal's fingerprint and its test counts. The proposal's code stays in the adapter, where
 * its own human approval happens. Failures are short codes, never the adapter's words.
 */
import type { KeyObject } from "node:crypto";
import { isValidAdapterId, isValidTenantSlug } from "./adapterContracts";
import { adapterRouteUrl, readCapped } from "./adapterEventsPuller";
import { adapterEndpoint, adapterTaskOptions, adapterTaskSettings } from "./adapterTaskRequest";
import { mintAdapterToken } from "./adapterTokens";

export const STATUS_TIMEOUT_MS = 10_000;
export const STATUS_MAX_RESPONSE_BYTES = 64 * 1024;
export const RECENT_LIMIT = 10;
const TASK_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TASK_NAME = /^[a-z][a-z0-9._-]{1,63}$/;
const SHORT_CODE = /^[a-z][a-z0-9_]{0,39}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const STATES = new Set(["queued", "running", "succeeded", "failed", "cancelled"]);
const MAX_MICROS = 1_000_000_000_000;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const whole = (v: unknown, max = MAX_MICROS): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;

export interface TaskStatusConfig {
  tenantSlug: string;
  adapterId: string;
  baseUrl: string;
  allowInsecureLoopback?: boolean;
}

export interface TaskStatusDeps {
  /** A fresh single-use host token for exactly this operation. */
  mintToken: (operation: "task.get" | "task.result") => string;
  fetchImpl?: typeof fetch;
}

export interface TaskSummary {
  taskId: string;
  state: string;
  error?: string;
  spentMicros?: number;
  result?: { verdict?: string; needsApproval?: boolean; candidateSha?: string; costMicros?: number; visible?: Counts; heldout?: Counts };
  resultUnavailable?: true;
}
type Counts = { candidate: number; total: number };

export type TaskStatusFailure = "invalid_task" | "not_found" | "adapter_unreachable" | "adapter_refused" | "redirect_refused" | "too_large" | "bad_response";
export type TaskStatusResult = { ok: true; summary: TaskSummary } | { ok: false; reason: TaskStatusFailure };

type Read = { ok: true; json: Json } | { ok: false; reason: Exclude<TaskStatusFailure, "invalid_task"> };

async function readJson(config: TaskStatusConfig, deps: TaskStatusDeps, operation: "task.get" | "task.result", taskId: string): Promise<Read> {
  const url = `${adapterRouteUrl(config, `/h1/${operation}`)}?id=${encodeURIComponent(taskId)}`;
  let response: Response;
  try {
    response = await (deps.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers: { authorization: `Bearer ${deps.mintToken(operation)}`, accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "adapter_unreachable" };
  }
  const drop = () => response.body?.cancel().catch(() => undefined);
  if (response.status >= 300 && response.status < 400) { await drop(); return { ok: false, reason: "redirect_refused" }; }
  if (response.status === 404) { await drop(); return { ok: false, reason: "not_found" }; }
  if (!response.ok) { await drop(); return { ok: false, reason: "adapter_refused" }; }
  const raw = await readCapped(response, STATUS_MAX_RESPONSE_BYTES).catch(() => null);
  if (raw === null) return { ok: false, reason: "too_large" };
  try {
    const json: unknown = JSON.parse(raw);
    return isObject(json) && json.ok === true && json.taskId === taskId ? { ok: true, json } : { ok: false, reason: "bad_response" };
  } catch {
    return { ok: false, reason: "bad_response" };
  }
}

function countsOf(v: unknown): Counts | undefined {
  return isObject(v) && whole(v.candidate, 1_000_000) && whole(v.total, 1_000_000) ? { candidate: v.candidate, total: v.total } : undefined;
}

/** Only the fields the page shows, each kept only if it has the expected shape. */
function resultOf(json: Json): NonNullable<TaskSummary["result"]> {
  const visible = countsOf(json.visible);
  const heldout = countsOf(json.heldout);
  return {
    ...(typeof json.verdict === "string" && SHORT_CODE.test(json.verdict) ? { verdict: json.verdict } : {}),
    ...(typeof json.needsApproval === "boolean" ? { needsApproval: json.needsApproval } : {}),
    ...(typeof json.candidateSha === "string" && SHA256.test(json.candidateSha) ? { candidateSha: json.candidateSha } : {}),
    ...(whole(json.costMicros) ? { costMicros: json.costMicros } : {}),
    ...(visible ? { visible } : {}),
    ...(heldout ? { heldout } : {}),
  };
}

export async function fetchTaskStatus(config: TaskStatusConfig, deps: TaskStatusDeps, taskId: string): Promise<TaskStatusResult> {
  if (!isValidTenantSlug(config.tenantSlug) || !isValidAdapterId(config.adapterId)) throw new Error("invalid tenant or adapter id");
  adapterRouteUrl(config, "/h1/task.get"); // refuse a bad address before anything is sent
  if (typeof taskId !== "string" || !TASK_ID.test(taskId)) return { ok: false, reason: "invalid_task" };
  const got = await readJson(config, deps, "task.get", taskId);
  if (!got.ok) return got;
  const { state, error, spentMicros } = got.json;
  if (typeof state !== "string" || !STATES.has(state) || (spentMicros !== undefined && !whole(spentMicros))) return { ok: false, reason: "bad_response" };
  const summary: TaskSummary = {
    taskId, state,
    ...(typeof error === "string" && SHORT_CODE.test(error) ? { error } : {}),
    ...(spentMicros !== undefined ? { spentMicros: spentMicros as number } : {}),
  };
  if (state !== "succeeded") return { ok: true, summary };
  const result = await readJson(config, deps, "task.result", taskId).catch(() => null);
  return { ok: true, summary: result?.ok ? { ...summary, result: resultOf(result.json) } : { ...summary, resultUnavailable: true } };
}

export interface TaskReadDeps {
  env: { tenantSlug: string; privateKey: KeyObject | null; tasksJson: string | undefined; endpointsJson: string | undefined; allowLoopback: boolean };
  isManager: () => Promise<boolean>;
  /** The latest task starts from the audit log, newest first. */
  readRecent: () => Promise<{ ok: boolean; records: Record<string, unknown>[] }>;
  fetchImpl?: typeof fetch;
  now?: number; // seconds since epoch; tests only
}
export type TaskReadAnswer = { status: number; body: Record<string, unknown> };
const refuse = (status: number, error: string): TaskReadAnswer => ({ status, body: { ok: false, error } });

/** A start from the audit log, or null when the row is not what the start route writes. */
function recentOf(row: Record<string, unknown>): { adapterId: string; task: string; taskId: string; at: string } | null {
  const m = row.metadata;
  if (!isObject(m) || typeof row.created_at !== "string") return null;
  const { adapter_id: adapterId, task, adapter_task_id: taskId } = m;
  if (typeof adapterId !== "string" || !isValidAdapterId(adapterId) || typeof task !== "string" || !TASK_NAME.test(task) || typeof taskId !== "string" || !TASK_ID.test(taskId)) return null;
  return { adapterId, task, taskId, at: row.created_at };
}

async function overview(deps: TaskReadDeps): Promise<TaskReadAnswer> {
  const [canStart, recent] = await Promise.all([deps.isManager(), deps.readRecent().catch(() => ({ ok: false, records: [] }))]);
  return {
    status: 200,
    body: {
      ok: true, canStart,
      options: adapterTaskOptions(adapterTaskSettings(deps.env.tasksJson)),
      recent: recent.ok ? recent.records.map(recentOf).filter((r) => r !== null).slice(0, RECENT_LIMIT) : null,
    },
  };
}

export async function handleAdapterTaskRead(params: URLSearchParams, deps: TaskReadDeps): Promise<TaskReadAnswer> {
  if ([...params.keys()].length === 0) return overview(deps);
  if ([...params.keys()].some((k) => k !== "adapterId" && k !== "taskId")) return refuse(400, "invalid_input");
  const adapters = params.getAll("adapterId");
  const tasks = params.getAll("taskId");
  if (adapters.length !== 1 || tasks.length !== 1 || !isValidAdapterId(adapters[0]) || !TASK_ID.test(tasks[0])) return refuse(400, "invalid_input");
  const [adapterId, taskId] = [adapters[0], tasks[0]];
  const settings = adapterTaskSettings(deps.env.tasksJson);
  if (!settings) return refuse(503, "tasks_not_configured");
  if (!Object.hasOwn(settings, adapterId)) return refuse(403, "task_not_allowed");
  const baseUrl = adapterEndpoint(deps.env.endpointsJson, adapterId);
  const privateKey = deps.env.privateKey;
  if (!baseUrl || !privateKey) return refuse(503, "host_not_configured");
  let result: TaskStatusResult;
  try {
    result = await fetchTaskStatus(
      { tenantSlug: deps.env.tenantSlug, adapterId, baseUrl, allowInsecureLoopback: deps.env.allowLoopback },
      {
        mintToken: (operation) => mintAdapterToken({ privateKey, tenant: deps.env.tenantSlug, adapterId, scope: [operation], ttlSeconds: 60, now: deps.now }).token,
        fetchImpl: deps.fetchImpl,
      },
      taskId,
    );
  } catch {
    return refuse(503, "host_not_configured"); // a bad address or id in the host's own settings
  }
  if (result.ok) return { status: 200, body: { ok: true, ...result.summary } };
  if (result.reason === "not_found") return refuse(404, "not_found");
  if (result.reason === "invalid_task") return refuse(400, "invalid_input");
  return refuse(502, "adapter_unavailable");
}
