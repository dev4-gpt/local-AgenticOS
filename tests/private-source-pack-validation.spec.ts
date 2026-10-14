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
  const expectedSources = manifest.coverage.importedSourceSegments ?? manifest.coverage.outputSources;
  const expectedLinks = manifest.coverage.importedLinks ?? manifest.coverage.outputLinks;
  const expectedPublicationDates = manifest.coverage.publicationDates ?? 0;
  expect(Number.isSafeInteger(expectedSources)).toBe(true);
  expect(Number.isSafeInteger(expectedLinks)).toBe(true);
  expect(Number.isSafeInteger(expectedPublicationDates)).toBe(true);
  expect(selected.sourceCount).toBe(expectedSources);
  expect(selected.linkCount).toBe(expectedLinks);
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
  expect(sourceCount).toBe(expectedSources);
  expect(linkCount).toBe(expectedLinks);
  expect(publicationDates).toBe(expectedPublicationDates);
});
