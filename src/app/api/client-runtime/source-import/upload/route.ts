import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc } from "@/lib/clientDataPlane";
import { readBoundedResponseBytes } from "@/lib/clientNetworkSafety";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientRetentionExpiresAt } from "@/lib/clientRetention";
import { clientGcpAccessToken, clientStorageConfig, clientStorageObjectMetadata, deleteClientStorageObject, safeClientFileName, uploadClientStorageObject } from "@/lib/clientStorage";
import { parseClientSourcePack } from "@/lib/clientSourcePack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PACK_BYTES = 1_000_000;
const MAX_REQUEST_BYTES = MAX_PACK_BYTES + 16_384;

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return error("not_authenticated", 401);
  if (!clientCapabilityEnabled("tenant-data") || !clientCapabilityEnabled("artifacts")) return error("capability_not_enabled", 403);
  const limit = await checkClientRuntimeRateLimit("source-import", 10, 900);
  if (!limit.ok) return error("runtime_limit_unavailable", 503);
  if (!limit.allowed) return error("runtime_rate_limited", 429);

  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  const config = clientStorageConfig();
  const retentionExpiresAt = clientRetentionExpiresAt(process.env.CLIENT_RETENTION_DAYS);
  if (!tenantSlug || !config || !retentionExpiresAt) return error("storage_not_configured", 503);
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return error("source_import_request_too_large", 413);

  let requestBytes: Buffer | null;
  try {
    requestBytes = await readBoundedResponseBytes(new Response(request.body, { headers: request.headers }), MAX_REQUEST_BYTES);
  } catch {
    return error("source_import_input_invalid", 400);
  }
  if (!requestBytes) return error("source_import_request_too_large", 413);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(requestBytes), { headers: request.headers }).formData();
  } catch {
    return error("source_import_input_invalid", 400);
  }
  const file = form.get("file");
  const originalName = file instanceof File ? safeClientFileName(file.name) : null;
  if (form.get("permissionConfirmed") !== "true") return error("source_import_permission_required", 400);
  if (!(file instanceof File) || !originalName || !originalName.toLowerCase().endsWith(".json") || file.type !== "application/json" || file.size < 1 || file.size > MAX_PACK_BYTES) return error("source_import_input_invalid", 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || bytes.byteLength > MAX_PACK_BYTES) return error("source_import_input_invalid", 400);
  const packSha256 = createHash("sha256").update(bytes).digest("hex");
  const expectedSha256 = form.get("expectedSha256");
  if (expectedSha256 !== null && (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256) || expectedSha256 !== packSha256)) return error("source_import_manifest_mismatch", 409);
  try {
    parseClientSourcePack(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch (reason) {
    return error(reason instanceof Error && reason.message.startsWith("source_pack_") ? reason.message : "source_pack_json_invalid", 400);
  }

  const workerToken = process.env.CLIENT_WORKER_TOKEN?.trim();
  if (!workerToken || workerToken.length < 24) return error("source_import_verifier_unavailable", 503);
  const token = await clientGcpAccessToken();
  if (!token) return error("storage_identity_unavailable", 503);
  const artifactId = randomUUID();
  const objectKey = `${config.namespace}/${user.id}/${artifactId}-${originalName}`;
  const created = await clientRpc("create_client_runtime_artifact", {
    p_tenant_slug: tenantSlug,
    p_artifact_id: artifactId,
    p_namespace: config.namespace,
    p_object_key: objectKey,
    p_original_name: originalName,
    p_content_type: "application/json",
    p_byte_size: bytes.byteLength,
    p_retention_expires_at: retentionExpiresAt,
  });
  if (!created.ok || created.value !== artifactId) return error("artifact_record_failed", 502);

  const uploaded = await uploadClientStorageObject({ bucket: config.bucket, objectKey, contentType: "application/json", bytes, token });
  const metadata = uploaded ? await clientStorageObjectMetadata(config.bucket, objectKey, token) : null;
  if (!metadata || metadata.size !== bytes.byteLength || metadata.contentType !== "application/json") {
    const cleaned = await cleanupPendingUpload({ bucket: config.bucket, objectKey, token, tenantSlug, artifactId });
    return error(cleaned ? "source_import_upload_failed" : "source_import_cleanup_pending", 502);
  }
  const confirmed = await clientRpc("confirm_client_runtime_artifact", {
    p_tenant_slug: tenantSlug,
    p_artifact_id: artifactId,
    p_byte_size: metadata.size,
    p_content_type: metadata.contentType,
  });
  if (!confirmed.ok || confirmed.value !== true) {
    const cleaned = await cleanupPendingUpload({ bucket: config.bucket, objectKey, token, tenantSlug, artifactId });
    return error(cleaned ? "artifact_confirm_failed" : "source_import_cleanup_pending", 502);
  }
  return NextResponse.json({ ok: true, artifactId, packSha256 }, { status: 201, headers: { "cache-control": "private, no-store" } });
}

async function cleanupPendingUpload(input: { bucket: string; objectKey: string; token: string; tenantSlug: string; artifactId: string }) {
  let objectDeleted = false;
  try {
    objectDeleted = await deleteClientStorageObject(input.bucket, input.objectKey, input.token);
  } catch {
    return false;
  }
  if (!objectDeleted) return false;

  try {
    const artifactDeleted = await clientRpc("delete_client_runtime_artifact", {
      p_tenant_slug: input.tenantSlug,
      p_artifact_id: input.artifactId,
    });
    return artifactDeleted.ok && artifactDeleted.value === true;
  } catch {
    return false;
  }
}

function error(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store" } });
}
