import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, selectClientRecords } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
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
  // Two ways an artifact belongs to this member: they uploaded it, or a job they
  // requested produced it. The worker's create RPC sets no created_by, so a
  // created_by-only list hides every artifact the runtime built — exactly the
  // ones the gallery exists to show. Signed download already authorises by job
  // ownership, so listing them the same way keeps read and download consistent.
  const owned = await selectClientRecords("client_runtime_artifacts", {
    tenant_slug: `eq.${tenantSlug}`,
    created_by: `eq.${user.id}`,
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
  const jobIds = jobs.ok ? jobs.records.map((record) => typeof record.id === "string" ? record.id : "").filter(Boolean) : [];
  const produced = jobIds.length
    ? await selectClientRecords("client_runtime_artifacts", {
        tenant_slug: `eq.${tenantSlug}`,
        job_id: `in.(${jobIds.join(",")})`,
        order: "created_at.desc",
        limit: "100",
      })
    : { ok: true as const, records: [] as Record<string, unknown>[] };
  const merged = new Map<string, Record<string, unknown>>();
  for (const record of [...owned.records, ...(produced.ok ? produced.records : [])]) {
    const id = typeof record.id === "string" ? record.id : "";
    if (id && !merged.has(id)) merged.set(id, record);
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
  if (!artifactResult.ok || !artifact || !safeClientObjectKey(objectKey, config.namespace)) return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  if (jobId) {
    const job = await selectClientRecords("client_runtime_jobs", { id: `eq.${jobId}`, tenant_slug: `eq.${tenantSlug}`, requested_by: `eq.${userId}`, limit: "1" });
    if (!job.ok || !job.records[0]) return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  } else if (createdBy !== userId) {
    return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });
  }
  const token = await clientGcpAccessToken();
  const serviceAccount = await clientServiceAccountEmail(config.serviceAccount);
  if (!token || !serviceAccount) return NextResponse.json({ ok: false, error: "storage_identity_unavailable" }, { status: 503 });
  const downloadUrl = await signedClientStorageUrl({ method: "GET", bucket: config.bucket, objectKey, serviceAccount, token });
  if (!downloadUrl) return NextResponse.json({ ok: false, error: "signed_download_unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true, downloadUrl, expiresInSeconds: 900 }, { headers: { "cache-control": "private, no-store" } });
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
  const rawRetentionDays = process.env.CLIENT_RETENTION_DAYS ?? "45";
  const retentionDays = Number(rawRetentionDays);
  if (!/^[1-9][0-9]{0,3}$/.test(rawRetentionDays) || !Number.isSafeInteger(retentionDays) || retentionDays > 3650) {
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
    p_retention_expires_at: new Date(Date.now() + retentionDays * 86400000).toISOString(),
  });
  if (!stored.ok || stored.value !== artifactId) return NextResponse.json({ ok: false, error: "artifact_record_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, artifactId, uploadUrl: signedUrl, uploadHeaders: { "content-type": contentType }, expiresInSeconds: 900 }, { status: 201, headers: { "cache-control": "private, no-store" } });
}
