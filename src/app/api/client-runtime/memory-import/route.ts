import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, insertClientRecord, recordClientAudit, selectClientRecords } from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { safeClientFileName } from "@/lib/clientStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTENT_CHARS = 30_000;
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
  const result = await selectClientRecords("client_runtime_records", {
    tenant_slug: `eq.${tenantSlug}`,
    kind: "eq.memory",
    order: "created_at.asc",
    limit: "100",
  });
  if (!result.ok) return jsonError("memory_export_read_failed", 502);

  const content = memoryExportMarkdown(tenantSlug, result.records);
  await recordClientAudit("tenant.memory.exported", { recordCount: result.records.length });
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

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
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
  if (!artifact || artifact.status !== "ready" || artifact.original_name !== fileName || !isMarkdownContentType(artifact.content_type)) {
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
  return ["# Veloce Tenant Memory Export", "", `Tenant: ${tenantSlug}`, `Exported: ${new Date().toISOString()}`, "", ...sections].join("\n");
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "private, no-store" } });
}
