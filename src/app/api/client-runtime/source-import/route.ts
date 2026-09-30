import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, recordClientAudit, selectClientRecords } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientGcpAccessToken, clientServiceAccountEmail, clientStorageConfig, safeClientObjectKey, signedClientStorageUrl } from "@/lib/clientStorage";
import { parseClientSourcePack } from "@/lib/clientSourcePack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PACK_BYTES = 1_000_000;

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return error("not_authenticated", 401);
  if (!clientCapabilityEnabled("tenant-data") || !clientCapabilityEnabled("artifacts")) return error("capability_not_enabled", 403);
  const limit = await checkClientRuntimeRateLimit("source-import", 10, 900);
  if (!limit.ok) return error("runtime_limit_unavailable", 503);
  if (!limit.allowed) return error("runtime_rate_limited", 429);

  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  const config = clientStorageConfig();
  if (!tenantSlug || !config) return error("storage_not_configured", 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const artifactId = typeof body?.artifactId === "string" ? body.artifactId : "";
  const action = body?.action;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artifactId) || (action !== "preview" && action !== "import")) return error("source_import_input_invalid", 400);
  const previewSha256 = typeof body?.previewSha256 === "string" ? body.previewSha256 : "";
  if (action === "import" && (!/^[a-f0-9]{64}$/.test(previewSha256) || body?.permissionConfirmed !== true)) return error("source_import_review_required", 400);

  const result = await selectClientRecords("client_runtime_artifacts", { id: `eq.${artifactId}`, tenant_slug: `eq.${tenantSlug}`, created_by: `eq.${user.id}`, limit: "1" });
  if (!result.ok) return error("source_import_artifact_lookup_failed", 502);
  const artifact = result.records[0];
  const objectKey = typeof artifact?.object_key === "string" ? artifact.object_key : "";
  if (!artifact || artifact.status !== "ready" || artifact.content_type !== "application/json" || !String(artifact.original_name ?? "").toLowerCase().endsWith(".json") || typeof artifact.byte_size !== "number" || artifact.byte_size < 1 || artifact.byte_size > MAX_PACK_BYTES || !safeClientObjectKey(objectKey, config.namespace)) return error("source_import_artifact_invalid", 409);

  const token = await clientGcpAccessToken();
  const serviceAccount = await clientServiceAccountEmail(config.serviceAccount);
  if (!token || !serviceAccount) return error("storage_identity_unavailable", 503);
  const downloadUrl = await signedClientStorageUrl({ method: "GET", bucket: config.bucket, objectKey, serviceAccount, token });
  if (!downloadUrl) return error("signed_download_unavailable", 503);
  const download = await fetch(downloadUrl, { cache: "no-store", signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!download?.ok || !download.body) return error("source_import_download_failed", 502);
  const reader = download.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PACK_BYTES) { await reader.cancel(); return error("source_pack_too_large", 413); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.byteLength !== artifact.byte_size) return error("source_import_size_mismatch", 409);
  const packSha256 = createHash("sha256").update(bytes).digest("hex");
  if (action === "import" && packSha256 !== previewSha256) return error("source_import_preview_changed", 409);
  let pack;
  try {
    pack = parseClientSourcePack(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch (reason) {
    return error(reason instanceof Error && reason.message.startsWith("source_pack_") ? reason.message : "source_pack_json_invalid", 400);
  }
  const summary = {
    sourceCount: pack.sources.length,
    linkCount: pack.linkCount,
    skippedCount: pack.skippedCount,
    skipped: pack.skipped,
  };
  if (action === "preview") return NextResponse.json({
    ok: true, ...summary, packSha256,
    sources: pack.sources.map((source) => ({
      title: source.title,
      url: source.sourceUrl,
      tab: source.tab,
      collectedAt: source.collectedAt,
      text: source.text,
      links: source.links,
    })),
  }, { headers: { "cache-control": "private, no-store" } });

  const imported = await clientRpc("import_client_runtime_source_pack", {
    p_tenant_slug: tenantSlug,
    p_artifact_id: artifactId,
    p_pack_sha256: packSha256,
    p_sources: pack.sources,
  });
  if (!imported.ok || !imported.value || typeof imported.value !== "object") return error(imported.status === 404 ? "source_import_schema_missing" : "source_import_write_failed", 502);
  await recordClientAudit("tenant.source_pack.imported", { artifactId, packSha256, sourceCount: pack.sources.length, linkCount: pack.linkCount });
  return NextResponse.json({ ok: true, ...summary, result: imported.value }, { status: 201, headers: { "cache-control": "private, no-store" } });
}

function error(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store" } });
}
