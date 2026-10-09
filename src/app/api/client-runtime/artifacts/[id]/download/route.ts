import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, selectClientRecords } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientRetentionSecondsRemaining } from "@/lib/clientRetention";
import { clientGcpAccessToken, clientServiceAccountEmail, safeClientObjectKey, signedClientStorageUrl } from "@/lib/clientStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!clientCapabilityEnabled("artifacts")) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
  const rateLimit = await checkClientRuntimeRateLimit("artifact-downloads", 40, 900);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "invalid_artifact" }, { status: 400 });
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  const namespace = process.env.CLIENT_STORAGE_NAMESPACE?.trim();
  const bucket = process.env.CLIENT_STORAGE_BUCKET?.trim();
  if (!tenantSlug || !namespace || !bucket) return NextResponse.json({ ok: false, error: "storage_not_configured" }, { status: 503 });

  const result = await selectClientRecords("client_runtime_artifacts", {
    id: `eq.${id}`,
    tenant_slug: `eq.${tenantSlug}`,
    limit: "1",
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: "artifact_lookup_failed" }, { status: 502 });
  const artifact = result.records[0];
  const objectKey = typeof artifact?.object_key === "string" ? artifact.object_key : "";
  const expiresInSeconds = artifact ? clientRetentionSecondsRemaining(artifact) : 0;
  if (!artifact || artifact.tenant_slug !== tenantSlug || artifact.status !== "ready" || !expiresInSeconds || !safeClientObjectKey(objectKey, namespace)) return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  const jobId = typeof artifact.job_id === "string" ? artifact.job_id : "";
  if (jobId) {
    const job = await selectClientRecords("client_runtime_jobs", { id: `eq.${jobId}`, tenant_slug: `eq.${tenantSlug}`, requested_by: `eq.${user.id}`, limit: "1" });
    if (!job.ok || job.records[0]?.tenant_slug !== tenantSlug || job.records[0]?.requested_by !== user.id) return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  } else if (artifact.created_by !== user.id) {
    return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  }

  const token = await clientGcpAccessToken();
  const serviceAccount = await clientServiceAccountEmail(process.env.CLIENT_RUNTIME_SERVICE_ACCOUNT);
  if (!serviceAccount || !token) return NextResponse.json({ ok: false, error: "signing_identity_unavailable" }, { status: 503 });

  const url = await signedClientStorageUrl({ method: "GET", bucket, objectKey, serviceAccount, token, expiresInSeconds, expiresAt: String(artifact.retention_expires_at) });
  if (!url) return NextResponse.json({ ok: false, error: "signed_download_unavailable" }, { status: 503 });
  return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "private, no-store" } });
}
