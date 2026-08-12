import { createHash } from "node:crypto";
import { currentClientAccessToken, currentClientUser, supabaseAuthConfig } from "@/lib/clientAuth";
import { logClientRuntimeEvent } from "@/lib/clientRuntimeObservability";
import { resolveCapabilityTraits, traitBundleMetadata } from "@/lib/capabilityTraits";

// PostgREST accepts an array for a bulk insert, which lets a caller write a
// whole roster in one request instead of a row at a time.
export async function insertClientRecord(table: string, record: Record<string, unknown> | Record<string, unknown>[]) {
  const config = supabaseAuthConfig();
  const token = await currentClientAccessToken();
  if (!config || !token) return { ok: false, status: 401 };

  const response = await fetch(`${config.url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(record),
    cache: "no-store",
  }).catch(() => null);

  return { ok: Boolean(response?.ok), status: response?.status ?? 503 };
}

export async function updateClientRecord(table: string, filters: Record<string, string>, record: Record<string, unknown>) {
  const config = supabaseAuthConfig();
  const token = await currentClientAccessToken();
  if (!config || !token) return { ok: false, status: 401 };
  const query = new URLSearchParams(filters);
  const response = await fetch(`${config.url}/rest/v1/${table}?${query.toString()}`, {
    method: "PATCH",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(record),
    cache: "no-store",
  }).catch(() => null);
  return { ok: Boolean(response?.ok), status: response?.status ?? 503 };
}

export async function deleteClientRecord(table: string, filters: Record<string, string>) {
  const config = supabaseAuthConfig();
  const token = await currentClientAccessToken();
  if (!config || !token) return { ok: false, status: 401 };
  const query = new URLSearchParams(filters);
  const response = await fetch(`${config.url}/rest/v1/${table}?${query.toString()}`, {
    method: "DELETE",
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, Prefer: "return=minimal" },
    cache: "no-store",
  }).catch(() => null);
  return { ok: Boolean(response?.ok), status: response?.status ?? 503 };
}

export async function clientRpc(functionName: string, body: Record<string, unknown>) {
  const config = supabaseAuthConfig();
  const token = await currentClientAccessToken();
  if (!config || !token) return { ok: false, status: 401, value: null as unknown };
  const response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null);
  return { ok: response?.ok === true, status: response?.status ?? 503, value: await response?.json().catch(() => null) };
}

export async function selectClientRecords(table: string, filters: Record<string, string>) {
  const config = supabaseAuthConfig();
  const token = await currentClientAccessToken();
  if (!config || !token) return { ok: false, status: 401, records: [] as Record<string, unknown>[] };
  const query = new URLSearchParams({ select: "*", ...filters });
  const response = await fetch(`${config.url}/rest/v1/${table}?${query.toString()}`, {
    headers: { apikey: config.key, Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return { ok: false, status: response?.status ?? 503, records: [] as Record<string, unknown>[] };
  const records = await response.json().catch(() => []) as Record<string, unknown>[];
  return { ok: true, status: response.status, records: Array.isArray(records) ? records : [] };
}

export async function checkClientRuntimeRateLimit(bucket: string, limit: number, windowSeconds: number) {
  const config = supabaseAuthConfig();
  const token = await currentClientAccessToken();
  const user = await currentClientUser();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!config || !token || !user || !tenantSlug) return { ok: false as const, status: 401, allowed: false };
  const keyHash = createHash("sha256").update(`${tenantSlug}:${bucket}:${user.id}`).digest("hex");
  const response = await fetch(`${config.url}/rest/v1/rpc/consume_client_runtime_rate_limit`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant_slug: tenantSlug, p_bucket: bucket, p_key_hash: keyHash, p_limit: limit, p_window_seconds: windowSeconds }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) {
    logClientRuntimeEvent("runtime.limit_check_failed", { tenant: tenantSlug ?? "unknown", bucket, status: response?.status ?? 503 });
    return { ok: false as const, status: response?.status ?? 503, allowed: false };
  }
  const allowed = (await response.json().catch(() => false)) === true;
  if (!allowed) logClientRuntimeEvent("runtime.rate_limited", { tenant: tenantSlug ?? "unknown", bucket, status: 429 });
  return { ok: true as const, status: response.status, allowed };
}

export async function consumeClientRuntimeRateLimit(bucket: string, limit: number, windowSeconds: number) {
  const result = await checkClientRuntimeRateLimit(bucket, limit, windowSeconds);
  return result.ok && result.allowed;
}

export async function refundClientRuntimeRateLimit(bucket: string, windowSeconds: number) {
  const result = await clientRpc("refund_client_runtime_rate_limit", {
    p_tenant_slug: process.env.CLIENT_SLUG?.trim() ?? "",
    p_bucket: bucket,
    p_window_seconds: windowSeconds,
  });
  return result.ok && result.value === true;
}

export async function reserveClientRuntimeBudget(provider: string, model: string | null, amountMicros: number, jobId?: string) {
  const config = supabaseAuthConfig();
  const token = await currentClientAccessToken();
  const user = await currentClientUser();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  const monthlyCap = Number(process.env.CLIENT_BUDGET_CAP ?? 0);
  if (!config || !token || !user || !tenantSlug || !Number.isFinite(monthlyCap) || monthlyCap < 0) return false;
  const response = await fetch(`${config.url}/rest/v1/rpc/reserve_client_runtime_budget`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_tenant_slug: tenantSlug,
      p_provider: provider,
      p_model: model,
      p_amount_micros: Math.max(0, Math.round(amountMicros)),
      p_monthly_cap_micros: Math.round(monthlyCap * 1_000_000),
      p_job_id: jobId ?? null,
    }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) {
    logClientRuntimeEvent("runtime.budget_check_failed", { tenant: tenantSlug ?? "unknown", provider, status: response?.status ?? 503 });
    return false;
  }
  const allowed = (await response.json().catch(() => false)) === true;
  if (!allowed) logClientRuntimeEvent("runtime.budget_exceeded", { tenant: tenantSlug ?? "unknown", provider, status: 429 });
  return allowed;
}

export async function enqueueClientRuntimeJob(input: {
  capability: string;
  provider?: string | null;
  model?: string | null;
  idempotencyKey: string;
  inputMetadata?: Record<string, unknown>;
}) {
  const config = supabaseAuthConfig();
  const token = await currentClientAccessToken();
  const user = await currentClientUser();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!config || !token || !user || !tenantSlug) return null;
  const inputRecord = input.inputMetadata ?? {};
  const surface = typeof inputRecord.surface === "string" ? inputRecord.surface : null;
  const traitBundle = resolveCapabilityTraits({ capability: input.capability, provider: input.provider, surface });
  const enrichedMetadata = {
    ...inputRecord,
    __veloceTraits: traitBundleMetadata(traitBundle),
  };
  const response = await fetch(`${config.url}/rest/v1/rpc/enqueue_client_runtime_job`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_tenant_slug: tenantSlug,
      p_capability: input.capability,
      p_provider: input.provider ?? null,
      p_model: input.model ?? null,
      p_idempotency_key: input.idempotencyKey,
      p_input_metadata: enrichedMetadata,
    }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const jobId = await response.json().catch(() => null);
  return typeof jobId === "string" ? jobId : null;
}

export async function cancelClientRuntimeJob(jobId: string, errorCode: string) {
  const config = supabaseAuthConfig();
  const token = await currentClientAccessToken();
  const user = await currentClientUser();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!config || !token || !user || !tenantSlug) return false;
  const response = await fetch(`${config.url}/rest/v1/rpc/cancel_client_runtime_job`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant_slug: tenantSlug, p_job_id: jobId, p_error_code: errorCode }),
    cache: "no-store",
  }).catch(() => null);
  return response?.ok === true && (await response.json().catch(() => false)) === true;
}

export async function workerRpc(functionName: string, body: Record<string, unknown>) {
  const config = supabaseAuthConfig();
  if (!config) return { ok: false, status: 503, value: null as unknown };
  const response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null);
  return { ok: response?.ok === true, status: response?.status ?? 503, value: await response?.json().catch(() => null) };
}

export async function reserveClientRuntimeBudgetWorker(input: {
  provider: string;
  model: string;
  amountMicros: number;
  jobId: string;
  workerToken: string;
}) {
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  const monthlyCap = Number(process.env.CLIENT_BUDGET_CAP ?? 0);
  if (!tenantSlug || !Number.isFinite(monthlyCap) || monthlyCap < 0) return false;
  const result = await workerRpc("reserve_client_runtime_budget_worker", {
    p_tenant_slug: tenantSlug,
    p_provider: input.provider,
    p_model: input.model,
    p_amount_micros: Math.max(0, Math.round(input.amountMicros)),
    p_monthly_cap_micros: Math.round(monthlyCap * 1_000_000),
    p_job_id: input.jobId,
    p_worker_token: input.workerToken,
  });
  return result.ok && result.value === true;
}

export async function settleClientRuntimeBudgetWorker(input: {
  jobId: string;
  actualAmountMicros: number;
  usageMetadata: Record<string, number>;
  workerToken: string;
}) {
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug || !Number.isSafeInteger(input.actualAmountMicros) || input.actualAmountMicros < 0) return false;
  const result = await workerRpc("settle_client_runtime_budget_worker", {
    p_tenant_slug: tenantSlug,
    p_job_id: input.jobId,
    p_worker_token: input.workerToken,
    p_actual_amount_micros: input.actualAmountMicros,
    p_usage_metadata: input.usageMetadata,
  });
  return result.ok && result.value === true;
}

export async function recordClientAudit(eventType: string, metadata: Record<string, unknown> = {}) {
  const user = await currentClientUser();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!user || !tenantSlug) return false;
  const result = await insertClientRecord("client_runtime_audit_events", {
    tenant_slug: tenantSlug,
    actor_id: user.id,
    event_type: eventType,
    metadata,
  });
  return result.ok;
}
