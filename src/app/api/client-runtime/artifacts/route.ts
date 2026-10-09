import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, selectClientRecords } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientRetentionExpiresAt, clientRetentionSecondsRemaining } from "@/lib/clientRetention";
import { clientGcpAccessToken, clientServiceAccountEmail, clientStorageConfig, safeClientFileName, safeClientObjectKey, signedClientStorageUrl } from "@/lib/clientStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/json", "application/pdf", "text/plain", "text/markdown", "text/csv",
  "image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/wav", "video/mp4",
]);

export async function GET(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!clientCapabilityEnabled("artifacts")) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
  const rateLimit = await checkClientRuntimeRateLimit("artifact-list", 60, 900);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });

  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return NextResponse.json({ ok: false, error: "runtime_not_configured" }, { status: 503 });
  const artifactId = new URL(request.url).searchParams.get("id")?.trim();
  if (artifactId) return signedDownload(user.id, tenantSlug, artifactId);
  const activeAfter = `gt.${new Date().toISOString()}`;
  // Two ways an artifact belongs to this member: they uploaded it, or a job they
  // requested produced it. The worker's create RPC sets no created_by, so a
  // created_by-only list hides every artifact the runtime built — exactly the
  // ones the gallery exists to show. Signed download already authorises by job
  // ownership, so listing them the same way keeps read and download consistent.
  const owned = await selectClientRecords("client_runtime_artifacts", {
    tenant_slug: `eq.${tenantSlug}`,
    created_by: `eq.${user.id}`,
    retention_expires_at: activeAfter,
    order: "created_at.desc",
    limit: "100",
  });
  if (!owned.ok) return NextResponse.json({ ok: false, error: "artifact_list_failed" }, { status: 502 });
  const jobs = await selectClientRecords("client_runtime_jobs", {
    tenant_slug: `eq.${tenantSlug}`,
    requested_by: `eq.${user.id}`,
    order: "created_at.desc",
    limit: "100",
  });
  const jobIds = jobs.ok ? jobs.records.filter((record) => record.tenant_slug === tenantSlug && record.requested_by === user.id).map((record) => typeof record.id === "string" ? record.id : "").filter(Boolean) : [];
  const produced = jobIds.length
    ? await selectClientRecords("client_runtime_artifacts", {
        tenant_slug: `eq.${tenantSlug}`,
        job_id: `in.(${jobIds.join(",")})`,
        retention_expires_at: activeAfter,
        order: "created_at.desc",
        limit: "100",
      })
    : { ok: true as const, records: [] as Record<string, unknown>[] };
  const merged = new Map<string, Record<string, unknown>>();
  const ownedJobIds = new Set(jobIds);
  for (const record of owned.records) {
    const id = typeof record.id === "string" ? record.id : "";
    if (id && record.tenant_slug === tenantSlug && record.created_by === user.id && clientRetentionSecondsRemaining(record) > 0) merged.set(id, record);
  }
  for (const record of produced.ok ? produced.records : []) {
    const id = typeof record.id === "string" ? record.id : "";
    if (id && record.tenant_slug === tenantSlug && typeof record.job_id === "string" && ownedJobIds.has(record.job_id) && !merged.has(id) && clientRetentionSecondsRemaining(record) > 0) merged.set(id, record);
  }
  const result = {
    records: [...merged.values()].sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""))).slice(0, 100),
  };
  const artifacts = result.records.map((record) => ({
    id: typeof record.id === "string" ? record.id : "",
    original_name: typeof record.original_name === "string" ? record.original_name : null,
    content_type: typeof record.content_type === "string" ? record.content_type : null,
    byte_size: typeof record.byte_size === "number" ? record.byte_size : null,
    status: typeof record.status === "string" ? record.status : null,
    created_at: typeof record.created_at === "string" ? record.created_at : null,
    retention_expires_at: typeof record.retention_expires_at === "string" ? record.retention_expires_at : null,
    job_id: typeof record.job_id === "string" ? record.job_id : null,
  })).filter((artifact) => artifact.id);
  return NextResponse.json({ ok: true, artifacts }, { headers: { "cache-control": "private, no-store" } });
}

async function signedDownload(userId: string, tenantSlug: string, artifactId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(artifactId)) return NextResponse.json({ ok: false, error: "artifact_id_invalid" }, { status: 400 });
  const config = clientStorageConfig();
  if (!config) return NextResponse.json({ ok: false, error: "storage_not_configured" }, { status: 503 });
  const artifactResult = await selectClientRecords("client_runtime_artifacts", { id: `eq.${artifactId}`, tenant_slug: `eq.${tenantSlug}`, limit: "1" });
  const artifact = artifactResult.records[0];
  const objectKey = typeof artifact?.object_key === "string" ? artifact.object_key : "";
  const jobId = typeof artifact?.job_id === "string" ? artifact.job_id : "";
  const createdBy = typeof artifact?.created_by === "string" ? artifact.created_by : "";
  const expiresInSeconds = artifact ? clientRetentionSecondsRemaining(artifact) : 0;
  if (!artifactResult.ok || !artifact || artifact.tenant_slug !== tenantSlug || artifact.status !== "ready" || !expiresInSeconds || !safeClientObjectKey(objectKey, config.namespace)) return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  if (jobId) {
    const job = await selectClientRecords("client_runtime_jobs", { id: `eq.${jobId}`, tenant_slug: `eq.${tenantSlug}`, requested_by: `eq.${userId}`, limit: "1" });
    if (!job.ok || job.records[0]?.tenant_slug !== tenantSlug || job.records[0]?.requested_by !== userId) return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  } else if (createdBy !== userId) {
    return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  }
  const token = await clientGcpAccessToken();
  const serviceAccount = await clientServiceAccountEmail(config.serviceAccount);
  if (!token || !serviceAccount) return NextResponse.json({ ok: false, error: "storage_identity_unavailable" }, { status: 503 });
  const downloadUrl = await signedClientStorageUrl({ method: "GET", bucket: config.bucket, objectKey, serviceAccount, token, expiresInSeconds, expiresAt: String(artifact.retention_expires_at) });
  if (!downloadUrl) return NextResponse.json({ ok: false, error: "signed_download_unavailable" }, { status: 503 });
  const signedLifetime = Number(new URL(downloadUrl).searchParams.get("X-Goog-Expires"));
  return NextResponse.json({ ok: true, downloadUrl, expiresInSeconds: Number.isSafeInteger(signedLifetime) && signedLifetime > 0 ? Math.min(expiresInSeconds, signedLifetime) : expiresInSeconds }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!clientCapabilityEnabled("artifacts")) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
  const rateLimit = await checkClientRuntimeRateLimit("artifact-uploads", 10, 900);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });

  const config = clientStorageConfig();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!config || !tenantSlug) return NextResponse.json({ ok: false, error: "storage_not_configured" }, { status: 503 });
  const retentionExpiresAt = clientRetentionExpiresAt(process.env.CLIENT_RETENTION_DAYS);
  if (!retentionExpiresAt) {
    return NextResponse.json({ ok: false, error: "retention_not_configured" }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const originalName = typeof body.fileName === "string" ? safeClientFileName(body.fileName) : null;
  const contentType = typeof body.contentType === "string" ? body.contentType.trim().toLowerCase() : "";
  const byteSize = typeof body.byteSize === "number" ? Math.floor(body.byteSize) : -1;
  if (!originalName || !ALLOWED_TYPES.has(contentType) || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "artifact_input_invalid" }, { status: 400 });
  }

  const artifactId = randomUUID();
  const objectKey = `${config.namespace}/${user.id}/${artifactId}-${originalName}`;
  const token = await clientGcpAccessToken();
  const serviceAccount = await clientServiceAccountEmail(config.serviceAccount);
  if (!token || !serviceAccount) return NextResponse.json({ ok: false, error: "storage_identity_unavailable" }, { status: 503 });
  const signedUrl = await signedClientStorageUrl({ method: "PUT", bucket: config.bucket, objectKey, serviceAccount, token, contentType });
  if (!signedUrl) return NextResponse.json({ ok: false, error: "signed_upload_unavailable" }, { status: 503 });

  const stored = await clientRpc("create_client_runtime_artifact", {
    p_tenant_slug: tenantSlug,
    p_artifact_id: artifactId,
    p_namespace: config.namespace,
    p_object_key: objectKey,
    p_original_name: originalName,
    p_content_type: contentType,
    p_byte_size: byteSize,
    p_retention_expires_at: retentionExpiresAt,
  });
  if (!stored.ok || stored.value !== artifactId) return NextResponse.json({ ok: false, error: "artifact_record_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, artifactId, uploadUrl: signedUrl, uploadHeaders: { "content-type": contentType }, expiresInSeconds: 900 }, { status: 201, headers: { "cache-control": "private, no-store" } });
}
