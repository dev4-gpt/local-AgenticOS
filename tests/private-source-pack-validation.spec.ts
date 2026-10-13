import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { parseClientSourcePack } from "../src/lib/clientSourcePack";
import { selectClientSourceBatches } from "../src/lib/clientSourceBatchSelection";

const manifestPath = process.env.AGENTOS_PRIVATE_SOURCE_PACK_MANIFEST;
if (!manifestPath) throw new Error("AGENTOS_PRIVATE_SOURCE_PACK_MANIFEST is required for this private data audit.");

test("private source-pack batches pass the production selector and parser", async () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const directory = path.dirname(manifestPath);
  const files = [
    new File([readFileSync(manifestPath)], path.basename(manifestPath)),
    ...manifest.batches.map((batch: { file: string }) => {
      const contents = readFileSync(path.resolve(directory, path.basename(batch.file)));
      return new File([contents], path.basename(batch.file));
    }),
  ];
  const selected = await selectClientSourceBatches(files);
  expect(selected.sourceCount).toBe(manifest.coverage.importedSourceSegments);
  expect(selected.linkCount).toBe(manifest.coverage.importedLinks);
  expect(selected.skippedCount).toBe(manifest.skipped);

  let sourceCount = 0;
  let linkCount = 0;
  let publicationDates = 0;
  for (const batch of selected.batches) {
    const pack = JSON.parse(await batch.file.text());
    const parsed = parseClientSourcePack(pack);
    sourceCount += parsed.sources.length;
    linkCount += parsed.linkCount;
    publicationDates += parsed.sources.filter((source) => source.publishedAt !== null).length;
  }
  expect(sourceCount).toBe(manifest.coverage.importedSourceSegments);
  expect(linkCount).toBe(manifest.coverage.importedLinks);
  expect(publicationDates).toBe(0);
});
