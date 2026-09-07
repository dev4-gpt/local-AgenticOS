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

function queueAuthzUrl(provisionerUrl: string) {
  try {
    const parsed = new URL(provisionerUrl);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".run.app")) return null;
    parsed.pathname = "/adapter-queue-authz";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Queues a non-mutating task-authentication proof through the same Vercel WIF
 * boundary as a real approval. This does not create a run or call /provision.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "not_authorized" }, { status: 401 });
  const provisionerUrl = process.env.CONTROL_PLANE_PROVISIONER_URL?.trim() || "";
  const workerToken = process.env.CONTROL_PLANE_WORKER_TOKEN?.trim() || "";
  const target = queueAuthzUrl(provisionerUrl);
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
  if (response?.status !== 202 || !body || typeof body !== "object" || Array.isArray(body) || (body as { ok?: unknown }).ok !== true || (body as { status?: unknown }).status !== "queued" || typeof (body as { taskId?: unknown }).taskId !== "string") {
    return NextResponse.json({ ok: false, error: `control_plane_queue_authz_${response?.status ?? 502}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, status: "queued", taskId: (body as { taskId: string }).taskId }, { headers: { "Cache-Control": "no-store" } });
}
