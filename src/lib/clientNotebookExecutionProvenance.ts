import { createHash } from "node:crypto";
import { NOTEBOOK_STUDIO_OUTPUTS, notebookSourceLinks, notebookStudioGoal, safeNotebookSourceUrl, type NotebookSource, type NotebookStudioOutput } from "@/lib/clientNotebookLanes";

export function notebookSourceMetadataSha256(input: { id: string; title: string; sourceUrl: string | null; links: NonNullable<NotebookSource["links"]>; recordCreatedAt: string | null }) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function buildNotebookExecutionGoal(input: {
  output: unknown;
  instruction: unknown;
  sourceIds: unknown[];
  sourceReferences: unknown[];
  records: unknown[];
}): { ok: true; goal: string } | { ok: false; error: "notebook_source_reference_invalid" | "notebook_source_unavailable" | "notebook_source_changed" } {
  if (input.sourceIds.length < 1 || input.sourceIds.length > 5 || input.records.length !== input.sourceIds.length
    || input.sourceReferences.length !== input.sourceIds.length || typeof input.output !== "string"
    || !NOTEBOOK_STUDIO_OUTPUTS.some((item) => item.key === input.output)
    || input.sourceIds.some((id) => typeof id !== "string")
    || new Set(input.sourceIds).size !== input.sourceIds.length) return { ok: false, error: "notebook_source_reference_invalid" };

  const references = new Map<string, Record<string, unknown>>();
  for (const value of input.sourceReferences) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "notebook_source_reference_invalid" };
    const reference = value as Record<string, unknown>;
    if (typeof reference.id !== "string" || references.has(reference.id) || typeof reference.contentSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(reference.contentSha256)) return { ok: false, error: "notebook_source_reference_invalid" };
    references.set(reference.id, reference);
  }
  const records = new Map<string, Record<string, unknown>>();
  for (const value of input.records) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "notebook_source_unavailable" };
    const record = value as Record<string, unknown>;
    if (typeof record.id !== "string" || records.has(record.id)) return { ok: false, error: "notebook_source_unavailable" };
    records.set(record.id, record);
  }

  const sources: NotebookSource[] = [];
  for (const id of input.sourceIds as string[]) {
    const record = records.get(id);
    const reference = references.get(id);
    const content = typeof record?.content === "string" ? record.content : "";
    if (!record || !reference || !content) return { ok: false, error: "notebook_source_unavailable" };
    if (createHash("sha256").update(content).digest("hex") !== String(reference.contentSha256).toLowerCase()) return { ok: false, error: "notebook_source_changed" };
    const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) ? record.metadata as Record<string, unknown> : {};
    const source: NotebookSource = {
      id,
      title: typeof record.title === "string" ? record.title : "Untitled source",
      content,
      sourceUrl: safeNotebookSourceUrl(metadata.source_url),
      links: notebookSourceLinks(metadata.source_links),
    };
    const recordCreatedAt = typeof record.createdAt === "string" ? record.createdAt : null;
    const sourceMetadataSha256 = notebookSourceMetadataSha256({ id, title: source.title, sourceUrl: source.sourceUrl ?? null, links: source.links ?? [], recordCreatedAt });
    if (typeof reference.sourceMetadataSha256 !== "string" || sourceMetadataSha256 !== reference.sourceMetadataSha256.toLowerCase()) return { ok: false, error: "notebook_source_changed" };
    sources.push(source);
  }

  return { ok: true, goal: notebookStudioGoal({ output: input.output as NotebookStudioOutput, instruction: typeof input.instruction === "string" ? input.instruction : "", sources }) };
}

export function auditNotebookDraftCitations(output: string, sourceReferences: unknown[]): { ok: true; citedSourceIds: string[] } | { ok: false; reason: "citation_missing" | "citation_unknown_source" | "source_register_missing" } {
  const allowed = new Set(sourceReferences.flatMap((reference) => {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) return [];
    const id = (reference as Record<string, unknown>).id;
    return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? [id.toLowerCase()] : [];
  }));
  const tokens = [...output.matchAll(/\[source:([^\]\r\n]+)\]/gi)].map((match) => match[1].trim().toLowerCase());
  if (!tokens.length) return { ok: false, reason: "citation_missing" };
  if (tokens.some((id) => !allowed.has(id))) return { ok: false, reason: "citation_unknown_source" };
  if (!/source register/i.test(output)) return { ok: false, reason: "source_register_missing" };
  return { ok: true, citedSourceIds: [...new Set(tokens)] };
}
