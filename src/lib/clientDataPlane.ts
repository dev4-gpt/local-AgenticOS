import { createHash } from "node:crypto";
import { currentClientAccessToken, currentClientUser, supabaseAuthConfig } from "@/lib/clientAuth";

export async function insertClientRecord(table: string, record: Record<string, unknown>) {
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

export async function consumeClientRuntimeRateLimit(bucket: string, limit: number, windowSeconds: number) {
  const config = supabaseAuthConfig();
  const token = await currentClientAccessToken();
  const user = await currentClientUser();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!config || !token || !user || !tenantSlug) return false;
  const keyHash = createHash("sha256").update(`${tenantSlug}:${bucket}:${user.id}`).digest("hex");
  const response = await fetch(`${config.url}/rest/v1/rpc/consume_client_runtime_rate_limit`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant_slug: tenantSlug, p_bucket: bucket, p_key_hash: keyHash, p_limit: limit, p_window_seconds: windowSeconds }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return false;
  return (await response.json().catch(() => false)) === true;
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
  if (!response?.ok) return false;
  return (await response.json().catch(() => false)) === true;
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
  const response = await fetch(`${config.url}/rest/v1/rpc/enqueue_client_runtime_job`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_tenant_slug: tenantSlug,
      p_capability: input.capability,
      p_provider: input.provider ?? null,
      p_model: input.model ?? null,
      p_idempotency_key: input.idempotencyKey,
      p_input_metadata: input.inputMetadata ?? {},
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
