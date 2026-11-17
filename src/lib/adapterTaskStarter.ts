/**
 * The host starts an adapter task with a model grant (ADR-020, option A). Three steps:
 *   1. open the grant in the database (the per-adapter model list, call and token limits, a lifetime of at most 15 minutes);
 *   2. send `task.run` with a single-use host token (ADR-012) and the grant credential plus the host's `model.call` address;
 *   3. record the adapter's own task id on the grant, so the sync job can close the grant when the task ends.
 * Nothing is sent to the adapter unless the grant is open. If task.run fails the grant is left to expire: the adapter may
 * have received it before the failure, and closing it here would race with a task that did start.
 * An adapter with costs of its own (`ownSpend`, ProofMint's sandbox) also gets the task's budget set aside under the host's key
 * between steps 1 and 2; a budget that refuses stops the start. A clear refusal from the adapter (a 4xx, or 503 "busy") gives the
 * reservation back; an unclear failure keeps it, and the sync job settles it when the task's final state arrives.
 * Every dependency is passed in; this module reads no environment and holds no key of its own.
 */
import type { KeyObject } from "node:crypto";
import { isValidAdapterId, isValidIdempotencyKey, isValidTenantSlug } from "./adapterContracts";
import { mintAdapterToken } from "./adapterTokens";
import {
  ALLOWED_MODEL, bindModelGrant, DEFAULT_GRANT_TTL_SECONDS, MAX_ALLOWED_MODELS, MAX_GRANT_CALLS, MAX_GRANT_TOKENS, MAX_GRANT_TTL_SECONDS,
  mintModelGrantCredential, newGrantId, openModelGrant, TASK_KEY, type GrantRpc,
} from "./adapterModelGrant";
import { adapterRouteUrl, readCapped } from "./adapterEventsPuller";
import { releaseAdapterBudget, reserveAdapterBudget, type BudgetStatus } from "./adapterBudget";

/** Defaults match the content adapter's own per-task token cap (ADR-018). */
export const DEFAULT_TASK_MAX_CALLS = 20;
export const DEFAULT_TASK_MAX_TOKENS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const ADAPTER_TASK_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TASK_NAME = /^[a-z][a-z0-9._-]{1,63}$/;
const STATE = /^[a-z_]{1,32}$/;

export interface StartTaskConfig {
  tenantSlug: string;
  adapterId: string;
  /** The adapter's service, from deployment configuration. */
  baseUrl: string;
  /** The host's own public `model.call` address the adapter will call back. */
  hostModelUrl: string;
  allowInsecureLoopback?: boolean;
}

export interface StartTaskDeps {
  rpc: GrantRpc;
  workerToken: string;
  privateKey: string | KeyObject;
  fetchImpl?: typeof fetch;
  now?: number; // seconds since epoch; tests only
  newGrantId?: () => string; // tests only
}

export interface StartTaskInput {
  task: string;
  /** The host's key for the task: the task.run idempotency key, at most 120 characters. */
  idempotencyKey: string;
  budgetMaxMicros: number;
  input: unknown;
  /** `provider:model` entries this task may use (from the host's per-adapter setting). */
  models: readonly string[];
  maxCalls?: number;
  maxTokens?: number;
  ttlSeconds?: number;
  /** For an adapter with costs of its own: set `budgetMaxMicros` aside under the host's key before task.run. */
  ownSpend?: { tenantMonthlyCapMicros: number };
}

/** What happened to an own-spend reservation when the start failed after it was made. */
export type OwnSpendAfterFailure = "released" | "kept" | "release_failed";
type AdapterFailure = "adapter_unreachable" | "redirect_refused" | "adapter_refused" | "bad_response";

export type StartTaskResult =
  | { ok: true; taskId: string; state: string; grantId: string; replay: boolean; grantBound?: false }
  | { ok: false; reason: "invalid_input" | "invalid_config" }
  | { ok: false; reason: "grant_not_opened"; status: string }
  | { ok: false; reason: "budget_refused"; status: BudgetStatus; grantId: string }
  | { ok: false; reason: AdapterFailure; grantId: string; ownSpend?: OwnSpendAfterFailure };

const OWN_SPEND_PROVIDER = "adapter";
const ownSpendOk = (o: StartTaskInput["ownSpend"]) =>
  o === undefined || (o !== null && typeof o === "object" && Number.isSafeInteger(o.tenantMonthlyCapMicros) && o.tenantMonthlyCapMicros >= 0);
/** The adapter clearly did not take the task: a 4xx, or 503 (busy, nothing recorded). Anything else may have started it. */
const clearRefusal = (status: number | null) => status !== null && ((status >= 400 && status < 500) || status === 503);

function hostModelUrlOk(raw: string, allowInsecureLoopback: boolean | undefined): boolean {
  try {
    adapterRouteUrl({ baseUrl: raw, allowInsecureLoopback }, "");
    return true;
  } catch {
    return false;
  }
}

export async function startAdapterTaskWithGrant(config: StartTaskConfig, deps: StartTaskDeps, input: StartTaskInput): Promise<StartTaskResult> {
  const maxCalls = input.maxCalls ?? DEFAULT_TASK_MAX_CALLS;
  const maxTokens = input.maxTokens ?? DEFAULT_TASK_MAX_TOKENS;
  const ttl = input.ttlSeconds ?? DEFAULT_GRANT_TTL_SECONDS;
  const inputOk = typeof input.task === "string" && TASK_NAME.test(input.task)
    && isValidIdempotencyKey(input.idempotencyKey) && TASK_KEY.test(input.idempotencyKey)
    && Number.isSafeInteger(input.budgetMaxMicros) && input.budgetMaxMicros >= 1
    && Array.isArray(input.models) && input.models.length >= 1 && input.models.length <= MAX_ALLOWED_MODELS
    && input.models.every((entry) => typeof entry === "string" && ALLOWED_MODEL.test(entry))
    && Number.isInteger(maxCalls) && maxCalls >= 1 && maxCalls <= MAX_GRANT_CALLS
    && Number.isInteger(maxTokens) && maxTokens >= 1 && maxTokens <= MAX_GRANT_TOKENS
    && Number.isInteger(ttl) && ttl >= 1 && ttl <= MAX_GRANT_TTL_SECONDS
    && ownSpendOk(input.ownSpend);
  if (!inputOk) return { ok: false, reason: "invalid_input" };

  let runUrl: string;
  try {
    if (!isValidTenantSlug(config.tenantSlug) || !isValidAdapterId(config.adapterId)) throw new Error("bad ids");
    runUrl = adapterRouteUrl(config, "/h1/task.run");
    if (!hostModelUrlOk(config.hostModelUrl, config.allowInsecureLoopback)) throw new Error("bad host url");
  } catch {
    return { ok: false, reason: "invalid_config" };
  }

  // 1. The grant.
  const now = deps.now ?? Math.floor(Date.now() / 1000);
  const grantId = (deps.newGrantId ?? newGrantId)();
  const opened = await openModelGrant(deps.rpc, {
    tenantSlug: config.tenantSlug, workerToken: deps.workerToken, adapterId: config.adapterId, taskKey: input.idempotencyKey,
    grantId, allowed: input.models, maxCalls, maxTokens, expiresAt: new Date((now + ttl) * 1000),
  });
  if (!opened.opened) return { ok: false, reason: "grant_not_opened", status: opened.status };
  const credential = mintModelGrantCredential({
    privateKey: deps.privateKey, tenant: config.tenantSlug, adapterId: config.adapterId, taskKey: input.idempotencyKey, grantId, ttlSeconds: ttl, now,
  }).token;

  // 1b. The adapter's own spend, set aside under the host's key for the task.
  const who = { tenantSlug: config.tenantSlug, workerToken: deps.workerToken, adapterId: config.adapterId, taskId: input.idempotencyKey };
  if (input.ownSpend) {
    const reserved = await reserveAdapterBudget(deps.rpc, {
      ...who, idempotencyKey: `own-reserve-${input.idempotencyKey}`, amountMicros: input.budgetMaxMicros,
      provider: OWN_SPEND_PROVIDER, model: null, tenantMonthlyCapMicros: input.ownSpend.tenantMonthlyCapMicros,
    });
    if (!reserved.allowed) return { ok: false, reason: "budget_refused", status: reserved.status, grantId };
  }
  const failed = async (reason: AdapterFailure, status: number | null): Promise<StartTaskResult> => {
    if (!input.ownSpend) return { ok: false, reason, grantId };
    if (!clearRefusal(status)) return { ok: false, reason, grantId, ownSpend: "kept" };
    const released = await releaseAdapterBudget(deps.rpc, { ...who, idempotencyKey: `own-release-${input.idempotencyKey}` });
    return { ok: false, reason, grantId, ownSpend: released.allowed ? "released" : "release_failed" };
  };

  // 2. task.run.
  const hostToken = mintAdapterToken({ privateKey: deps.privateKey, tenant: config.tenantSlug, adapterId: config.adapterId, scope: ["task.run"], ttlSeconds: 60, now }).token;
  let response: Response;
  try {
    response = await (deps.fetchImpl ?? fetch)(runUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${hostToken}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        tenantSlug: config.tenantSlug,
        adapterId: config.adapterId,
        task: input.task,
        idempotencyKey: input.idempotencyKey,
        budgetMaxMicros: input.budgetMaxMicros,
        input: input.input,
        modelGrant: { token: credential, url: config.hostModelUrl },
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return failed("adapter_unreachable", null);
  }
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel().catch(() => undefined); return failed("redirect_refused", response.status); }
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); return failed("adapter_refused", response.status); }
  const raw = await readCapped(response, MAX_RESPONSE_BYTES).catch(() => null);
  let json: unknown = null;
  try { json = raw === null ? null : JSON.parse(raw); } catch { json = null; }
  const answer = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : null;
  if (!answer || answer.ok !== true || typeof answer.taskId !== "string" || !ADAPTER_TASK_ID.test(answer.taskId)
      || typeof answer.state !== "string" || !STATE.test(answer.state)) {
    return failed("bad_response", null);
  }

  // 3. Tie the grant to the adapter's task id.
  const bound = await bindModelGrant(deps.rpc, { tenantSlug: config.tenantSlug, workerToken: deps.workerToken, grantId, adapterTaskId: answer.taskId });
  return {
    ok: true, taskId: answer.taskId, state: answer.state, grantId, replay: answer.replay === true,
    ...(bound.bound ? {} : { grantBound: false as const }),
  };
}
