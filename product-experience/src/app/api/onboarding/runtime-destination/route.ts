import { NextResponse } from "next/server";
import { publicLaunchConfig, supabaseServiceSelect } from "@/lib/publicLaunch";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = publicLaunchConfig();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  if (!config || token.length < 20 || token.length > 4096) return fail();
  const profile = await fetch(`${config.url}/auth/v1/user`, { headers: { apikey: config.serviceKey, Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  const user = await profile?.json().catch(() => null) as { id?: unknown } | null;
  const userId = typeof user?.id === "string" ? user.id : "";
  if (!profile?.ok || !userId) return fail();
  const account = await supabaseServiceSelect("client_onboarding_accounts", { auth_user_id: `eq.${userId}`, status: "eq.active", select: "runtime_url,tenant_slug", limit: "2" });
  if (!account.ok || account.rows.length !== 1) return fail();
  const tenantSlug = typeof account.rows[0]?.tenant_slug === "string" ? account.rows[0].tenant_slug : "";
  if (!tenantSlug) return fail();
  const membership = await fetch(`${config.url}/rest/v1/rpc/client_member`, {
    method: "POST",
    headers: { apikey: config.serviceKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant_slug: tenantSlug }),
    cache: "no-store",
  }).catch(() => null);
  if (!membership?.ok || await membership.json().catch(() => false) !== true) return fail();
  let runtime: URL;
  try { runtime = new URL(String(account.rows[0]?.runtime_url ?? "")); }
  catch { return fail(); }
  if (runtime.protocol !== "https:" || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(runtime.hostname)
    || runtime.username || runtime.password || runtime.port || runtime.pathname !== "/" || runtime.search || runtime.hash) return fail();
  return NextResponse.json({ ok: true, runtimeUrl: runtime.origin }, { headers: { "cache-control": "no-store" } });
}

function fail() { return NextResponse.json({ ok: false, error: "runtime_destination_unavailable" }, { status: 403, headers: { "cache-control": "no-store" } }); }
