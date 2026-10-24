import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit } from "@/lib/clientDataPlane";

/**
 * The checks every adapter-host route makes before doing anything: a signed-in member, the host flag, a rate limit and
 * a configured tenant. The tenant always comes from the server's own setting, never from the request.
 */
export const NO_STORE = { "cache-control": "private, no-store" } as const;

export function adapterJsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

export type AdapterRouteGate = { ok: true; tenantSlug: string; userId: string } | { ok: false; response: Response };

export async function adapterRouteGate(bucket: string, limit: number): Promise<AdapterRouteGate> {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return { ok: false, response: adapterJsonError("not_authenticated", 401) };
  if (process.env.ADAPTER_HOST_ENABLED !== "true") return { ok: false, response: adapterJsonError("adapter_host_disabled", 403) };
  const rateLimit = await checkClientRuntimeRateLimit(bucket, limit, 900);
  if (!rateLimit.ok) return { ok: false, response: adapterJsonError("runtime_limit_unavailable", 503) };
  if (!rateLimit.allowed) return { ok: false, response: adapterJsonError("runtime_rate_limited", 429) };
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return { ok: false, response: adapterJsonError("tenant_not_configured", 503) };
  return { ok: true, tenantSlug, userId: user.id };
}

/** Reads a small JSON object body. Returns null for anything else, including bodies over the limit. */
export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const raw = await request.text().catch(() => "");
  if (raw.length > maxBytes) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
