/**
 * The host side of `model.call` (ADR-020): an adapter asks the host for one model answer, and the host makes the call
 * with the client's own provider key. Adapters hold no model keys.
 *
 * Checks, in this order; the first refusal returns a short code and nothing after it runs:
 *   1. the grant credential (signature, version, tenant, scope, lifetime) and the task it names;
 *   2. the request shape;
 *   3. the provider is one of the first five, and the client allows this provider and model;
 *   4. prompt size and secret-like input;
 *   5. a price for the model (an estimate that counts characters as tokens and output at its maximum, so it over-reserves);
 *   6. the database counts the call against the grant: open, not expired, right adapter and task, the model on the grant's
 *      list, call and token limits, the adapter's and the client's per-minute limits;
 *   7. the budget reservation (adapter cap, then the client's monthly cap), under a ledger key of its own per call;
 * then the provider call, then settle at the real cost (never above the reservation) or release on failure, then the
 * grant's tokens are corrected. No prompt or answer is stored, logged or sent anywhere but the provider and the adapter.
 * Every dependency is passed in, so this module reads no environment and holds no key.
 */
import type { KeyObject } from "node:crypto";
import { isValidTenantSlug } from "./adapterContracts";
import { releaseAdapterBudget, reserveAdapterBudget, settleAdapterBudget, type BudgetRpc } from "./adapterBudget";
import { MAX_GRANT_TOKENS, TASK_KEY, verifyModelGrantCredential } from "./adapterModelGrant";

/** The providers an adapter may reach through the host in the first version. */
export const MODEL_CALL_PROVIDERS = ["openai", "anthropic", "gemini", "groq", "openrouter"] as const;
export const MAX_MESSAGES = 50;
export const MAX_OUTPUT_TOKENS = 8192;
export const DEFAULT_ADAPTER_PER_MINUTE = 30;
export const DEFAULT_TENANT_PER_MINUTE = 60;
const MAX_PROVIDER_CHARS = 40;
const MAX_MODEL_CHARS = 180;
const MIN_WORKER_TOKEN_CHARS = 24;
const ROLES = new Set(["system", "user", "assistant"]);
const REQUEST_KEYS = ["maxOutputTokens", "messages", "model", "provider", "taskKey"];

export type ModelMessage = { role: "system" | "user" | "assistant"; content: string };
export type ModelUsage = { inputTokens: number; outputTokens: number };
export type ProviderAnswer = { ok: true; output: string; usage?: ModelUsage } | { ok: false; status: number };

export interface ModelCallPolicy {
  /** The client's own allowlist, provider switch and provider-call switch. */
  clientAllows(provider: string, model: string): boolean;
  /** Prompt size limit for the provider, or null when the provider has no contract. */
  maxPromptChars(provider: string): number | null;
  secretLike(messages: readonly ModelMessage[]): boolean;
  estimateMicros(model: string, messages: readonly ModelMessage[], maxOutputTokens: number): number | null;
  usageMicros(model: string, usage: ModelUsage): number | null;
  safeOutput(text: string): string;
}

export interface ModelCallDeps {
  tenantSlug: string;
  workerToken: string;
  publicKeys: string | KeyObject | readonly (string | KeyObject)[];
  tenantMonthlyCapMicros: number;
  rpc: BudgetRpc;
  policy: ModelCallPolicy;
  callProvider(provider: string, model: string, messages: ModelMessage[], maxOutputTokens: number): Promise<ProviderAnswer>;
  adapterPerMinute?: number;
  tenantPerMinute?: number;
  now?: number; // seconds since epoch; tests only
}

export type ModelCallBody =
  | { ok: true; output: string; usage: ModelUsage | null; costMicros: number; call: number; settled?: false }
  | { ok: false; error: string };
export type ModelCallResult = { status: number; body: ModelCallBody };

const refuse = (status: number, error: string): ModelCallResult => ({ status, body: { ok: false, error } });
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const perMinute = (value: number | undefined, fallback: number) => value ?? fallback;
const inRange = (value: number) => Number.isInteger(value) && value >= 1 && value <= 600;

/** Throws on a deployment mistake (the route answers 503); never on anything the adapter sends. */
export function assertModelCallDeps(deps: ModelCallDeps): void {
  if (!isValidTenantSlug(deps.tenantSlug)) throw new Error("model.call: tenant not configured");
  if (typeof deps.workerToken !== "string" || deps.workerToken.length < MIN_WORKER_TOKEN_CHARS) throw new Error("model.call: worker token not configured");
  if (!Number.isSafeInteger(deps.tenantMonthlyCapMicros) || deps.tenantMonthlyCapMicros < 0) throw new Error("model.call: monthly cap not configured");
  if (!inRange(perMinute(deps.adapterPerMinute, DEFAULT_ADAPTER_PER_MINUTE)) || !inRange(perMinute(deps.tenantPerMinute, DEFAULT_TENANT_PER_MINUTE))) {
    throw new Error("model.call: per-minute limits must be whole numbers from 1 to 600");
  }
}

interface ParsedRequest { taskKey: string; provider: string; model: string; messages: ModelMessage[]; maxOutputTokens: number }

function parseRequest(body: unknown): ParsedRequest | null {
  if (!isObject(body)) return null;
  const keys = Object.keys(body).sort();
  if (keys.length !== REQUEST_KEYS.length || keys.some((key, i) => key !== REQUEST_KEYS[i])) return null;
  const { taskKey, provider, model, messages, maxOutputTokens } = body;
  if (typeof taskKey !== "string" || !TASK_KEY.test(taskKey)) return null;
  if (typeof provider !== "string" || provider.length < 1 || provider.length > MAX_PROVIDER_CHARS) return null;
  if (typeof model !== "string" || model.length < 1 || model.length > MAX_MODEL_CHARS) return null;
  if (!Number.isInteger(maxOutputTokens) || (maxOutputTokens as number) < 1 || (maxOutputTokens as number) > MAX_OUTPUT_TOKENS) return null;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) return null;
  const parsed: ModelMessage[] = [];
  for (const message of messages) {
    if (!isObject(message) || Object.keys(message).length !== 2) return null;
    if (typeof message.role !== "string" || !ROLES.has(message.role)) return null;
    if (typeof message.content !== "string" || message.content.length < 1) return null;
    parsed.push({ role: message.role as ModelMessage["role"], content: message.content });
  }
  return { taskKey, provider, model, messages: parsed, maxOutputTokens: maxOutputTokens as number };
}

function providerFailureCode(status: number) {
  if (status === 401 || status === 403) return "provider_auth_failed";
  if (status === 404) return "provider_model_unavailable";
  if (status === 408 || status === 504) return "provider_timeout";
  if (status === 429) return "provider_rate_limited";
  if (status >= 400 && status < 500) return "provider_request_rejected";
  return "provider_request_failed";
}

const BEGIN_REFUSALS: Record<string, [number, string]> = {
  grant_not_found: [403, "grant_not_found"],
  grant_closed: [403, "grant_closed"],
  grant_expired: [403, "grant_expired"],
  adapter_not_ready: [403, "adapter_not_ready"],
  model_not_allowed: [403, "model_not_allowed"],
  call_limit: [429, "call_limit"],
  token_limit: [429, "token_limit"],
  adapter_rate_limited: [429, "rate_limited"],
  tenant_rate_limited: [429, "rate_limited"],
};

async function beginCall(rpc: BudgetRpc, body: Record<string, unknown>): Promise<{ seq: number } | { refusal: ModelCallResult }> {
  let value: unknown = null;
  try {
    const result = await rpc("client_adapter_model_call_begin", body);
    value = result.ok ? result.value : null;
  } catch {
    value = null;
  }
  if (isObject(value) && value.status === "ok" && Number.isInteger(value.seq) && (value.seq as number) >= 1) return { seq: value.seq as number };
  const known = isObject(value) && typeof value.status === "string" && Object.hasOwn(BEGIN_REFUSALS, value.status) ? BEGIN_REFUSALS[value.status] : undefined;
  return { refusal: known ? refuse(known[0], known[1]) : refuse(503, "host_unavailable") };
}

/** Corrects the grant's held tokens. Best effort: the grant's limits stay conservative if this fails. */
async function finishCall(rpc: BudgetRpc, deps: ModelCallDeps, grantId: string, seq: number, actualTokens: number) {
  try {
    await rpc("client_adapter_model_call_finish", {
      p_tenant_slug: deps.tenantSlug, p_worker_token: deps.workerToken, p_grant_id: grantId, p_seq: seq, p_actual_tokens: actualTokens,
    });
  } catch {
    // the held amount stays counted against the grant, which only makes its limit stricter
  }
}

export async function handleModelCall(authorization: string | null, body: unknown, deps: ModelCallDeps): Promise<ModelCallResult> {
  assertModelCallDeps(deps);
  // 1. The credential.
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return refuse(401, "credential_required");
  const verified = verifyModelGrantCredential({ token: authorization.slice("Bearer ".length), publicKey: deps.publicKeys, expectedTenant: deps.tenantSlug, now: deps.now });
  if (!verified.ok) return refuse(401, "bad_credential");
  const claims = verified.claims;

  // 2. The request.
  const request = parseRequest(body);
  if (!request) return refuse(400, "invalid_request");
  if (request.taskKey !== claims.task) return refuse(403, "task_mismatch");

  // 3 to 5. Policy, before anything is counted.
  if (!(MODEL_CALL_PROVIDERS as readonly string[]).includes(request.provider) || !deps.policy.clientAllows(request.provider, request.model)) {
    return refuse(403, "model_not_allowed");
  }
  const maxPromptChars = deps.policy.maxPromptChars(request.provider);
  if (maxPromptChars === null) return refuse(503, "provider_not_configured");
  const promptChars = request.messages.reduce((total, message) => total + message.content.length, 0);
  if (promptChars > maxPromptChars) return refuse(400, "prompt_too_large");
  if (deps.policy.secretLike(request.messages)) return refuse(400, "secret_like_input_rejected");
  const estimate = deps.policy.estimateMicros(request.model, request.messages, request.maxOutputTokens);
  if (estimate === null || !Number.isSafeInteger(estimate) || estimate < 0) return refuse(503, "model_pricing_not_configured");
  const heldTokens = Math.min(MAX_GRANT_TOKENS, promptChars + request.maxOutputTokens);

  // 6. The grant counts the call.
  const begun = await beginCall(deps.rpc, {
    p_tenant_slug: deps.tenantSlug,
    p_worker_token: deps.workerToken,
    p_adapter_id: claims.aud,
    p_task_id: claims.task,
    p_grant_id: claims.jti,
    p_provider: request.provider,
    p_model: request.model,
    p_tokens: heldTokens,
    p_adapter_per_minute: perMinute(deps.adapterPerMinute, DEFAULT_ADAPTER_PER_MINUTE),
    p_tenant_per_minute: perMinute(deps.tenantPerMinute, DEFAULT_TENANT_PER_MINUTE),
  });
  if ("refusal" in begun) return begun.refusal;
  const seq = begun.seq;
  const ledger = { tenantSlug: deps.tenantSlug, workerToken: deps.workerToken, adapterId: claims.aud, taskId: `${claims.task}/m${seq}` };

  // 7. The money, before the call.
  const reserved = await reserveAdapterBudget(deps.rpc, {
    ...ledger,
    idempotencyKey: `mcr-${claims.jti}-${seq}`,
    amountMicros: estimate,
    provider: request.provider,
    model: request.model,
    tenantMonthlyCapMicros: deps.tenantMonthlyCapMicros,
  });
  if (!reserved.allowed) {
    await finishCall(deps.rpc, deps, claims.jti, seq, 0);
    if (reserved.status === "adapter_cap_exceeded" || reserved.status === "tenant_cap_exceeded") return refuse(429, "budget_exceeded");
    if (reserved.status === "adapter_not_ready") return refuse(403, "adapter_not_ready");
    return refuse(503, "host_unavailable");
  }

  // The call itself, with the client's key (inside callProvider).
  let answer: ProviderAnswer;
  try {
    answer = await deps.callProvider(request.provider, request.model, request.messages, request.maxOutputTokens);
  } catch {
    answer = { ok: false, status: 503 };
  }
  if (!answer.ok || typeof answer.output !== "string") {
    await releaseAdapterBudget(deps.rpc, { ...ledger, idempotencyKey: `mcx-${claims.jti}-${seq}` });
    await finishCall(deps.rpc, deps, claims.jti, seq, 0);
    return refuse(502, providerFailureCode(answer.ok ? 502 : answer.status));
  }

  // Settle at the real cost, never above what was reserved.
  const usage = answer.usage ?? null;
  const measured = usage ? deps.policy.usageMicros(request.model, usage) : null;
  const cost = measured === null || !Number.isSafeInteger(measured) || measured < 0 ? estimate : Math.min(measured, estimate);
  const settled = await settleAdapterBudget(deps.rpc, { ...ledger, idempotencyKey: `mcs-${claims.jti}-${seq}`, actualAmountMicros: cost });
  await finishCall(deps.rpc, deps, claims.jti, seq, usage ? Math.min(MAX_GRANT_TOKENS, usage.inputTokens + usage.outputTokens) : heldTokens);
  return {
    status: 200,
    body: { ok: true, output: deps.policy.safeOutput(answer.output), usage, costMicros: cost, call: seq, ...(settled.allowed ? {} : { settled: false as const }) },
  };
}
