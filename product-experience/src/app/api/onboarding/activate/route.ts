import { randomBytes } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hashSetupToken, sendSetupEmail, supabaseServiceInsert, supabaseServiceSelect, supabaseServiceUpdate } from "@/lib/publicLaunch";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim();
  const provided = request.headers.get("x-control-plane-secret")?.trim() || "";
  if (!expected || !provided) return false;
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(provided)); } catch { return false; }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { onboardingId?: unknown };
  const onboardingId = typeof body.onboardingId === "string" ? body.onboardingId.trim() : "";
  if (!onboardingId) return NextResponse.json({ ok: false, error: "missing_onboarding_id" }, { status: 400 });
  const accounts = await supabaseServiceSelect("client_onboarding_accounts", { id: `eq.${onboardingId}` });
  const account = accounts.rows[0];
  if (!accounts.ok || typeof account?.request_id !== "string" || typeof account.email !== "string") return NextResponse.json({ ok: false, error: "onboarding_not_found" }, { status: 404 });
  if (account.status !== "smoke_testing" || typeof account.tenant_slug !== "string" || !/^https:\/\/[^\s/]+\.run\.app$/i.test(String(account.runtime_url || ""))) return NextResponse.json({ ok: false, error: "runtime_smoke_required" }, { status: 409 });
  const runs = await supabaseServiceSelect("client_provisioning_runs", { onboarding_id: `eq.${onboardingId}`, status: "eq.succeeded", current_step: "eq.smoke_testing", order: "finished_at.desc", limit: "1" });
  const run = runs.rows[0];
  const smoke = run?.evidence_bundle && typeof run.evidence_bundle === "object" && !Array.isArray(run.evidence_bundle)
    ? (run.evidence_bundle as Record<string, unknown>).smoke as Record<string, unknown> | undefined
    : undefined;
  if (!runs.ok || smoke?.ok !== true || smoke.url !== account.runtime_url) return NextResponse.json({ ok: false, error: "runtime_smoke_required" }, { status: 409 });
  const requests = await supabaseServiceSelect("deployment_requests", { id: `eq.${account.request_id}` });
  const name = typeof requests.rows[0]?.name === "string" ? requests.rows[0].name : "there";
  const rawToken = randomBytes(32).toString("base64url");
  const token = await supabaseServiceInsert("client_onboarding_tokens", { onboarding_id: onboardingId, token_hash: hashSetupToken(rawToken), purpose: "setup", expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  if (!token.ok) return NextResponse.json({ ok: false, error: "setup_token_failed" }, { status: 502 });
  const delivery = await sendSetupEmail({ email: account.email, name, token: rawToken, kind: "setup" });
  await supabaseServiceUpdate("client_onboarding_accounts", { id: `eq.${onboardingId}` }, { status: "active", activated_at: new Date().toISOString(), setup_link_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, onboardingId, status: "active", delivery });
}
