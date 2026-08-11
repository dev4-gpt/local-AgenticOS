import { expect, test } from "@playwright/test";
import {
  notebookSourceIdempotencyKey,
  validateNotebookAnswer,
  validateNotebookDeletionRequest,
  validateNotebookRetrievalRequest,
  validateNotebookSource,
} from "../src/lib/v96NotebookContracts";

const sourceId = "11111111-1111-4111-8111-111111111111";
const source = { contractVersion: "v96" as const, id: sourceId, tenantSlug: "veloce-cloud-test", kind: "web" as const, title: "Docs", sourceUrl: "https://example.com/docs", status: "registered" as const };

test("Notebook sources require tenant-owned bounded origins or artifacts", () => {
  expect(validateNotebookSource(source)).toEqual([]);
  expect(validateNotebookSource({ ...source, sourceUrl: "http://127.0.0.1" })).toContain("source URL must be a public HTTPS URL");
  expect(validateNotebookSource({ ...source, sourceUrl: undefined, artifactId: undefined })).toContain("source requires a URL or tenant artifact");
  expect(validateNotebookSource({ ...source, sourceUrl: "https://example.com", artifactId: sourceId })).toContain("source cannot contain both URL and artifact");
});

test("Notebook retrieval and answers cannot widen the explicit source scope", () => {
  const request = { contractVersion: "v96" as const, tenantSlug: "veloce-cloud-test", sourceIds: [sourceId], query: "What matters?", maxChunks: 4, maxAnswerChars: 1000 };
  expect(validateNotebookRetrievalRequest(request)).toEqual([]);
  const answer = { contractVersion: "v96" as const, tenantSlug: request.tenantSlug, query: request.query, answer: "A bounded answer.", retrievalScope: "explicit-sources" as const, citations: [{ sourceId, chunkId: "chunk-1", quote: "A bounded claim.", relevance: 0.9 }] };
  expect(validateNotebookAnswer(answer, request)).toEqual([]);
  expect(validateNotebookAnswer({ ...answer, citations: [{ ...answer.citations[0], sourceId: "22222222-2222-4222-8222-222222222222" }] }, request)).toContain("citation is outside the explicit source scope");
  expect(validateNotebookAnswer({ ...answer, tenantSlug: "other-tenant" }, request)).toContain("answer crossed tenant scope");
});

test("Notebook source identity is deterministic and deletion is explicit", () => {
  expect(notebookSourceIdempotencyKey({ tenantSlug: "veloce-cloud-test", kind: "web", sourceUrl: "https://example.com/docs" })).toBe(notebookSourceIdempotencyKey({ tenantSlug: "veloce-cloud-test", kind: "web", sourceUrl: "https://example.com/docs" }));
  expect(notebookSourceIdempotencyKey({ tenantSlug: "other-tenant", kind: "web", sourceUrl: "https://example.com/docs" })).not.toBe(notebookSourceIdempotencyKey({ tenantSlug: "veloce-cloud-test", kind: "web", sourceUrl: "https://example.com/docs" }));
  expect(validateNotebookDeletionRequest({ contractVersion: "v96", tenantSlug: "veloce-cloud-test", sourceId, deleteDerivedArtifacts: true })).toEqual([]);
  expect(validateNotebookDeletionRequest({ contractVersion: "v96", tenantSlug: "veloce-cloud-test", sourceId, deleteDerivedArtifacts: false })).toContain("deletion must include derived artifacts");
});
