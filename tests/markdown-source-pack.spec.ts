import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { markdownSourcePack, splitMarkdownSourcePack } from "../scripts/prepare-markdown-source-pack.mjs";
import { parseClientSourcePack } from "../src/lib/clientSourcePack";

test("Markdown bonus links remain reviewable and tenant-import compatible", () => {
  const markdown = `## Launch kits\n- [Agent OS](https://example.org/agent-os)\n- Second [guide](https://example.org/guide)\n## Other bonuses\n- [Workflow](https://example.org/workflow)`;
  const pack = markdownSourcePack(markdown, "https://docs.example.org/bonuses", "2026-09-27T00:00:00Z");
  expect(pack.sources).toHaveLength(2);
  expect(pack.sources.map((item) => item.links.length)).toEqual([2, 1]);
  expect(pack.sources[0].text).toContain("Agent OS");
  const parsed = parseClientSourcePack(pack);
  expect(parsed.linkCount).toBe(3);
  expect(parsed.sources[0].sourceImportKey).not.toBe(parsed.sources[1].sourceImportKey);
});

test("large sections split without losing links", () => {
  const markdown = `## Resources\n${Array.from({ length: 105 }, (_, index) => `- [Item ${index}](https://example.org/${index})`).join("\n")}`;
  const pack = markdownSourcePack(markdown, "https://docs.example.org/bonuses");
  expect(pack.sources.map((item) => item.links.length)).toEqual([100, 5]);
  expect(parseClientSourcePack(pack).linkCount).toBe(105);
});

test("repeated headings retain separate stable import identities", () => {
  const markdown = "## Lesson\nFirst version.\n## Lesson\nSecond version.\n## Lesson (2)\nThird version.";
  const pack = markdownSourcePack(markdown, "https://example.org/course", "2026-09-29T00:00:00Z");
  expect(pack.sources.map((source) => source.title)).toEqual(["Lesson", "Lesson", "Lesson (2)"]);
  expect(pack.sources.map((source) => source.tab)).toEqual(["Lesson", "Lesson (2)", "Lesson (2) (2)"]);
  const parsed = parseClientSourcePack(pack);
  expect(new Set(parsed.sources.map((source) => source.sourceImportKey)).size).toBe(3);
  expect(markdownSourcePack(markdown, "https://example.org/course", "2026-09-29T00:00:00Z").sources.map((source) => source.tab)).toEqual(pack.sources.map((source) => source.tab));
});

test("malformed links are reported rather than silently imported", () => {
  const pack = markdownSourcePack("## Resources\n- [Good](https://example.org/good)\n- [Missing]()", "https://docs.example.org/bonuses");
  expect(pack.sources[0].links).toHaveLength(1);
  expect(pack.skipped).toEqual([{ section: "Resources", label: "Missing", reason: "invalid_url" }]);
  expect(parseClientSourcePack(pack).skipped).toEqual(["Resources: Missing (invalid_url)"]);
});

test("Markdown export preserves code and unlinked lessons while retaining media references", () => {
  const markdown = [
    "## Lesson with code",
    "Run this example:",
    "```js",
    "const answer = 42;",
    "```",
    "| Step | Result |",
    "| --- | --- |",
    "| Build | Ready |",
    "![Walkthrough poster](./poster.png)",
    "[Watch the video](/videos/demo.mp4)",
    "[Source notes][notes]",
    "",
    "[notes]: https://example.org/notes",
    "## Text-only lesson",
    "> Keep the original explanation.",
    "## Unsupported embed",
    "Plain introduction.",
    "<iframe src=\"https://example.org/embed\"></iframe>",
  ].join("\n");
  const pack = markdownSourcePack(markdown, "https://example.org/course/page");
  expect(pack.sources.map((source) => source.title)).toEqual(["Lesson with code", "Text-only lesson", "Unsupported embed"]);
  expect(pack.sources[0].text).toContain("```js\nconst answer = 42;\n```");
  expect(pack.sources[0].text).toContain("| Build | Ready |");
  expect(pack.sources[0].links).toEqual([
    { url: "https://example.org/course/poster.png", text: "Walkthrough poster" },
    { url: "https://example.org/videos/demo.mp4", text: "Watch the video" },
    { url: "https://example.org/notes", text: "Source notes" },
  ]);
  expect(pack.sources[1].text).toContain("> Keep the original explanation.");
  expect(pack.sources[1].links).toEqual([]);
  expect(pack.sources[2].text).not.toContain("iframe");
  expect(pack.skipped).toEqual([{ section: "Unsupported embed", label: "Raw HTML", reason: "html_not_imported" }]);
  expect(parseClientSourcePack(pack).linkCount).toBe(3);
});

test("large authorized exports split at the source count without losing lessons or links", () => {
  const markdown = Array.from({ length: 105 }, (_, index) => `## Lesson ${index}\nRead [resource ${index}](https://example.org/${index}).`).join("\n");
  const pack = markdownSourcePack(markdown, "https://example.org/course", "2026-09-29T00:00:00Z");
  const batches = splitMarkdownSourcePack(pack);
  expect(batches.map((batch) => batch.sources.length)).toEqual([100, 5]);
  expect(batches.flatMap((batch) => batch.sources.map((source) => source.title))).toEqual(pack.sources.map((source) => source.title));
  expect(batches.flatMap((batch) => batch.sources.flatMap((source) => source.links))).toEqual(pack.sources.flatMap((source) => source.links));
  expect(batches.map((batch) => parseClientSourcePack(batch).linkCount)).toEqual([100, 5]);
});

test("large authorized exports split at the byte limit into valid import batches", () => {
  const markdown = Array.from({ length: 60 }, (_, index) => `## Lesson ${index}\n${"A".repeat(19_000)}`).join("\n");
  const pack = markdownSourcePack(markdown, "https://example.org/course");
  const batches = splitMarkdownSourcePack(pack);
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.flatMap((batch) => batch.sources.map((source) => source.text))).toEqual(pack.sources.map((source) => source.text));
  for (const batch of batches) {
    expect(Buffer.byteLength(JSON.stringify(batch, null, 2))).toBeLessThanOrEqual(1_000_000);
    expect(parseClientSourcePack(batch).sources).toHaveLength(batch.sources.length);
  }
});

test("optional private source pack passes the tenant import parser", () => {
  const file = process.env.AGENTOS_SOURCE_PACK_FILE;
  test.skip(!file, "Set AGENTOS_SOURCE_PACK_FILE to validate a user-provided pack.");
  const pack = parseClientSourcePack(JSON.parse(readFileSync(file!, "utf8")));
  expect(pack.sources.length).toBeGreaterThan(0);
  expect(pack.linkCount).toBeGreaterThan(0);
});
