import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cloudRunIdTokenFromVercel, controlPlaneOidcConfigured } from "@/lib/cloudRunOidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";
  const provided = request.headers.get("x-control-plane-secret")?.trim() || "";
  if (!expected || !provided) return false;
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(provided)); } catch { return false; }
}

function healthUrl(provisionerUrl: string) {
  try {
    const parsed = new URL(provisionerUrl);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".run.app")) return null;
    parsed.pathname = "/adapter-healthz";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Non-mutating acceptance probe for the production control-plane hop:
 * Vercel WIF -> private public-provisioner -> private gcp-provisioner.
 * It is intentionally operator-secret protected and does not create an
 * onboarding run, call a provider, or invoke tenant provisioning.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const provisionerUrl = process.env.CONTROL_PLANE_PROVISIONER_URL?.trim() || "";
  const workerToken = process.env.CONTROL_PLANE_WORKER_TOKEN?.trim() || "";
  const target = healthUrl(provisionerUrl);
  if (!target || !workerToken || !controlPlaneOidcConfigured()) {
    return NextResponse.json({ ok: false, error: "control_plane_not_configured" }, { status: 503 });
  }
  const identity = await cloudRunIdTokenFromVercel(request, target);
  if (!identity.ok) return NextResponse.json({ ok: false, error: identity.error }, { status: 503 });
  const response = await fetch(target, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${workerToken}`,
      "X-Serverless-Authorization": `Bearer ${identity.token}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const body = await response?.json().catch(() => null);
  if (!response?.ok || !body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: `control_plane_health_${response?.status ?? 502}` }, { status: 502 });
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
