/**
 * A member of the client asks the host to start an adapter task (ADR-020). The rules, before anything is started:
 *   - only an owner or admin may start one (it spends the client's budget);
 *   - only an adapter and task listed in the host's own setting ADAPTER_TASKS_JSON, which also fixes the task's budget and
 *     whether the adapter has costs of its own (ProofMint's sandbox); the request can name neither;
 *   - the adapter's address, its model list and the host's own model.call address come from the host's settings;
 *   - the task key is "<adapter id>-<request id>" and the grant id is derived from it, so a retry with the same request id
 *     reopens the same grant, finds the same reservation and replays the same task instead of starting a second one.
 * Every answer is a short code; the task's input is passed to the adapter and never recorded. Every dependency is passed in.
 */
import { createHash, type KeyObject } from "node:crypto";
import { isValidAdapterId } from "./adapterContracts";
import { adapterModelAllowlist, TASK_KEY, type GrantRpc } from "./adapterModelGrant";
import type { StartTaskConfig, StartTaskDeps, StartTaskInput, StartTaskResult } from "./adapterTaskStarter";

export interface AdapterTaskSetting {
  tasks: readonly string[];
  budgetMaxMicros: number;
  ownSpend: boolean;
  /** When set, a task's input is exactly `{ [field]: one of choices }` (the page shows the choices as a list). */
  input?: { field: string; choices: readonly string[] };
}

/** What the Adapters page may show about a task it can start: never an address, a key or another setting. */
export interface AdapterTaskOption {
  adapterId: string;
  task: string;
  budgetMaxMicros: number;
  field?: string;
  choices?: readonly string[];
}

/** The most one task may set aside: one hundred dollars, in micros. */
export const MAX_TASK_BUDGET_MICROS = 100_000_000;
const MAX_TASKS_PER_ADAPTER = 10;
const TASK_NAME = /^[a-z][a-z0-9._-]{1,63}$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST_FIELDS = ["adapterId", "task", "input", "requestId"] as const;
const SETTING_FIELDS = ["tasks", "budgetMaxMicros", "ownSpend"] as const;
const SETTING_FIELDS_WITH_INPUT = [...SETTING_FIELDS, "input"] as const;
const INPUT_FIELD = /^[a-z][A-Za-z0-9_]{0,39}$/;
const CHOICE = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_CHOICES = 50;
const MIN_WORKER_TOKEN_CHARS = 24;
const MODEL_CALL_PATH = "/api/adapter-host/model-call";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const exactKeys = (v: Json, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));

function parseJson(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function inputOf(value: unknown): AdapterTaskSetting["input"] | null {
  if (!isObject(value) || !exactKeys(value, ["field", "choices"])) return null;
  const { field, choices } = value;
  if (typeof field !== "string" || !INPUT_FIELD.test(field) || !Array.isArray(choices) || choices.length < 1 || choices.length > MAX_CHOICES) return null;
  if (!choices.every((c) => typeof c === "string" && CHOICE.test(c)) || new Set(choices).size !== choices.length) return null;
  return { field, choices: [...choices] as string[] };
}

function settingOf(value: unknown): AdapterTaskSetting | null {
  if (!isObject(value) || !(exactKeys(value, SETTING_FIELDS) || exactKeys(value, SETTING_FIELDS_WITH_INPUT))) return null;
  const input = Object.hasOwn(value, "input") ? inputOf(value.input) : undefined;
  if (input === null) return null;
  const { tasks, budgetMaxMicros, ownSpend } = value;
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > MAX_TASKS_PER_ADAPTER) return null;
  if (!tasks.every((t) => typeof t === "string" && TASK_NAME.test(t)) || new Set(tasks).size !== tasks.length) return null;
  if (typeof budgetMaxMicros !== "number" || !Number.isSafeInteger(budgetMaxMicros) || budgetMaxMicros < 1 || budgetMaxMicros > MAX_TASK_BUDGET_MICROS) return null;
  if (typeof ownSpend !== "boolean") return null;
  return { tasks: [...tasks] as string[], budgetMaxMicros, ownSpend, ...(input ? { input } : {}) };
}

/** One entry per adapter and task the page may offer (empty when the setting is missing or wrong). */
export function adapterTaskOptions(settings: Record<string, AdapterTaskSetting> | null): AdapterTaskOption[] {
  if (!settings) return [];
  return Object.entries(settings).flatMap(([adapterId, s]) => s.tasks.map((task) => ({
    adapterId, task, budgetMaxMicros: s.budgetMaxMicros, ...(s.input ? { field: s.input.field, choices: s.input.choices } : {}),
  })));
}

/** True when `input` is what the setting allows: anything without choices, or exactly `{ [field]: one of choices }`. */
function inputAllowed(setting: AdapterTaskSetting, input: unknown): boolean {
  if (!setting.input) return true;
  const { field, choices } = setting.input;
  return isObject(input) && exactKeys(input, [field]) && typeof input[field] === "string" && choices.includes(input[field] as string);
}

/** ADAPTER_TASKS_JSON, read strictly: one wrong entry refuses the whole setting. Null when unset or wrong. */
export function adapterTaskSettings(raw: string | undefined): Record<string, AdapterTaskSetting> | null {
  const parsed = parseJson(raw);
  if (!isObject(parsed)) return null;
  const out: Record<string, AdapterTaskSetting> = {};
  for (const [adapterId, value] of Object.entries(parsed)) {
    const setting = settingOf(value);
    if (!isValidAdapterId(adapterId) || !setting) return null;
    out[adapterId] = setting;
  }
  return out;
}

/** The adapter's service address from ADAPTER_ENDPOINTS (the same setting the sync job uses). */
export function adapterEndpoint(raw: string | undefined, adapterId: string): string | null {
  const parsed = parseJson(raw);
  if (!isObject(parsed) || !Object.hasOwn(parsed, adapterId)) return null;
  const value = parsed[adapterId];
  return typeof value === "string" ? value : null;
}

/** A version-4-shaped uuid fixed by tenant, adapter and task key. */
export function grantIdFor(tenantSlug: string, adapterId: string, taskKey: string): string {
  const h = createHash("sha256").update(`${tenantSlug}|${adapterId}|${taskKey}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface TaskStartEnv {
  tenantSlug: string;
  workerToken: string;
  privateKey: KeyObject | null;
  /** The client's monthly cap in dollars (CLIENT_BUDGET_CAP). */
  capUsd: number;
  /** The host's own public address (CLIENT_RUNTIME_BASE_URL). */
  hostBaseUrl: string | undefined;
  tasksJson: string | undefined;
  endpointsJson: string | undefined;
  allowlistJson: string | undefined;
  allowLoopback: boolean;
}

export interface TaskStartDeps {
  env: TaskStartEnv;
  isManager: () => Promise<boolean>;
  rpc: GrantRpc;
  start: (config: StartTaskConfig, deps: StartTaskDeps, input: StartTaskInput) => Promise<StartTaskResult>;
  audit: (event: string, metadata: Record<string, unknown>) => Promise<unknown>;
}

export type TaskStartAnswer = { status: number; body: Record<string, unknown> };
const refuse = (status: number, error: string): TaskStartAnswer => ({ status, body: { ok: false, error } });

function failureOf(result: Exclude<StartTaskResult, { ok: true }>): [number, string] {
  switch (result.reason) {
    case "invalid_input": return [400, "invalid_input"];
    case "invalid_config": return [503, "host_not_configured"];
    case "grant_not_opened":
      if (result.status === "adapter_not_ready") return [409, "adapter_not_ready"];
      if (result.status === "task_has_grant") return [409, "idempotency_conflict"];
      return [503, "unavailable"];
    case "budget_refused":
      return result.status === "adapter_cap_exceeded" || result.status === "tenant_cap_exceeded" ? [409, "budget_exceeded"] : [503, "unavailable"];
    case "adapter_refused": return [502, "adapter_refused"];
    case "adapter_unreachable":
    case "bad_response":
    case "redirect_refused": return [502, "adapter_unavailable"];
    default: return [503, "unavailable"];
  }
}

export async function handleAdapterTaskStart(body: unknown, deps: TaskStartDeps): Promise<TaskStartAnswer> {
  if (!(await deps.isManager())) return refuse(403, "not_permitted");
  if (!isObject(body) || !exactKeys(body, REQUEST_FIELDS)) return refuse(400, "invalid_input");
  const { adapterId, task, input, requestId } = body;
  if (typeof adapterId !== "string" || !isValidAdapterId(adapterId) || typeof task !== "string" || !TASK_NAME.test(task)) return refuse(400, "invalid_input");
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId) || input === undefined) return refuse(400, "invalid_input");

  const { env } = deps;
  const settings = adapterTaskSettings(env.tasksJson);
  if (!settings) return refuse(503, "tasks_not_configured");
  const setting = Object.hasOwn(settings, adapterId) ? settings[adapterId] : null;
  if (!setting || !setting.tasks.includes(task)) return refuse(403, "task_not_allowed");
  if (!inputAllowed(setting, input)) return refuse(400, "invalid_input");

  const baseUrl = adapterEndpoint(env.endpointsJson, adapterId);
  const models = adapterModelAllowlist(env.allowlistJson, adapterId);
  const hostBase = env.hostBaseUrl?.trim().replace(/\/+$/, "");
  const capOk = !setting.ownSpend || (Number.isFinite(env.capUsd) && env.capUsd >= 0);
  if (!baseUrl || !models || !env.privateKey || !hostBase || env.workerToken.length < MIN_WORKER_TOKEN_CHARS || !capOk) {
    return refuse(503, "host_not_configured");
  }

  const taskKey = `${adapterId}-${requestId}`;
  if (!TASK_KEY.test(taskKey)) return refuse(400, "invalid_input");
  const grantId = grantIdFor(env.tenantSlug, adapterId, taskKey);
  const recorded = { adapter_id: adapterId, task, task_key: taskKey };
  let result: StartTaskResult;
  try {
    result = await deps.start(
      { tenantSlug: env.tenantSlug, adapterId, baseUrl, hostModelUrl: `${hostBase}${MODEL_CALL_PATH}`, allowInsecureLoopback: env.allowLoopback },
      { rpc: deps.rpc, workerToken: env.workerToken, privateKey: env.privateKey, newGrantId: () => grantId },
      {
        task, idempotencyKey: taskKey, budgetMaxMicros: setting.budgetMaxMicros, input, models,
        ...(setting.ownSpend ? { ownSpend: { tenantMonthlyCapMicros: Math.round(env.capUsd * 1_000_000) } } : {}),
      },
    );
  } catch {
    await deps.audit("tenant.adapter.task_start_failed", { ...recorded, reason: "unavailable" }).catch(() => undefined);
    return refuse(503, "unavailable");
  }
  if (!result.ok) {
    const [status, error] = failureOf(result);
    await deps.audit("tenant.adapter.task_start_failed", { ...recorded, reason: error }).catch(() => undefined);
    return refuse(status, error);
  }
  await deps.audit("tenant.adapter.task_started", { ...recorded, adapter_task_id: result.taskId, replay: result.replay }).catch(() => undefined);
  return { status: result.replay ? 200 : 202, body: { ok: true, taskId: result.taskId, state: result.state, replay: result.replay } };
}
