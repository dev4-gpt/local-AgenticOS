import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, selectClientRecords } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientRetentionSecondsRemaining } from "@/lib/clientRetention";
import { clientGcpAccessToken, clientStorageConfig, proxyClientStorageObject, safeClientFileName, safeClientObjectKey } from "@/lib/clientStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024;

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
  const config = clientStorageConfig();
  if (!tenantSlug || !config) return NextResponse.json({ ok: false, error: "storage_not_configured" }, { status: 503 });

  const result = await selectClientRecords("client_runtime_artifacts", {
    id: `eq.${id}`,
    tenant_slug: `eq.${tenantSlug}`,
    limit: "1",
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: "artifact_lookup_failed" }, { status: 502 });
  const artifact = result.records[0];
  const objectKey = typeof artifact?.object_key === "string" ? artifact.object_key : "";
  const expiresInSeconds = artifact ? clientRetentionSecondsRemaining(artifact) : 0;
  if (!artifact || artifact.tenant_slug !== tenantSlug || artifact.status !== "ready" || !expiresInSeconds || !safeClientObjectKey(objectKey, config.namespace)) return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  const jobId = typeof artifact.job_id === "string" ? artifact.job_id : "";
  if (jobId) {
    const job = await selectClientRecords("client_runtime_jobs", { id: `eq.${jobId}`, tenant_slug: `eq.${tenantSlug}`, requested_by: `eq.${user.id}`, limit: "1" });
    if (!job.ok || job.records[0]?.tenant_slug !== tenantSlug || job.records[0]?.requested_by !== user.id) return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  } else if (artifact.created_by !== user.id) {
    return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  }

  const byteSize = typeof artifact.byte_size === "number" ? artifact.byte_size : -1;
  if (!Number.isSafeInteger(byteSize) || byteSize < 1) return NextResponse.json({ ok: false, error: "artifact_size_invalid" }, { status: 409 });
  if (byteSize > MAX_DOWNLOAD_BYTES) return NextResponse.json({ ok: false, error: "artifact_too_large" }, { status: 413 });
  const token = await clientGcpAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "storage_identity_unavailable" }, { status: 503 });
  const object = await proxyClientStorageObject({ bucket: config.bucket, objectKey, token, maxBytes: MAX_DOWNLOAD_BYTES, expectedBytes: byteSize });
  if (!object) return NextResponse.json({ ok: false, error: "artifact_download_failed" }, { status: 502 });
  const fileName = safeClientFileName(typeof artifact.original_name === "string" ? artifact.original_name : "") ?? "artifact.bin";
  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-type": typeof artifact.content_type === "string" ? artifact.content_type : object.contentType,
    "content-disposition": `attachment; filename="${fileName}"`,
    "x-content-type-options": "nosniff",
  });
  if (object.contentLength) headers.set("content-length", object.contentLength);
  return new Response(object.body, { status: 200, headers });
}
