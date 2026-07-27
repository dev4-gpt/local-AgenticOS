export async function validClientTaskIdentity(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const expectedEmail = process.env.CLIENT_TASK_INVOKER_SERVICE_ACCOUNT?.trim();
  const expectedAudience = process.env.CLIENT_RUNTIME_BASE_URL?.trim().replace(/\/$/, "");
  if (!token || !expectedEmail || !expectedAudience) return false;
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return false;
  const info = await response.json().catch(() => null) as { email?: unknown; aud?: unknown; email_verified?: unknown } | null;
  return info?.email === expectedEmail && info?.aud === expectedAudience && info?.email_verified !== false;
}
