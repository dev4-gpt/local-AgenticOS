import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { clientRpc, consumeClientRuntimeRateLimit, selectClientRecords, recordClientAudit } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientGcpAccessToken, clientStorageConfig, deleteClientStorageObject, safeClientObjectKey } from "@/lib/clientStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return error("not_authenticated", 401);
  if (!clientCapabilityEnabled("artifacts")) return error("capability_not_enabled", 403);
  if (!(await consumeClientRuntimeRateLimit("artifact-deletes", 20, 900))) return error("runtime_rate_limited", 429);

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error("invalid_artifact", 400);
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  const config = clientStorageConfig();
  if (!tenantSlug || !config) return error("storage_not_configured", 503);

  const lookup = await selectClientRecords("client_runtime_artifacts", {
    id: `eq.${id}`,
    tenant_slug: `eq.${tenantSlug}`,
    limit: "1",
  });
  if (!lookup.ok) return error("artifact_lookup_failed", 502);
  const artifact = lookup.records[0];
  const objectKey = typeof artifact?.object_key === "string" ? artifact.object_key : "";
  if (!artifact || !safeClientObjectKey(objectKey, config.namespace)) return error("artifact_not_found", 404);

  const token = await clientGcpAccessToken();
  if (!token) return error("storage_identity_unavailable", 503);
  if (!(await deleteClientStorageObject(config.bucket, objectKey, token))) return error("artifact_object_delete_failed", 502);

  const deleted = await clientRpc("delete_client_runtime_artifact", {
    p_tenant_slug: tenantSlug,
    p_artifact_id: id,
  });
  if (!deleted.ok || deleted.value !== true) return error("artifact_metadata_delete_failed", 502);
  await recordClientAudit("artifact.deleted", { artifactId: id, owner: user.id });
  return NextResponse.json({ ok: true, artifactId: id, status: "deleted" }, { headers: { "cache-control": "private, no-store" } });
}

function error(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store" } });
}
