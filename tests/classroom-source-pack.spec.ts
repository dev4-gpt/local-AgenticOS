import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { prepareClassroomSourcePack } from "../scripts/prepare-classroom-source-pack.mjs";
import { isClassroomUrlInScope } from "../src/lib/classroomResearch";
import { selectClientSourceBatches } from "../src/lib/clientSourceBatchSelection";
import { parseClientSourcePack } from "../src/lib/clientSourcePack";

const startUrl = "https://www.skool.com/approved-course/classroom";

function source(index: number) {
  return {
    id: `S${index + 1}`,
    title: `Lesson ${index + 1}`,
    url: `${startUrl}?md=${index + 1}`,
    text: `Lesson ${index + 1} text`,
    collectedAt: "2026-10-02T00:00:00.000Z",
    links: [{ url: `https://video.example.org/watch/${index + 1}`, text: "Video" }],
  };
}

test("classroom conversion preserves links and splits at importer limits", async () => {
  const sources = Array.from({ length: 105 }, (_, index) => source(index));
  sources[0].text = `${"A".repeat(29_999)}😀${"B".repeat(8_000)}`;
  sources[0].links = Array.from({ length: 205 }, (_, index) => ({ url: `https://video.example.org/watch/${index + 1}`, text: "Video" }));
  const prepared = prepareClassroomSourcePack({ startUrl, sources, skipped: [], pending: ["https://www.skool.com/approved-course/classroom?page=2"] });
  expect(prepared.coverage.inputSources).toBe(105);
  expect(prepared.coverage.inputLinks).toBe(309);
  expect(prepared.coverage.outputLinks).toBe(309);
  expect(prepared.coverage.discoveredQueueExhausted).toBe(false);
  expect(prepared.batches[0].skipped).toContain("1 discovered pages remain uncollected");
  expect(prepared.batches.length).toBeGreaterThan(1);
  const parsed = prepared.batches.map((batch) => parseClientSourcePack(batch));
  expect(parsed.every((batch) => batch.sources.length <= 100)).toBe(true);
  expect(parsed.reduce((sum, batch) => sum + batch.linkCount, 0)).toBe(309);
  const first = parsed.flatMap((batch) => batch.sources).filter((item) => item.sourceUrl === `${startUrl}?md=1`);
  expect(first).toHaveLength(3);
  expect(first[0].text + first[1].text).toBe(sources[0].text);
  expect(first[1].text.startsWith("😀")).toBe(true);
  const parts = prepared.batches.map((batch, index) => {
    const name = `pack.part-${String(index + 1).padStart(3, "0")}.json`;
    const bytes = JSON.stringify(batch, null, 2);
    return { file: new File([bytes], name), sha256: createHash("sha256").update(bytes).digest("hex"), sources: batch.sources.length, links: batch.sources.reduce((sum, item) => sum + item.links.length, 0) };
  });
  const manifest = {
    version: 1, startUrl,
    sources: prepared.coverage.outputSources,
    links: prepared.coverage.outputLinks,
    skipped: prepared.batches.reduce((sum, batch) => sum + batch.skipped.length, 0),
    batches: parts.map(({ file, sha256, sources, links }) => ({ file: file.name, sha256, sources, links })),
  };
  const selection = await selectClientSourceBatches([new File([JSON.stringify(manifest)], "pack.manifest.json"), ...parts.map((part) => part.file)]);
  expect(selection.batches).toHaveLength(prepared.batches.length);
  expect(selection.sourceCount).toBe(prepared.coverage.outputSources);
  expect(selection.linkCount).toBe(prepared.coverage.outputLinks);
  expect(selection.skippedCount).toBe(1);
});

test("classroom scope requires an actual path boundary", () => {
  const origin = "https://www.skool.com";
  expect(isClassroomUrlInScope("https://www.skool.com/approved-course/classroom?md=1", origin, "/approved-course")).toBe(true);
  expect(isClassroomUrlInScope("https://www.skool.com/approved-course-evil/classroom", origin, "/approved-course")).toBe(false);
  expect(isClassroomUrlInScope("https://evil.example/approved-course/classroom", origin, "/approved-course")).toBe(false);
});

test("classroom conversion refuses duplicate source identities", () => {
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [source(0), source(0)], skipped: [], pending: [] })).toThrow("classroom_source_invalid");
});

test("classroom export writes selectable private hashed batches and refuses overwrite", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "classroom-pack-"));
  try {
    const input = path.join(directory, "run.json");
    const output = path.join(directory, "pack.json");
    writeFileSync(input, JSON.stringify({ startUrl, sources: [source(0)], skipped: [], pending: [] }), { mode: 0o600 });
    const command = [path.join(process.cwd(), "scripts/prepare-classroom-source-pack.mjs"), input, output];
    const first = spawnSync(process.execPath, command, { cwd: process.cwd(), encoding: "utf8" });
    expect(first.status).toBe(0);
    const manifest = JSON.parse(readFileSync(path.join(directory, "pack.manifest.json"), "utf8"));
    const batch = manifest.batches[0];
    const bytes = readFileSync(batch.file);
    expect(path.basename(batch.file)).toBe("pack.part-001.json");
    expect(batch.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(parseClientSourcePack(JSON.parse(bytes.toString("utf8"))).linkCount).toBe(1);
    const selection = await selectClientSourceBatches([
      new File([readFileSync(path.join(directory, "pack.manifest.json"))], "pack.manifest.json"),
      new File([bytes], "pack.part-001.json"),
    ]);
    expect(selection.sourceCount).toBe(1);
    expect(selection.linkCount).toBe(1);
    expect(selection.skippedCount).toBe(0);
    expect(statSync(batch.file).mode & 0o777).toBe(0o600);
    expect(statSync(path.join(directory, "pack.manifest.json")).mode & 0o777).toBe(0o600);
    const second = spawnSync(process.execPath, command, { cwd: process.cwd(), encoding: "utf8" });
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain("classroom_output_exists");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
