import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseClientSourcePack } from "../src/lib/clientSourcePack";
import { cleanPdfText, parsePdfLinks, parsePdfTextLinks, pdfSourcePack } from "../scripts/prepare-pdf-source-pack.mjs";

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
  ].join("\n"))).toEqual({
    links: [{ url: "https://example.org/good", text: "PDF link on page 1" }],
    skipped: [
      "PDF page 2: unsupported or invalid link omitted",
      "PDF page 3: unsupported or invalid link omitted",
    ],
  });
});

test("plain-text URL extraction trims sentence punctuation and omits URLs containing credentials", () => {
  expect(parsePdfTextLinks("Read https://example.org/guide. Do not use https://user:pass@example.org/private."))
    .toEqual({
      links: [{ url: "https://example.org/guide", text: "PDF text URL" }],
      skipped: ["PDF text contains a credential-bearing or invalid URL omitted"],
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
