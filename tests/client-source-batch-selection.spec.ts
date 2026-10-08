import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { selectClientSourceBatches } from "../src/lib/clientSourceBatchSelection";

function exportFixture() {
  const startUrl = "https://example.org/course";
  const parts = [1, 2].map((number) => {
    const name = `course.part-${String(number).padStart(3, "0")}.json`;
    const pack = { startUrl, skipped: number === 1 ? [{ section: "One", label: "Raw HTML", reason: "html_not_imported" }] : [], sources: [{ title: `Lesson ${number}`, url: `${startUrl}/${number}`, text: "Lesson text", links: [{ url: `${startUrl}/link-${number}`, text: "Link" }] }] };
    const contents = JSON.stringify(pack, null, 2);
    return { file: new File([contents], name, { type: "application/json" }), sha256: createHash("sha256").update(contents).digest("hex") };
  });
  const manifest = new File([JSON.stringify({ version: 1, startUrl, sources: 2, links: 2, skipped: 1, batches: parts.map((part) => ({ file: `/private/tmp/${part.file.name}`, sha256: part.sha256, sources: 1, links: 1 })) })], "course.manifest.json", { type: "application/json" });
  return { parts, manifest };
}

test("numbered source parts are ordered and verified against the complete manifest", async () => {
  const { parts, manifest } = exportFixture();
  const selected = await selectClientSourceBatches([parts[1].file, manifest, parts[0].file]);
  expect(selected.batches.map((batch) => batch.file.name)).toEqual(["course.part-001.json", "course.part-002.json"]);
  expect(selected.batches.map((batch) => batch.sha256)).toEqual(parts.map((part) => part.sha256));
  expect(selected).toMatchObject({ sourceCount: 2, linkCount: 2, skippedCount: 1 });
});

test("a missing or altered source part cannot be reviewed as a complete export", async () => {
  const { parts, manifest } = exportFixture();
  await expect(selectClientSourceBatches([parts[0].file, manifest])).rejects.toThrow("source_batch_manifest_invalid");
  const altered = new File(["{}"], parts[1].file.name, { type: "application/json" });
  await expect(selectClientSourceBatches([parts[0].file, altered, manifest])).rejects.toThrow("source_batch_manifest_mismatch");
  await expect(selectClientSourceBatches(parts.map((part) => part.file))).rejects.toThrow("source_batch_manifest_required");
  await expect(selectClientSourceBatches([parts[0].file])).rejects.toThrow("source_batch_manifest_required");
});

test("separate parts cannot silently overwrite the same source identity", async () => {
  const startUrl = "https://example.org/course";
  const files = [1, 2].map((number) => {
    const name = `course.part-${String(number).padStart(3, "0")}.json`;
    const contents = JSON.stringify({ startUrl, skipped: [], sources: [{ title: `Lesson ${number}`, url: `${startUrl}/shared#part-${number}`, tab: "Shared", text: `Text ${number}`, links: [] }] });
    return { file: new File([contents], name, { type: "application/json" }), sha256: createHash("sha256").update(contents).digest("hex") };
  });
  const manifest = new File([JSON.stringify({ version: 1, startUrl, sources: 2, links: 0, skipped: 0, batches: files.map(({ file, sha256 }) => ({ file: file.name, sha256, sources: 1, links: 0 })) })], "course.manifest.json", { type: "application/json" });
  await expect(selectClientSourceBatches([manifest, ...files.map(({ file }) => file)])).rejects.toThrow("source_batch_duplicate_source");
});

test("one ordinary JSON pack can still be selected without a manifest", async () => {
  const file = new File([JSON.stringify({ startUrl: "https://example.org/course", sources: [{ title: "Lesson", url: "https://example.org/course/one", text: "Lesson text", links: [] }] })], "one-course-pack.json", { type: "application/json" });
  const selected = await selectClientSourceBatches([file]);
  expect(selected).toEqual({ batches: [{ file, sha256: null }], sourceCount: 1, linkCount: 0, skippedCount: 0 });
});

test("all parts are content-validated before the first upload can begin", async () => {
  const { parts } = exportFixture();
  const startUrl = "https://example.org/course";
  const invalidContents = JSON.stringify({ startUrl, skipped: [], sources: [{ title: "Lesson 2", url: `${startUrl}/2`, text: "Lesson text", links: [{ url: "https://example.org/download?X-Amz-Signature=secret", text: "Download" }] }] });
  const invalidPart = new File([invalidContents], parts[1].file.name, { type: "application/json" });
  const manifest = new File([JSON.stringify({ version: 1, startUrl, sources: 2, links: 2, skipped: 1, batches: [{ file: parts[0].file.name, sha256: parts[0].sha256, sources: 1, links: 1 }, { file: invalidPart.name, sha256: createHash("sha256").update(invalidContents).digest("hex"), sources: 1, links: 1 }] })], "course.manifest.json", { type: "application/json" });
  await expect(selectClientSourceBatches([parts[0].file, invalidPart, manifest])).rejects.toThrow("source_batch_content_invalid");
});

test("the converter's real multi-part output passes browser manifest selection", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agentos-source-batches-"));
  try {
    const input = path.join(dir, "course.md");
    const output = path.join(dir, "course.json");
    writeFileSync(input, Array.from({ length: 105 }, (_, index) => `## Lesson ${index}\nRead [resource ${index}](https://example.org/${index}).`).join("\n"));
    execFileSync(process.execPath, ["scripts/prepare-markdown-source-pack.mjs", input, "https://example.org/course", output], { cwd: process.cwd(), stdio: "pipe" });
    const files = readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => new File([readFileSync(path.join(dir, name))], name, { type: "application/json" }));
    const selected = await selectClientSourceBatches(files.reverse());
    expect(selected.batches.map((batch) => batch.file.name)).toEqual(["course.part-001.json", "course.part-002.json"]);
    expect(selected).toMatchObject({ sourceCount: 105, linkCount: 105, skippedCount: 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
