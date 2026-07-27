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
