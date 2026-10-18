import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, countClientRecords, insertClientRecord, recordClientAudit, selectClientRecords } from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { clientRetentionSecondsRemaining } from "@/lib/clientRetention";
import { safeClientFileName } from "@/lib/clientStorage";
import { readBoundedJsonObject } from "@/lib/clientNetworkSafety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTENT_CHARS = 30_000;
const MAX_IMPORT_REQUEST_BYTES = 128 * 1024;
const EXPORT_PAGE_SIZE = 100;
const MAX_EXPORT_RECORDS = 1000;
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "txt"]);
// The Notebook research tab imports through this same verified path, so the
// destination record kind is a parameter. Export below stays memory-only.
const IMPORT_KINDS = new Set(["memory", "notebook"]);

export async function GET(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);
  if (!clientCapabilityEnabled("tenant-data")) return jsonError("capability_not_enabled", 403);
  if (new URL(request.url).searchParams.get("format") !== "markdown") return jsonError("memory_export_format_invalid", 400);
  const rateLimit = await checkClientRuntimeRateLimit("memory-exports", 10, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);

  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug) return jsonError("tenant_not_configured", 503);
  const retention = await clientRpc("client_tenant_retention_days", { p_tenant_slug: tenantSlug });
  const retentionDays = Number(retention.value);
  if (!retention.ok || !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 28) {
    return jsonError("memory_export_retention_unavailable", 503);
  }
  const snapshot = new Date();
  const snapshotAt = snapshot.toISOString();
  const activeCutoff = new Date(snapshot.getTime() - retentionDays * 86_400_000).toISOString();
  const filters = {
    tenant_slug: `eq.${tenantSlug}`,
    kind: "eq.memory",
    and: `(created_at.gt.${activeCutoff},created_at.lte.${snapshotAt})`,
  };
  const count = await countClientRecords("client_runtime_records", filters);
  if (!count.ok || count.count === null) return jsonError("memory_export_read_failed", 502);
  if (count.count > MAX_EXPORT_RECORDS) return jsonError("memory_export_too_large", 413);

  const records: Record<string, unknown>[] = [];
  let afterId: string | null = null;
  while (records.length < count.count) {
    const result = await selectClientRecords("client_runtime_records", {
      ...filters,
      order: "id.asc",
      limit: String(EXPORT_PAGE_SIZE),
      ...(afterId ? { id: `gt.${afterId}` } : {}),
    });
    if (!result.ok) return jsonError("memory_export_read_failed", 502);
    if (!result.records.length || records.length + result.records.length > count.count) return jsonError("memory_export_changed_retry", 409);
    const lastId = result.records.at(-1)?.id;
    if (typeof lastId !== "string" || !/^[0-9a-f-]{36}$/i.test(lastId) || lastId === afterId) return jsonError("memory_export_read_failed", 502);
    records.push(...result.records);
    afterId = lastId;
  }

  const finalCount = await countClientRecords("client_runtime_records", filters);
  if (!finalCount.ok || finalCount.count === null) return jsonError("memory_export_read_failed", 502);
  if (finalCount.count !== count.count) return jsonError("memory_export_changed_retry", 409);

  const completedAt = Date.now();
  const completedCutoff = completedAt - retentionDays * 86_400_000;
  if (records.some((record) => typeof record.created_at !== "string"
    || !Number.isFinite(Date.parse(record.created_at)) || Date.parse(record.created_at) <= completedCutoff)) {
    return jsonError("memory_export_changed_retry", 409);
  }

  records.sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")) || String(left.id ?? "").localeCompare(String(right.id ?? "")));
  const content = memoryExportMarkdown(tenantSlug, records);
  await recordClientAudit("tenant.memory.exported", { recordCount: records.length });
  return new Response(content, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${safeExportName(tenantSlug)}"`,
      "content-type": "text/markdown; charset=utf-8",
    },
  });
}

export async function POST(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);
  if (!clientCapabilityEnabled("tenant-data") || !clientCapabilityEnabled("artifacts")) return jsonError("capability_not_enabled", 403);
  const rateLimit = await checkClientRuntimeRateLimit("memory-imports", 10, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);

  const parsed = await readBoundedJsonObject(request, MAX_IMPORT_REQUEST_BYTES);
  if (!parsed.ok) return jsonError(parsed.reason === "too_large" ? "memory_import_request_too_large" : "memory_import_input_invalid", parsed.reason === "too_large" ? 413 : 400);
  const body = parsed.value;
  const fileName = typeof body.fileName === "string" ? safeClientFileName(body.fileName) : null;
  const content = typeof body.content === "string" ? body.content.replace(/\r\n?/g, "\n").trim() : "";
  const artifactId = typeof body.artifactId === "string" ? body.artifactId.trim() : "";
  const kind = typeof body.kind === "string" ? body.kind.trim().toLowerCase() : "memory";
  const notebookId = typeof body.notebookId === "string" && isUuid(body.notebookId.trim()) ? body.notebookId.trim() : null;
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  if (!tenantSlug || !fileName || !isMarkdownFile(fileName) || !content || content.length > MAX_CONTENT_CHARS || !isUuid(artifactId) || !IMPORT_KINDS.has(kind) || containsClientSecretLike(fileName, content)) {
    return jsonError("memory_import_input_invalid", 400);
  }

  const artifactResult = await selectClientRecords("client_runtime_artifacts", {
    id: `eq.${artifactId}`,
    tenant_slug: `eq.${tenantSlug}`,
    limit: "1",
  });
  const artifact = artifactResult.records[0];
  if (!artifactResult.ok) return jsonError("memory_import_artifact_lookup_failed", 502);
  if (!artifact || artifact.tenant_slug !== tenantSlug || artifact.created_by !== user.id || artifact.status !== "ready" || clientRetentionSecondsRemaining(artifact) < 1 || artifact.original_name !== fileName || !isMarkdownContentType(artifact.content_type)) {
    return jsonError("memory_import_source_not_verified", 409);
  }

  const stored = await insertClientRecord("client_runtime_records", {
    id: randomUUID(),
    tenant_slug: tenantSlug,
    created_by: user.id,
    kind,
    // Only notebook imports file into a notebook; a memory import never does.
    notebook_id: kind === "notebook" ? notebookId : null,
    title: titleFromFileName(fileName),
    content,
    metadata: {
      source: "markdown_import",
      original_name: fileName,
      artifact_id: artifactId,
      content_sha256: createHash("sha256").update(content).digest("hex"),
      imported_at: new Date().toISOString(),
    },
  });
  if (!stored.ok) return jsonError("memory_import_write_failed", 502);
  await recordClientAudit("tenant.memory.imported", { fileName, artifactId, kind });
  return NextResponse.json({ ok: true }, { status: 201, headers: { "cache-control": "private, no-store" } });
}

function isMarkdownFile(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MARKDOWN_EXTENSIONS.has(extension);
}

function isMarkdownContentType(value: unknown) {
  return value === "text/markdown" || value === "text/plain";
}

function isUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function titleFromFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.(?:md|markdown|txt)$/i, "").replace(/[-_]+/g, " ").trim();
  return (withoutExtension || "Imported memory").slice(0, 240);
}

function safeExportName(tenantSlug: string) {
  return `${tenantSlug.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100) || "veloce"}-memory.md`;
}

function memoryExportMarkdown(tenantSlug: string, records: Record<string, unknown>[]) {
  const sections = records.map((record) => {
    const title = typeof record.title === "string" ? record.title : "Untitled memory";
    const content = typeof record.content === "string" ? record.content : "";
    const createdAt = typeof record.created_at === "string" ? record.created_at : "";
    const status = typeof record.status === "string" ? record.status : "active";
    return [`## ${title}`, "", `- Status: ${status}`, ...(createdAt ? [`- Created: ${createdAt}`] : []), "", content.trim()].join("\n");
  });
  return ["# Veloce Tenant Memory Export", "", `Tenant: ${tenantSlug}`, `Records: ${records.length}`, `Exported: ${new Date().toISOString()}`, "", ...sections].join("\n");
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "private, no-store" } });
}
