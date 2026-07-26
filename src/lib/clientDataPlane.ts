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
