import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { buildPrivateSourcePackGraph } from "../scripts/export-private-source-pack-graph.mjs";

const batchText = JSON.stringify({ sources: [{ title: "Lesson", text: "Private lesson text", url: "https://example.com/lesson", tab: "lesson-1", links: [{ url: "https://example.com/tool", text: "Tool" }] }] });
const batchSha = createHash("sha256").update(batchText).digest("hex");
const manifest = {
  startUrl: "https://example.com/course",
  batches: [{ file: "batch.json", sha256: batchSha }],
  coverage: { importedSourceSegments: 1, importedLinks: 1, completeCommunityExport: false, discoveredQueueExhausted: false },
};

test("private source graph export preserves text, links, and incomplete provenance", () => {
  const graph = buildPrivateSourcePackGraph(manifest, () => batchText, "/private");
  expect(graph["@graph"].find((node) => node["@type"] === "LearningResource")).toMatchObject({ name: "Lesson", text: "Private lesson text" });
  expect(graph.edges.map((edge) => edge["@type"])).toEqual(["source_at", "links_to"]);
  expect(graph.provenance).toMatchObject({ complete: false, videoAssetsIncluded: false, sourceSegments: 1, links: 1 });
});

test("private source graph export rejects altered source batches", () => {
  expect(() => buildPrivateSourcePackGraph({ ...manifest, batches: [{ file: "batch.json", sha256: "2".repeat(64) }] }, () => batchText, "/private")).toThrow("source_batch_hash_mismatch");
});

test("private source graph export rejects batch paths outside the project root", () => {
  expect(() => buildPrivateSourcePackGraph({ ...manifest, batches: [{ file: "../outside.json", sha256: batchSha }] }, () => batchText, "/private")).toThrow("source_batch_path_invalid");
});

test("private source graph export supports classroom coverage and preserves dates", () => {
  const datedBatchText = JSON.stringify({ sources: [{
    title: "Dated lesson",
    text: "Captured lesson text",
    url: "https://example.com/dated-lesson",
    tab: "dated-lesson",
    publishedAt: "2026-05-11",
    collectedAt: "2026-10-14T03:00:00.000Z",
    links: [{ url: "https://example.com/resource", text: "Resource" }],
  }] });
  const classroomManifest = {
    startUrl: "https://example.com/classroom",
    batches: [{ file: "batch.json", sha256: createHash("sha256").update(datedBatchText).digest("hex") }],
    coverage: { outputSources: 1, outputLinks: 1, publicationDates: 1, pendingPages: 1, discoveredQueueExhausted: false },
  };

  const graph = buildPrivateSourcePackGraph(classroomManifest, () => datedBatchText, "/private");
  expect(graph["@graph"].find((node) => node["@type"] === "LearningResource")).toMatchObject({
    datePublished: "2026-05-11",
    dateCreated: "2026-10-14T03:00:00.000Z",
  });
  expect(graph.provenance).toMatchObject({ complete: false, sourceSegments: 1, links: 1 });
});
