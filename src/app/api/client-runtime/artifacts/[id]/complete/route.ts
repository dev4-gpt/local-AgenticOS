import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, selectClientRecords } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientRetentionSecondsRemaining } from "@/lib/clientRetention";
import { clientGcpAccessToken, clientStorageConfig, clientStorageObjectMetadata, safeClientObjectKey } from "@/lib/clientStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentClientUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!clientCapabilityEnabled("artifacts")) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
  const rateLimit = await checkClientRuntimeRateLimit("artifact-completions", 20, 900);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "invalid_artifact" }, { status: 400 });
  const config = clientStorageConfig();
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!config || !tenantSlug) return NextResponse.json({ ok: false, error: "storage_not_configured" }, { status: 503 });

  const result = await selectClientRecords("client_runtime_artifacts", { id: `eq.${id}`, tenant_slug: `eq.${tenantSlug}`, limit: "1" });
  const artifact = result.records[0];
  const objectKey = typeof artifact?.object_key === "string" ? artifact.object_key : "";
  if (!result.ok) return NextResponse.json({ ok: false, error: "artifact_lookup_failed" }, { status: 502 });
  if (!artifact || artifact.tenant_slug !== tenantSlug || artifact.created_by !== user.id || artifact.status !== "pending" || clientRetentionSecondsRemaining(artifact) < 1 || !safeClientObjectKey(objectKey, config.namespace)) return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 });

  const token = await clientGcpAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "storage_identity_unavailable" }, { status: 503 });
  const metadata = await clientStorageObjectMetadata(config.bucket, objectKey, token);
  if (!metadata || metadata.size < 1 || metadata.size > MAX_UPLOAD_BYTES || metadata.contentType !== artifact.content_type) {
    return NextResponse.json({ ok: false, error: "artifact_upload_not_verified" }, { status: 409 });
  }

  const confirmed = await clientRpc("confirm_client_runtime_artifact", {
    p_tenant_slug: tenantSlug,
    p_artifact_id: id,
    p_byte_size: metadata.size,
    p_content_type: metadata.contentType,
  });
  if (!confirmed.ok || confirmed.value !== true) return NextResponse.json({ ok: false, error: "artifact_confirm_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, artifactId: id, status: "ready" }, { headers: { "cache-control": "private, no-store" } });
}
