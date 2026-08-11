import { createHash } from "node:crypto";
import { CAPABILITY_CONTRACT_VERSION, isValidCapabilityTenantSlug } from "@/lib/capabilityContracts";
import { isAllowedV96ResearchUrl } from "@/lib/v96Contracts";

export type NotebookSourceKind = "pdf" | "web" | "audio" | "repository";
export type NotebookSourceStatus = "registered" | "extracting" | "ready" | "failed" | "deleted";

export interface V96NotebookSource {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  id: string;
  tenantSlug: string;
  notebookId?: string;
  kind: NotebookSourceKind;
  title: string;
  sourceUrl?: string;
  artifactId?: string;
  sourceHash?: string;
  status: NotebookSourceStatus;
  retentionExpiresAt?: string;
  deletedAt?: string;
}

export interface V96NotebookRetrievalRequest {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tenantSlug: string;
  sourceIds: readonly string[];
  query: string;
  maxChunks: number;
  maxAnswerChars: number;
}

export interface V96NotebookCitation {
  sourceId: string;
  chunkId: string;
  quote: string;
  relevance: number;
}

export interface V96NotebookAnswer {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tenantSlug: string;
  query: string;
  answer: string;
  citations: readonly V96NotebookCitation[];
  sourceIds: readonly string[];
  retrievalScope: "explicit-sources";
}

export interface V96NotebookDeletionRequest {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tenantSlug: string;
  sourceId: string;
  deleteDerivedArtifacts: true;
}

export function notebookSourceIdempotencyKey(input: { tenantSlug: string; kind: NotebookSourceKind; sourceUrl?: string; artifactId?: string }) {
  return createHash("sha256")
    .update([CAPABILITY_CONTRACT_VERSION, input.tenantSlug, input.kind, input.sourceUrl ?? "", input.artifactId ?? ""].join("\n"))
    .digest("hex");
}

export function validateNotebookSource(input: Partial<V96NotebookSource>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.id || !/^[0-9a-f-]{36}$/i.test(input.id)) errors.push("source id is invalid");
  if (!input.kind || !(["pdf", "web", "audio", "repository"] as string[]).includes(input.kind)) errors.push("source kind is invalid");
  if (!input.title?.trim() || input.title.length > 240) errors.push("source title must contain 1 to 240 characters");
  if (input.sourceUrl !== undefined && !isAllowedV96ResearchUrl(input.sourceUrl)) errors.push("source URL must be a public HTTPS URL");
  if (input.artifactId !== undefined && !/^[0-9a-f-]{36}$/i.test(input.artifactId)) errors.push("artifact id is invalid");
  if (!input.sourceUrl && !input.artifactId) errors.push("source requires a URL or tenant artifact");
  if (input.sourceUrl && input.artifactId) errors.push("source cannot contain both URL and artifact");
  if (input.sourceHash !== undefined && !/^[0-9a-f]{64}$/i.test(input.sourceHash)) errors.push("source hash is invalid");
  if (input.retentionExpiresAt !== undefined && Number.isNaN(Date.parse(input.retentionExpiresAt))) errors.push("retention expiry is invalid");
  return errors;
}

export function validateNotebookRetrievalRequest(input: Partial<V96NotebookRetrievalRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!Array.isArray(input.sourceIds) || input.sourceIds.length < 1 || input.sourceIds.length > 20 || input.sourceIds.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) errors.push("sourceIds must contain 1 to 20 UUIDs");
  if (!input.query?.trim() || input.query.length > 4000) errors.push("query must contain 1 to 4000 characters");
  if (!Number.isInteger(input.maxChunks) || (input.maxChunks ?? 0) < 1 || (input.maxChunks ?? 0) > 40) errors.push("maxChunks must be between 1 and 40");
  if (!Number.isInteger(input.maxAnswerChars) || (input.maxAnswerChars ?? 0) < 100 || (input.maxAnswerChars ?? 0) > 20_000) errors.push("maxAnswerChars must be between 100 and 20000");
  return errors;
}

export function validateNotebookAnswer(input: Partial<V96NotebookAnswer>, request: V96NotebookRetrievalRequest) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (input.tenantSlug !== request.tenantSlug) errors.push("answer crossed tenant scope");
  if (input.retrievalScope !== "explicit-sources") errors.push("answer retrieval scope is invalid");
  if (!input.answer?.trim() || input.answer.length > request.maxAnswerChars) errors.push("answer is outside its bound");
  const allowed = new Set(request.sourceIds);
  if (!Array.isArray(input.citations) || input.citations.length < 1 || input.citations.length > request.maxChunks) errors.push("answer must contain bounded citations");
  for (const citation of input.citations ?? []) {
    if (!allowed.has(citation.sourceId)) errors.push("citation is outside the explicit source scope");
    if (!citation.chunkId?.trim() || !citation.quote?.trim()) errors.push("citation evidence is incomplete");
    if (typeof citation.relevance !== "number" || citation.relevance < 0 || citation.relevance > 1) errors.push("citation relevance is invalid");
  }
  return errors;
}

export function validateNotebookDeletionRequest(input: Partial<V96NotebookDeletionRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.sourceId || !/^[0-9a-f-]{36}$/i.test(input.sourceId)) errors.push("sourceId is invalid");
  if (input.deleteDerivedArtifacts !== true) errors.push("deletion must include derived artifacts");
  return errors;
}
