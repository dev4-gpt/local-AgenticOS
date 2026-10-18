import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, insertClientRecord, selectClientRecords, recordClientAudit } from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientRetentionExpiresAt, clientRetentionSecondsRemaining } from "@/lib/clientRetention";
import { validateNotebookSource, validateNotebookDeletionRequest, type NotebookSourceKind } from "@/lib/v96NotebookContracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "client_notebook_sources";
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: Request) {
  const session = await member();
  if (!session) return fail("not_authenticated", 401);
  const rate = await checkClientRuntimeRateLimit("notebook-source-read", 120, 900);
  if (!rate.ok) return fail("runtime_limit_unavailable", 503);
  if (!rate.allowed) return fail("runtime_rate_limited", 429);
  const notebookId = new URL(request.url).searchParams.get("notebookId")?.trim();
  if (notebookId && !UUID.test(notebookId)) return fail("source_input_invalid", 400);
  const result = await selectClientRecords(TABLE, {
    tenant_slug: `eq.${session.tenantSlug}`,
    ...(notebookId ? { notebook_id: `eq.${notebookId}` } : {}),
    deleted_at: "is.null",
    retention_expires_at: `gt.${new Date().toISOString()}`,
    order: "created_at.desc",
    limit: "100",
  });
  if (!result.ok) return fail(result.status === 404 ? "notebook_lineage_schema_missing" : "notebook_source_read_failed", result.status === 404 ? 503 : 502);
  return NextResponse.json({ ok: true, sources: result.records.filter((record) => clientRetentionSecondsRemaining(record) > 0).map(publicSource) }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const session = await member();
  if (!session) return fail("not_authenticated", 401);
  const rate = await checkClientRuntimeRateLimit("notebook-source-write", 30, 900);
  if (!rate.ok) return fail("runtime_limit_unavailable", 503);
  if (!rate.allowed) return fail("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const kind = typeof body.kind === "string" ? body.kind : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 240) : "";
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : undefined;
  const artifactId = typeof body.artifactId === "string" ? body.artifactId.trim() : undefined;
  if (containsClientSecretLike(`${title}\n${sourceUrl ?? ""}`)) return fail("secret_like_input_rejected", 400);
  const id = randomUUID();
  const errors = validateNotebookSource({ contractVersion: "v96", id, tenantSlug: session.tenantSlug, kind: kind as NotebookSourceKind, title, sourceUrl, artifactId, status: "registered" });
  if (errors.length) return NextResponse.json({ ok: false, error: "source_input_invalid", details: errors }, { status: 400 });
  const notebookId = typeof body.notebookId === "string" ? body.notebookId.trim() : null;
  if (notebookId && !UUID.test(notebookId)) return fail("source_input_invalid", 400);
  if (notebookId) {
    const notebook = await selectClientRecords("client_notebooks", { id: `eq.${notebookId}`, tenant_slug: `eq.${session.tenantSlug}`, limit: "1" });
    if (!notebook.ok) return fail("source_notebook_lookup_failed", 502);
    if (notebook.records[0]?.tenant_slug !== session.tenantSlug) return fail("source_notebook_not_found", 404);
  }
  let retentionExpiresAt = clientRetentionExpiresAt(process.env.CLIENT_NOTEBOOK_RETENTION_DAYS ?? process.env.CLIENT_RETENTION_DAYS);
  if (!retentionExpiresAt) return fail("retention_not_configured", 503);
  if (artifactId) {
    const result = await selectClientRecords("client_runtime_artifacts", { id: `eq.${artifactId}`, tenant_slug: `eq.${session.tenantSlug}`, limit: "1" });
    if (!result.ok) return fail("source_artifact_lookup_failed", 502);
    const artifact = result.records[0];
    if (!artifact || artifact.tenant_slug !== session.tenantSlug || artifact.status !== "ready" || clientRetentionSecondsRemaining(artifact) < 1) return fail("source_artifact_not_found", 404);
    if (artifact.created_by !== session.userId) {
      const jobId = typeof artifact.job_id === "string" ? artifact.job_id : "";
      if (!jobId) return fail("source_artifact_not_found", 404);
      const job = await selectClientRecords("client_runtime_jobs", { id: `eq.${jobId}`, tenant_slug: `eq.${session.tenantSlug}`, requested_by: `eq.${session.userId}`, limit: "1" });
      if (!job.ok || job.records[0]?.tenant_slug !== session.tenantSlug || job.records[0]?.requested_by !== session.userId) return fail("source_artifact_not_found", 404);
    }
    if (Date.parse(String(artifact.retention_expires_at)) < Date.parse(retentionExpiresAt)) {
      retentionExpiresAt = String(artifact.retention_expires_at);
    }
  }
  const stored = await insertClientRecord(TABLE, {
    id,
    tenant_slug: session.tenantSlug,
    created_by: session.userId,
    notebook_id: notebookId,
    kind,
    title,
    source_url: sourceUrl ?? null,
    artifact_id: artifactId ?? null,
    status: "registered",
    retention_expires_at: retentionExpiresAt,
  });
  if (!stored.ok) return fail(stored.status === 404 ? "notebook_lineage_schema_missing" : "notebook_source_write_failed", stored.status === 404 ? 503 : 502);
  await recordClientAudit("tenant.notebook.source_registered", { sourceId: id, kind });
  return NextResponse.json({ ok: true, sourceId: id, status: "registered" }, { status: 201, headers: { "cache-control": "private, no-store" } });
}

export async function DELETE(request: Request) {
  const session = await member();
  if (!session) return fail("not_authenticated", 401);
  const rate = await checkClientRuntimeRateLimit("notebook-source-delete", 30, 900);
  if (!rate.ok) return fail("runtime_limit_unavailable", 503);
  if (!rate.allowed) return fail("runtime_rate_limited", 429);
  const sourceId = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  const errors = validateNotebookDeletionRequest({ contractVersion: "v96", tenantSlug: session.tenantSlug, sourceId, deleteDerivedArtifacts: true });
  if (errors.length) return NextResponse.json({ ok: false, error: "source_input_invalid", details: errors }, { status: 400 });
  const removed = await clientRpc("delete_client_notebook_source", { p_tenant_slug: session.tenantSlug, p_source_id: sourceId });
  if (!removed.ok || removed.value !== true) return fail(removed.status === 404 ? "notebook_lineage_schema_missing" : "notebook_source_delete_failed", removed.status === 404 ? 503 : 502);
  await recordClientAudit("tenant.notebook.source_deleted", { sourceId });
  return NextResponse.json({ ok: true, sourceId, deletedDerivedArtifacts: true }, { headers: { "cache-control": "private, no-store" } });
}

async function member() {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember()) || !clientCapabilityEnabled("tenant-data")) return null;
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  return tenantSlug ? { userId: user.id, tenantSlug } : null;
}

function publicSource(record: Record<string, unknown>) {
  return {
    id: typeof record.id === "string" ? record.id : "",
    notebookId: typeof record.notebook_id === "string" ? record.notebook_id : null,
    kind: typeof record.kind === "string" ? record.kind : "",
    title: typeof record.title === "string" ? record.title : "Untitled source",
    sourceUrl: typeof record.source_url === "string" ? record.source_url : null,
    artifactId: typeof record.artifact_id === "string" ? record.artifact_id : null,
    status: typeof record.status === "string" ? record.status : "registered",
    retentionExpiresAt: typeof record.retention_expires_at === "string" ? record.retention_expires_at : null,
  };
}

function fail(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, { status, headers: { "cache-control": "private, no-store" } });
}
