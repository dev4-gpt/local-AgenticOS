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
  if (!token) return null;
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

export async function currentClientAccessToken() {
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value ?? null;
}

export function authCookieNames() {
  return { access: ACCESS_COOKIE, refresh: REFRESH_COOKIE };
}

export function supabaseAuthConfig() {
  return supabaseConfig();
}
