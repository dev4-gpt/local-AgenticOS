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
  const account = await supabaseServiceSelect("client_onboarding_accounts", { auth_user_id: `eq.${userId}`, status: "eq.active", select: "runtime_url", limit: "2" });
  if (!account.ok || account.rows.length !== 1) return fail();
  let runtime: URL;
  try { runtime = new URL(String(account.rows[0]?.runtime_url ?? "")); }
  catch { return fail(); }
  if (runtime.protocol !== "https:" || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(runtime.hostname)
    || runtime.username || runtime.password || runtime.port || runtime.pathname !== "/" || runtime.search || runtime.hash) return fail();
  return NextResponse.json({ ok: true, runtimeUrl: runtime.origin }, { headers: { "cache-control": "no-store" } });
}

function fail() { return NextResponse.json({ ok: false, error: "runtime_destination_unavailable" }, { status: 403, headers: { "cache-control": "no-store" } }); }
