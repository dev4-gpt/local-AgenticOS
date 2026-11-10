/**
 * Server-side wrapper for the adapter budget functions (ADR-007).
 *
 * The rules live in product-experience/supabase-client-adapter-budget.sql. This module checks input before any
 * database call, passes whole-number micros only, and fails closed: anything that is not an exact success answer
 * from the database is treated as "not allowed". It never reads the environment; the caller passes the worker
 * token and the tenant's monthly cap.
 */
import { AdapterContractError, assertMicros, isValidAdapterId, isValidIdempotencyKey, isValidTenantSlug } from "./adapterContracts";

export type BudgetStatus =
  | "reserved"
  | "already_reserved"
  | "settled"
  | "released"
  | "already_applied"
  | "adapter_not_ready"
  | "adapter_cap_exceeded"
  | "tenant_cap_exceeded"
  | "key_conflict"
  | "task_already_reserved"
  | "already_closed"
  | "not_found"
  | "over_reserved"
  | "refused"
  | "invalid_input"
  | "unavailable";

const KNOWN: ReadonlySet<string> = new Set<BudgetStatus>([
  "reserved", "already_reserved", "settled", "released", "already_applied", "adapter_not_ready", "adapter_cap_exceeded",
  "tenant_cap_exceeded", "key_conflict", "task_already_reserved", "already_closed", "not_found", "over_reserved", "refused",
]);

export type BudgetRpc = (functionName: string, body: Record<string, unknown>) => Promise<{ ok: boolean; status: number; value: unknown }>;

export interface BudgetResult {
  /** True only when the money question is settled in the caller's favour: reserved, settled, released or already so. */
  allowed: boolean;
  status: BudgetStatus;
}

const MIN_WORKER_TOKEN_CHARS = 24;
const MAX_TASK_ID_CHARS = 128;
const MAX_PROVIDER_CHARS = 120;
const MAX_MODEL_CHARS = 180;
const ALLOWED_RESERVE = new Set<BudgetStatus>(["reserved", "already_reserved"]);
const ALLOWED_SETTLE = new Set<BudgetStatus>(["settled", "already_applied"]);
const ALLOWED_RELEASE = new Set<BudgetStatus>(["released", "already_applied"]);

const deny = (status: BudgetStatus): BudgetResult => ({ allowed: false, status });

function common(i: { tenantSlug: string; workerToken: string; adapterId: string; taskId: string; idempotencyKey: string }): boolean {
  return isValidTenantSlug(i.tenantSlug)
    && typeof i.workerToken === "string" && i.workerToken.length >= MIN_WORKER_TOKEN_CHARS
    && isValidAdapterId(i.adapterId)
    && typeof i.taskId === "string" && i.taskId.length >= 1 && i.taskId.length <= MAX_TASK_ID_CHARS
    && isValidIdempotencyKey(i.idempotencyKey);
}

function micros(value: unknown, field: string): number | null {
  try {
    return assertMicros(value, field);
  } catch (error) {
    if (error instanceof AdapterContractError) return null;
    throw error;
  }
}

async function call(rpc: BudgetRpc, name: string, body: Record<string, unknown>, allowed: Set<BudgetStatus>): Promise<BudgetResult> {
  let result: Awaited<ReturnType<BudgetRpc>>;
  try {
    result = await rpc(name, body);
  } catch {
    return deny("unavailable");
  }
  if (!result.ok || typeof result.value !== "string" || !KNOWN.has(result.value)) return deny("unavailable");
  const status = result.value as BudgetStatus;
  return { allowed: allowed.has(status), status };
}

export interface ReserveInput {
  tenantSlug: string;
  workerToken: string;
  adapterId: string;
  taskId: string;
  idempotencyKey: string;
  amountMicros: number;
  provider: string;
  model?: string | null;
  tenantMonthlyCapMicros: number;
}

export async function reserveAdapterBudget(rpc: BudgetRpc, input: ReserveInput): Promise<BudgetResult> {
  const amount = micros(input.amountMicros, "amountMicros");
  const cap = micros(input.tenantMonthlyCapMicros, "tenantMonthlyCapMicros");
  const model = input.model ?? null;
  if (
    !common(input) || amount === null || cap === null
    || typeof input.provider !== "string" || input.provider.length < 1 || input.provider.length > MAX_PROVIDER_CHARS
    || (model !== null && (typeof model !== "string" || model.length < 1 || model.length > MAX_MODEL_CHARS))
  ) {
    return deny("invalid_input");
  }
  return call(rpc, "client_adapter_budget_reserve", {
    p_tenant_slug: input.tenantSlug,
    p_worker_token: input.workerToken,
    p_adapter_id: input.adapterId,
    p_task_id: input.taskId,
    p_idempotency_key: input.idempotencyKey,
    p_amount_micros: amount,
    p_provider: input.provider,
    p_model: model,
    p_tenant_monthly_cap_micros: cap,
  }, ALLOWED_RESERVE);
}

export interface SettleInput {
  tenantSlug: string;
  workerToken: string;
  adapterId: string;
  taskId: string;
  idempotencyKey: string;
  actualAmountMicros: number;
}

export async function settleAdapterBudget(rpc: BudgetRpc, input: SettleInput): Promise<BudgetResult> {
  const amount = micros(input.actualAmountMicros, "actualAmountMicros");
  if (!common(input) || amount === null) return deny("invalid_input");
  return call(rpc, "client_adapter_budget_settle", {
    p_tenant_slug: input.tenantSlug,
    p_worker_token: input.workerToken,
    p_adapter_id: input.adapterId,
    p_task_id: input.taskId,
    p_idempotency_key: input.idempotencyKey,
    p_actual_amount_micros: amount,
  }, ALLOWED_SETTLE);
}

export type ReleaseInput = Omit<SettleInput, "actualAmountMicros">;

export async function releaseAdapterBudget(rpc: BudgetRpc, input: ReleaseInput): Promise<BudgetResult> {
  if (!common(input)) return deny("invalid_input");
  return call(rpc, "client_adapter_budget_release", {
    p_tenant_slug: input.tenantSlug,
    p_worker_token: input.workerToken,
    p_adapter_id: input.adapterId,
    p_task_id: input.taskId,
    p_idempotency_key: input.idempotencyKey,
  }, ALLOWED_RELEASE);
}
