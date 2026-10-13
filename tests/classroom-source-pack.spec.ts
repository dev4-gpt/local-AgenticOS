import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertCompleteClassroomCoverage, prepareClassroomSourcePack } from "../scripts/prepare-classroom-source-pack.mjs";
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
  sources[0].publishedAt = "2026-05-01";
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
  expect(first.map((item) => item.publishedAt)).toEqual(Array(3).fill("2026-05-01"));
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
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [source(0), { ...source(0), id: "S2" }], skipped: [], pending: [] })).toThrow("classroom_source_duplicate_page");
});

test("owner-provided sources without IDs get stable identities across export order", () => {
  const lessons = [1, 2].map((number) => ({
    title: `Lesson ${number}`,
    url: `${startUrl}?md=${number}`,
    tab: "Classroom",
    text: `Lesson ${number} text`,
    links: [],
  }));
  const tabs = (sources: typeof lessons) => prepareClassroomSourcePack({ startUrl, sources, pending: [] })
    .batches.flatMap((batch) => batch.sources.map((item) => [item.url, item.tab]));
  expect(new Map(tabs(lessons))).toEqual(new Map(tabs([...lessons].reverse())));
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [lessons[0], lessons[0]], pending: [] }))
    .toThrow("classroom_source_invalid");
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [{ ...lessons[0], id: null }], pending: [] }))
    .toThrow("classroom_source_invalid");
});

test("classroom conversion retains transcript text and playable media references", () => {
  const lesson = {
    ...source(0),
    tab: "Classroom".repeat(40),
    text: "Transcript:\nThe agent should ask permission before using customer data.",
    links: [
      { url: "https://video.example.org/watch/1#chapter-2", text: "Media: Lesson playback" },
      { url: "https://docs.example.org/lesson-1", text: "Starter code" },
    ],
  };
  const prepared = prepareClassroomSourcePack({ startUrl, sources: [lesson], skipped: [], pending: [] });
  const parsed = parseClientSourcePack(prepared.batches[0]);
  expect(prepared.coverage.mediaReferences).toBe(1);
  expect(prepared.coverage.discoveredQueueExhausted).toBe(true);
  expect(parsed.sources[0].text).toBe(lesson.text);
  expect(parsed.sources[0].tab?.length).toBeLessThanOrEqual(240);
  expect(parsed.sources[0].links).toEqual([
    { url: "https://video.example.org/watch/1", text: "Media: Lesson playback" },
    { url: "https://docs.example.org/lesson-1", text: "Starter code" },
  ]);
});

test("owner export preserves structured media and flags video-only lessons", () => {
  const lesson = {
    title: "Video-only lesson",
    url: `${startUrl}?md=video-only`,
    media: [{ kind: "video", title: "Lesson playback", url: "https://video.example.org/watch/2#chapter" }],
    video_page_links: ["https://video.example.org/watch/3"],
  };
  const prepared = prepareClassroomSourcePack({ startUrl, sources: [lesson], skipped: [], pending: [] });
  const parsed = parseClientSourcePack(prepared.batches[0]);
  expect(prepared.coverage.mediaReferences).toBe(2);
  expect(prepared.coverage.mediaOnlySources).toBe(1);
  expect(prepared.coverage.mediaOnlySourceIds).toEqual([`src_${createHash("sha256").update(JSON.stringify([lesson.url, "Page"])).digest("hex").slice(0, 20)}`]);
  expect(prepared.coverage.inputLinks).toBe(2);
  expect(prepared.coverage.outputLinks).toBe(2);
  expect(prepared.batches[0].skipped).toContain("1 media-only source has no lesson text or transcript; review mediaOnlySourceIds in the private manifest");
  expect(parsed.sources[0].text).toContain("No lesson text or transcript supplied");
  expect(parsed.sources[0].links).toEqual([
    { url: "https://video.example.org/watch/2", text: "Media: Lesson playback" },
    { url: "https://video.example.org/watch/3", text: "Media: Video page" },
  ]);
});

test("large media-only exports keep a bounded warning and every missing-transcript ID", () => {
  const sources = Array.from({ length: 105 }, (_, index) => ({
    title: `Playback ${index + 1}`,
    url: `${startUrl}?md=video-${index + 1}`,
    media: [{ kind: "video", title: "Watch", url: `https://video.example.org/watch/${index + 1}` }],
  }));
  const prepared = prepareClassroomSourcePack({ startUrl, sources, skipped: [], pending: [] });
  expect(prepared.coverage.mediaOnlySources).toBe(105);
  expect(new Set(prepared.coverage.mediaOnlySourceIds).size).toBe(105);
  expect(prepared.batches.reduce((sum, batch) => sum + batch.sources.length, 0)).toBe(105);
  expect(prepared.batches[0].skipped).toHaveLength(1);
});

test("owner inventory checks declared pages and May-to-September publication bounds", () => {
  const first = { ...source(0), publishedAt: "2026-05-01" };
  const last = { ...source(1), publishedAt: "2026-09-24" };
  const expected = {
    pages: [{ url: first.url }, { url: last.url }],
    firstPublishedDate: "2026-05-01",
    lastPublishedDate: "2026-09-24",
  };
  const complete = prepareClassroomSourcePack({ startUrl, sources: [first, last], expected, skipped: [], pending: [] });
  expect(complete.coverage.declaredInventory).toMatchObject({
    expectedPages: 2, matchedPages: 2, missingPages: [], undeclaredPages: [], missingDates: [], outsideWindow: [],
    observedFirstDate: "2026-05-01", observedLastDate: "2026-09-24",
    allDeclaredPagesPresent: true, declaredDateWindowMatched: true,
  });
  expect(complete.batches[0].skipped).toEqual([]);
  expect(() => assertCompleteClassroomCoverage(complete.coverage)).not.toThrow();

  const partial = prepareClassroomSourcePack({ startUrl, sources: [first], expected, skipped: [], pending: [] });
  expect(partial.coverage.declaredInventory).toMatchObject({
    expectedPages: 2, matchedPages: 1, missingPages: [{ url: last.url, tab: "Page" }],
    allDeclaredPagesPresent: false, declaredDateWindowMatched: false,
  });
  expect(partial.batches[0].skipped).toContain("1 page is missing from the declared owner inventory; review the private manifest");
  expect(() => assertCompleteClassroomCoverage(partial.coverage)).toThrow("classroom_export_incomplete");
  const extra = { ...source(2), publishedAt: "2026-06-01" };
  const undeclared = prepareClassroomSourcePack({ startUrl, sources: [first, last, extra], expected, skipped: [], pending: [] });
  expect(undeclared.coverage.declaredInventory?.undeclaredPages).toEqual([{ url: extra.url, tab: "Page" }]);
  expect(undeclared.coverage.declaredInventory?.declaredDateWindowMatched).toBe(false);
  expect(undeclared.batches[0].skipped).toContain("1 page is not in the declared owner inventory; review the private manifest");
  const undated = prepareClassroomSourcePack({ startUrl, sources: [first, { ...last, publishedAt: undefined }], expected, skipped: [], pending: [] });
  expect(undated.coverage.declaredInventory?.missingDates).toEqual([{ url: last.url, tab: "Page" }]);
  expect(undated.coverage.declaredInventory?.declaredDateWindowMatched).toBe(false);
  const outside = prepareClassroomSourcePack({ startUrl, sources: [first, { ...last, publishedAt: "2026-09-25" }], expected, skipped: [], pending: [] });
  expect(outside.coverage.declaredInventory?.outsideWindow).toEqual([{ url: last.url, tab: "Page", publishedAt: "2026-09-25" }]);
});

test("complete-export gate requires a declared inventory, exhausted queue, and lesson text", () => {
  const first = { ...source(0), publishedAt: "2026-05-01" };
  const expected = { pages: [{ url: first.url }], firstPublishedDate: "2026-05-01", lastPublishedDate: "2026-05-01" };
  const coverage = (run: Record<string, unknown>) => prepareClassroomSourcePack({
    startUrl, sources: [first], expected, skipped: [], pending: [], ...run,
  }).coverage;
  expect(() => assertCompleteClassroomCoverage(coverage({ expected: undefined }))).toThrow("classroom_export_incomplete");
  expect(() => assertCompleteClassroomCoverage(coverage({ pending: ["page-2"] }))).toThrow("classroom_export_incomplete");
  expect(() => assertCompleteClassroomCoverage(coverage({ skipped: ["restricted page"] }))).toThrow("classroom_export_incomplete");
  expect(() => assertCompleteClassroomCoverage(coverage({ sources: [{ ...first, text: "", media: [{ kind: "video", title: "Playback", url: "https://video.example.org/1" }] }] })))
    .toThrow("classroom_export_incomplete");
});

test("declared classroom inventory rejects duplicate, unsafe and impossible dates", () => {
  const lesson = { ...source(0), publishedAt: "2026-05-01" };
  const expected = { pages: [{ url: lesson.url }], firstPublishedDate: "2026-05-01", lastPublishedDate: "2026-09-24" };
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [{ ...lesson, publishedAt: "2026-02-30" }], expected, pending: [] })).toThrow("classroom_published_date_invalid");
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [lesson], expected: { ...expected, pages: [expected.pages[0], expected.pages[0]] }, pending: [] })).toThrow("classroom_expected_inventory_invalid");
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [lesson], expected: { ...expected, pages: [{ url: `${lesson.url}&token=private` }] }, pending: [] })).toThrow("classroom_url_invalid");
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [lesson], expected: { ...expected, firstPublishedDate: "2026-09-24", lastPublishedDate: "2026-05-01" }, pending: [] })).toThrow("classroom_expected_inventory_invalid");
});

test("classroom conversion rejects unsafe or unimportable material before writing", () => {
  const lesson = source(0);
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [{ ...lesson, links: [null] }], pending: [] })).toThrow("classroom_link_invalid");
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [{ ...lesson, links: [{ url: "https://video.example.org/watch/1?token=abc", text: "Media: Video" }] }], pending: [] })).toThrow("classroom_url_invalid");
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [{ ...lesson, media: [{ kind: "video", title: "Playback", url: "https://video.example.org/watch/1?token=abc" }] }], pending: [] })).toThrow("classroom_url_invalid");
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [{ ...lesson, media: [{ kind: "video", title: "Playback", url: "https://video.example.org/watch/1" }], video_page_links: [null] }], pending: [] })).toThrow("classroom_media_invalid");
  for (const signedUrl of [
    "https://storage.example.org/file?X-Amz-Signature=private-value",
    "https://storage.example.org/file?X-Goog-Credential=private-value",
    "https://storage.example.org/file?X-Goog-Signature=private-value",
    "https://storage.example.org/file?AWSAccessKeyId=private-value",
  ]) {
    expect(() => prepareClassroomSourcePack({ startUrl, sources: [{ ...lesson, links: [{ url: signedUrl, text: "Media: Video" }] }], pending: [] })).toThrow("classroom_url_invalid");
  }
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [{ ...lesson, collectedAt: "not-a-date" }], pending: [] })).toThrow("classroom_source_invalid");
  expect(() => prepareClassroomSourcePack({ startUrl, sources: [lesson], pending: [null] })).toThrow("classroom_pending_entries_invalid");
});

test("classroom export writes selectable private hashed batches and refuses overwrite", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "classroom-pack-"));
  try {
    const input = path.join(directory, "run.json");
    const output = path.join(directory, "pack.json");
    const ownerSource = {
      title: "Lesson 1", url: `${startUrl}?md=1`, text: "Lesson 1 text",
      publishedAt: "2026-05-01",
      links: [{ url: "https://video.example.org/watch/1", text: "Video" }],
    };
    writeFileSync(input, JSON.stringify({
      startUrl,
      sources: [ownerSource, {
        title: "Video-only lesson", url: `${startUrl}?md=2`,
        publishedAt: "2026-09-24",
        media: [{ kind: "video", title: "Watch", url: "https://video.example.org/watch/2" }],
      }],
      expected: {
        pages: [{ url: ownerSource.url }, { url: `${startUrl}?md=2` }],
        firstPublishedDate: "2026-05-01", lastPublishedDate: "2026-09-24",
      },
      skipped: [], pending: [],
    }), { mode: 0o600 });
    const strictOutput = path.join(directory, "complete.json");
    const strict = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts/prepare-classroom-source-pack.mjs"), input, strictOutput, "--require-complete",
    ], { cwd: process.cwd(), encoding: "utf8" });
    expect(strict.status).not.toBe(0);
    expect(strict.stderr).toContain("classroom_export_incomplete");
    expect(existsSync(path.join(directory, "complete.manifest.json"))).toBe(false);
    expect(existsSync(path.join(directory, "complete.part-001.json"))).toBe(false);
    const command = [path.join(process.cwd(), "scripts/prepare-classroom-source-pack.mjs"), input, output];
    const first = spawnSync(process.execPath, command, { cwd: process.cwd(), encoding: "utf8" });
    expect(first.status).toBe(0);
    const manifest = JSON.parse(readFileSync(path.join(directory, "pack.manifest.json"), "utf8"));
    const batch = manifest.batches[0];
    const bytes = readFileSync(batch.file);
    expect(path.basename(batch.file)).toBe("pack.part-001.json");
    expect(batch.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(parseClientSourcePack(JSON.parse(bytes.toString("utf8"))).linkCount).toBe(2);
    expect(manifest.coverage.mediaOnlySourceIds).toHaveLength(1);
    expect(manifest.coverage.declaredInventory).toMatchObject({
      expectedPages: 2, matchedPages: 2, declaredDateWindowMatched: true,
    });
    expect(JSON.parse(first.stdout).coverage.declaredInventory).toMatchObject({
      expectedPages: 2, matchedPages: 2, missingPages: 0, undeclaredPages: 0,
    });
    const selection = await selectClientSourceBatches([
      new File([readFileSync(path.join(directory, "pack.manifest.json"))], "pack.manifest.json"),
      new File([bytes], "pack.part-001.json"),
    ]);
    expect(selection.sourceCount).toBe(2);
    expect(selection.linkCount).toBe(2);
    expect(selection.skippedCount).toBe(1);
    expect(statSync(batch.file).mode & 0o777).toBe(0o600);
    expect(statSync(path.join(directory, "pack.manifest.json")).mode & 0o777).toBe(0o600);
    const second = spawnSync(process.execPath, command, { cwd: process.cwd(), encoding: "utf8" });
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain("classroom_output_exists");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
