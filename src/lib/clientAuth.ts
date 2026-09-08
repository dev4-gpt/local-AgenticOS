import { cookies } from "next/headers";

const ACCESS_COOKIE = "veloce_access_token";
const REFRESH_COOKIE = "veloce_refresh_token";

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

function allowedClientEmails() {
  return (process.env.CLIENT_ALLOWED_USER_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function clientUserEmailAllowed(email: string | undefined) {
  const allowed = allowedClientEmails();
  if (!process.env.VELOCE_CLIENT_EDITION || process.env.VELOCE_CLIENT_EDITION !== "1") return true;
  if (!email || allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase());
}

export interface ClientUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export async function currentClientUser(): Promise<ClientUser | null> {
  const config = supabaseConfig();
  if (!config) return null;
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (token) {
    const user = await fetchClientUser(config, token);
    if (user) return user;
  }

  // The access cookie's maxAge matches the JWT lifetime, so the browser drops
  // it at the moment it expires rather than presenting a stale one. Refresh
  // whenever the access cookie is absent or rejected — checking only the
  // rejected case left the 30-day refresh token unreachable and signed clients
  // out roughly hourly.
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;
  return refreshClientSession(config, refreshToken, jar);
}

export async function currentClientAccessToken() {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (token) return token;
  // Callers reach this helper through several paths, not all of which resolve
  // the user first. Refresh here too so a data-plane read is not the one thing
  // that fails after the access cookie expires.
  if (!jar.get(REFRESH_COOKIE)?.value) return null;
  await currentClientUser();
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

export async function currentClientMember() {
  const user = await currentClientUser();
  const config = supabaseConfig();
  const token = await currentClientAccessToken();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!user || !config || !token || !tenantSlug) return false;
  const response = await fetch(`${config.url}/rest/v1/rpc/client_member`, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant_slug: tenantSlug }),
    cache: "no-store",
  }).catch(() => null);
  return response?.ok === true && (await response.json().catch(() => false)) === true;
}

export async function currentClientCredentialManager() {
  const user = await currentClientUser();
  const config = supabaseConfig();
  const token = await currentClientAccessToken();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!user || !config || !token || !tenantSlug) return false;
  const query = new URLSearchParams({ select: "role", tenant_slug: `eq.${tenantSlug}`, user_id: `eq.${user.id}`, status: "eq.active", role: "in.(owner,admin)", limit: "1" });
  const response = await fetch(`${config.url}/rest/v1/client_memberships?${query}`, {
    headers: { apikey: config.key, Authorization: `Bearer ${token}` },
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) return false;
  const rows: unknown = await response.json().catch(() => null);
  return Array.isArray(rows) && rows.length === 1 && ["owner", "admin"].includes(rows[0]?.role);
}

export function authCookieNames() {
  return { access: ACCESS_COOKIE, refresh: REFRESH_COOKIE };
}

export function supabaseAuthConfig() {
  return supabaseConfig();
}

async function fetchClientUser(config: { url: string; key: string }, token: string) {
  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.key, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const user = await response.json() as ClientUser;
    return clientUserEmailAllowed(user.email) ? user : null;
  } catch {
    return null;
  }
}

async function refreshClientSession(
  config: { url: string; key: string },
  refreshToken: string,
  jar: Awaited<ReturnType<typeof cookies>>,
) {
  try {
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: config.key, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const session = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user?: ClientUser;
    };
    const user = session.user;
    if (!session.access_token || !user?.id || !clientUserEmailAllowed(user.email)) return null;

    const secure = process.env.NODE_ENV === "production";
    jar.set(ACCESS_COOKIE, session.access_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(300, session.expires_in ?? 3600),
    });
    jar.set(REFRESH_COOKIE, session.refresh_token || refreshToken, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return user;
  } catch {
    return null;
  }
}
