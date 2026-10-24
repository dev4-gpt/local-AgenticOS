import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, selectClientRecords } from "@/lib/clientDataPlane";
import { readBoundedResponseBytes } from "@/lib/clientNetworkSafety";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientRetentionSecondsRemaining } from "@/lib/clientRetention";
import { clientGcpAccessToken, clientStorageConfig, safeClientObjectKey, uploadClientStorageObject } from "@/lib/clientStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return error("not_authenticated", 401);
  if (!clientCapabilityEnabled("artifacts")) return error("capability_not_enabled", 403);
  const limit = await checkClientRuntimeRateLimit("artifact-upload-bytes", 10, 900);
  if (!limit.ok) return error("runtime_limit_unavailable", 503);
  if (!limit.allowed) return error("runtime_rate_limited", 429);

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error("invalid_artifact", 400);
  const config = clientStorageConfig();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!config || !tenantSlug) return error("storage_not_configured", 503);

  const lookup = await selectClientRecords("client_runtime_artifacts", {
    id: `eq.${id}`,
    tenant_slug: `eq.${tenantSlug}`,
    created_by: `eq.${user.id}`,
    limit: "1",
  });
  if (!lookup.ok) return error("artifact_lookup_failed", 502);
  const artifact = lookup.records[0];
  const objectKey = typeof artifact?.object_key === "string" ? artifact.object_key : "";
  const expectedSize = typeof artifact?.byte_size === "number" ? artifact.byte_size : -1;
  const expectedType = typeof artifact?.content_type === "string" ? artifact.content_type.toLowerCase() : "";
  if (!artifact || artifact.tenant_slug !== tenantSlug || artifact.created_by !== user.id || artifact.status !== "pending" || clientRetentionSecondsRemaining(artifact) < 1 || !safeClientObjectKey(objectKey, config.namespace)) return error("artifact_not_found", 404);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > MAX_UPLOAD_BYTES || !expectedType || request.headers.get("content-type")?.trim().toLowerCase() !== expectedType) return error("artifact_upload_invalid", 400);

  let bytes: Buffer | null;
  try {
    bytes = await readBoundedResponseBytes(new Response(request.body, { headers: request.headers }), MAX_UPLOAD_BYTES);
  } catch {
    return error("artifact_upload_too_large", 413);
  }
  if (!bytes) return error("artifact_upload_empty", 400);
  if (bytes.byteLength !== expectedSize) return error("artifact_upload_size_mismatch", 409);

  const token = await clientGcpAccessToken();
  if (!token) return error("storage_identity_unavailable", 503);
  const uploaded = await uploadClientStorageObject({ bucket: config.bucket, objectKey, contentType: expectedType, bytes, token,
    retentionExpiresAt: String(artifact.retention_expires_at) });
  if (!uploaded) return error("artifact_upload_failed", 502);
  return NextResponse.json({ ok: true, artifactId: id, status: "uploaded" }, { headers: { "cache-control": "private, no-store" } });
}

function error(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store" } });
}
