import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { clientRpc, consumeClientRuntimeRateLimit } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientGcpAccessToken, clientServiceAccountEmail, clientStorageConfig, safeClientFileName, signedClientStorageUrl } from "@/lib/clientStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/json", "application/pdf", "text/plain", "text/markdown", "text/csv",
  "image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/wav", "video/mp4",
]);

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!clientCapabilityEnabled("artifacts")) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
  if (!(await consumeClientRuntimeRateLimit("artifact-uploads", 10, 900))) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429 });

  const config = clientStorageConfig();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  const workerToken = process.env.CLIENT_WORKER_TOKEN?.trim();
  if (!config || !tenantSlug || !workerToken) return NextResponse.json({ ok: false, error: "storage_not_configured" }, { status: 503 });
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
    p_retention_expires_at: new Date(Date.now() + Number(process.env.CLIENT_RETENTION_DAYS ?? 30) * 86400000).toISOString(),
  });
  if (!stored.ok || stored.value !== artifactId) return NextResponse.json({ ok: false, error: "artifact_record_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, artifactId, uploadUrl: signedUrl, uploadHeaders: { "content-type": contentType }, expiresInSeconds: 900 }, { status: 201, headers: { "cache-control": "private, no-store" } });
}
