import { openRouterKey, providerEnvKey } from "@/lib/providerKeys";

/** Local operator key lookup remains unchanged; tenant execution fails closed. */
export async function clientExecutionCredential(name: string): Promise<string | null> {
  if (process.env.VELOCE_CLIENT_EDITION === "1") {
    const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
    const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
    const tenantSlug = process.env.CLIENT_SLUG?.trim();
    const workerToken = process.env.CLIENT_WORKER_TOKEN?.trim();
    if (!url || !anonKey || !tenantSlug) return null;
    let accessToken: string | null = null;
    if (!workerToken) {
      try {
        const { currentClientAccessToken } = await import("@/lib/clientAuth");
        accessToken = await currentClientAccessToken();
      } catch { return null; }
      if (!accessToken) return null;
    }
    const response = await fetch(`${url}/rest/v1/rpc/client_provider_execution_allowed`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken || anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_tenant_slug: tenantSlug, p_provider_key: name, p_worker_token: workerToken || null }),
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!response?.ok || await response.json().catch(() => false) !== true) return null;
  }
  return name === "OPENROUTER_API_KEY" ? openRouterKey() : providerEnvKey(name);
}
