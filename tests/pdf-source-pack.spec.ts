import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseClientSourcePack } from "../src/lib/clientSourcePack";
import { buildPdfSourcePackManifest, cleanPdfText, parsePdfLinks, parsePdfTextLinks, pdfSourcePack } from "../scripts/prepare-pdf-source-pack.mjs";

test("PDF source preparation preserves extracted lesson text and embedded URLs in the reviewed import format", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentos-pdf-pack-"));
  const pdfPath = path.join(directory, "2026-05-11-lesson-notes.pdf");
  writeFileSync(pdfPath, "%PDF synthetic fixture");
  try {
    const result = pdfSourcePack({
      pdfPath,
      pageUrl: "https://www.skool.com/community/classroom/lesson",
      runCommand: (command, args) => {
        if (command === "pdfinfo" && args[0] === "-url") return "Page  Type          URL\n   1  Annotation    https://example.org/video?id=one\n   2  Annotation    javascript:alert(1)";
        if (command === "pdfinfo") return "Pages: 2\nTitle: Lesson Notes\n";
        if (command === "pdftotext") return "Lesson notes\n\nA useful workflow. See https://example.org/video?id=one and https://example.org/guide.\f";
        throw new Error("unexpected_command");
      },
    });
    expect(result.metadata).toMatchObject({ pages: 2, publishedDate: "2026-05-11", embeddedLinks: 1, textLinks: 2, uniqueLinks: 2, skippedLinkAnnotations: 1 });
    const parsed = parseClientSourcePack(result.batches[0]);
    expect(parsed.sources[0].text).toContain("A useful workflow.");
    expect(parsed.sources[0].publishedAt).toBe("2026-05-11");
    expect(parsed.sources[0].links).toEqual([
      { url: "https://example.org/video?id=one", text: "PDF link on page 1" },
      { url: "https://example.org/guide", text: "PDF text URL" },
    ]);
    expect(parsed.skipped).toEqual(["PDF page 2: unsupported or invalid link omitted"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("PDF text cleanup and hyperlink parsing reject malformed/non-web targets", () => {
  expect(cleanPdfText(" line one \f\n\nline two\u0000 ")).toBe("line one\n\nline two");
  expect(parsePdfLinks([
    "Page  Type          URL",
    "   1  Annotation    https://example.org/good",
    "   2  Annotation    javascript:alert(1)",
    "   3  Annotation    https://user:pass@example.org/private",
    "   4  Annotation    https://api.hunter.io/v2/account?api_key=YOUR_KEY",
  ].join("\n"))).toEqual({
    links: [{ url: "https://example.org/good", text: "PDF link on page 1" }],
    skipped: [
      "PDF page 2: unsupported or invalid link omitted",
      "PDF page 3: unsupported or invalid link omitted",
      "PDF page 4: unsupported or invalid link omitted",
    ],
  });
});

test("plain-text URL extraction trims sentence punctuation and omits URLs containing credentials", () => {
  expect(parsePdfTextLinks("Read https://example.org/guide. Do not use https://user:pass@example.org/private or https://api.hunter.io/v2/account?api_key=YOUR_KEY."))
    .toEqual({
      links: [{ url: "https://example.org/guide", text: "PDF text URL" }],
      skipped: [
        "PDF text contains a credential-bearing or invalid URL omitted",
        "PDF text contains a credential-bearing or invalid URL omitted",
      ],
    });
});

test("PDF source preparation can redact credential-like text before building a source pack", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentos-pdf-pack-"));
  const pdfPath = path.join(directory, "bonus.pdf");
  writeFileSync(pdfPath, "%PDF synthetic fixture");
  try {
    const result = pdfSourcePack({
      pdfPath,
      pageUrl: "https://drive.google.com/file/d/example/view",
      title: "Bonus resource",
      sanitizeCredentialLikeText: true,
      runCommand: (command, args) => {
        if (command === "pdfinfo" && args[0] === "-url") return "";
        if (command === "pdfinfo") return "Pages: 1\n";
        if (command === "pdftotext") return "API key: sk-abcdefghijklmnop1234\nA reusable client proposal workflow.";
        throw new Error("unexpected_command");
      },
    });
    const parsed = parseClientSourcePack(result.batches[0]);
    expect(result.metadata.redactedCredentialLikeValues).toBe(1);
    expect(parsed.sources[0].text).toContain("API key: ***");
    expect(parsed.sources[0].text).not.toContain("sk-abcdefghijklmnop1234");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("PDF source preparation omits URLs with sensitive query parameters before pack validation", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentos-pdf-pack-"));
  const pdfPath = path.join(directory, "lesson.pdf");
  writeFileSync(pdfPath, "%PDF synthetic fixture");
  try {
    const result = pdfSourcePack({
      pdfPath,
      pageUrl: "https://www.skool.com/community/classroom/lesson",
      sanitizeCredentialLikeText: true,
      runCommand: (command, args) => {
        if (command === "pdfinfo" && args[0] === "-url") return "";
        if (command === "pdfinfo") return "Pages: 1\n";
        if (command === "pdftotext") return 'Run curl "https://api.hunter.io/v2/account?api_key=YOUR_KEY" for account status.';
        throw new Error("unexpected_command");
      },
    });
    const parsed = parseClientSourcePack(result.batches[0]);
    expect(result.metadata.redactedCredentialLikeValues).toBe(1);
    expect(parsed.sources[0].text).toContain("[URL omitted: sensitive query parameter]");
    expect(parsed.sources[0].text).not.toContain("api_key");
    expect(parsed.sources[0].links).toEqual([]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("PDF source manifests include the totals required by the production batch selector", () => {
  const result = {
    batches: [{ startUrl: "https://drive.google.com/file/d/example/view", skipped: ["one skipped link"] }],
    coverage: { outputSources: 1, outputLinks: 2 },
    metadata: { title: "Bonus resource" },
  };
  const manifest = buildPdfSourcePackManifest(result, [{
    file: "bonus.part-001.json",
    sha256: "a".repeat(64),
    sources: 1,
    links: 2,
  }]);
  expect(manifest).toMatchObject({
    version: 1,
    startUrl: "https://drive.google.com/file/d/example/view",
    sources: 1,
    links: 2,
    skipped: 1,
    batches: [{ file: "bonus.part-001.json", sources: 1, links: 2 }],
  });
});

test("scanned/image-only PDFs fail with an explicit OCR-required result", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentos-pdf-pack-"));
  const pdfPath = path.join(directory, "scan.pdf");
  writeFileSync(pdfPath, "%PDF synthetic fixture");
  try {
    expect(() => pdfSourcePack({
      pdfPath,
      pageUrl: "https://example.org/course/scan",
      runCommand: (command, args) => command === "pdfinfo" && args[0] !== "-url" ? "Pages: 1\n" : "",
    })).toThrow("pdf_text_unavailable_or_scanned_needs_ocr");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
