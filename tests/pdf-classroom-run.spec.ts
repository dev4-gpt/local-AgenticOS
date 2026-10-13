import { expect, test } from "@playwright/test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { preparePdfClassroomRun } from "../scripts/prepare-pdf-classroom-run.mjs";
import { parseClientSourcePack } from "../src/lib/clientSourcePack";

const startUrl = "https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1";

test("local PDF batch preparation imports only unambiguous first-page lesson URLs", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "pdf-classroom-run-"));
  const sourceDirectory = path.join(directory, "pdfs");
  mkdirSync(sourceDirectory);
  const files = ["2026-05-01-lesson-one.pdf", "lesson-ambiguous.pdf"];
  for (const filename of files) writeFileSync(path.join(sourceDirectory, filename), filename);
  const runCommand = (command: string, args: string[]) => {
    const pdfPath = args.at(-1) === "-" ? args.at(-2)! : args.at(-1)!;
    const ambiguous = path.basename(pdfPath).startsWith("lesson-ambiguous");
    if (command === "pdftotext" && args.includes("-f")) {
      return ambiguous
        ? `https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=two\nhttps://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=three`
        : "https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=one";
    }
    if (command === "pdfinfo" && args.includes("-url")) return "1 Annotation https://video.example.org/watch/one\n1 Annotation file:///private/ignored";
    if (command === "pdfinfo") return "Pages: 1\nTitle: Test lesson\n";
    return "Lesson text\nhttps://docs.example.org/reference";
  };

  try {
    const prepared = preparePdfClassroomRun({
      directory: sourceDirectory,
      startUrl,
      sourceUrlPrefix: startUrl,
      runCommand,
    });
    expect(prepared.coverage).toMatchObject({
      inputPdfs: 2,
      preparedPdfs: 1,
      importedSourceSegments: 1,
      ambiguousPdfs: 1,
      unresolvedPdfs: 1,
      skippedReferences: 1,
      completeCommunityExport: false,
    });
    const parsed = parseClientSourcePack(prepared.batches[0]);
    expect(parsed.sources[0]).toMatchObject({
      title: "lesson-one",
      sourceUrl: `${startUrl}?md=one`,
      publishedAt: null,
      links: [
        { url: "https://video.example.org/watch/one", text: "PDF link on page 1" },
        { url: "https://docs.example.org/reference", text: "PDF text URL" },
      ],
    });
    expect(prepared.batches[0].skipped).toEqual([
      "2026-05-01-lesson-one.pdf: PDF page 1: unsupported or invalid link omitted",
      "lesson-ambiguous.pdf: ambiguous_source_url",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("local PDF prep uses only a verified footer URL to resolve wrapped lesson links", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "pdf-classroom-footer-"));
  const filename = "2026-06-07-lesson.pdf";
  writeFileSync(path.join(directory, filename), filename);
  const pageUrl = `${startUrl}?md=lesson-page`;
  const runCommand = (command: string, args: string[]) => {
    const pdfPath = args.at(-1) === "-" ? args.at(-2)! : args.at(-1)!;
    if (command === "pdftotext" && args.includes("-f")) {
      return `Lesson mentions ${startUrl}?\nmd=linked-lesson\n${pageUrl}    1/4`;
    }
    if (command === "pdfinfo" && args.includes("-url")) return "";
    if (command === "pdfinfo") return "Pages: 1\nTitle: Footer lesson\n";
    return "Lesson body";
  };
  try {
    const prepared = preparePdfClassroomRun({ directory, startUrl, sourceUrlPrefix: startUrl, runCommand });
    expect(prepared.coverage).toMatchObject({ preparedPdfs: 1, ambiguousPdfs: 0, unresolvedPdfs: 0 });
    expect(parseClientSourcePack(prepared.batches[0]).sources[0].sourceUrl).toBe(pageUrl);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("local PDF batch preparation redacts credential-like values before validation", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "pdf-classroom-secrets-"));
  const sourceDirectory = path.join(directory, "pdfs");
  mkdirSync(sourceDirectory);
  const filename = "lesson-credentials.pdf";
  writeFileSync(path.join(sourceDirectory, filename), filename);
  const runCommand = (command: string, args: string[]) => {
    const pdfPath = args.at(-1) === "-" ? args.at(-2)! : args.at(-1)!;
    if (command === "pdftotext" && args.includes("-f")) return `${startUrl}?md=credentials`;
    if (command === "pdfinfo" && args.includes("-url")) return "";
    if (command === "pdfinfo") return "Pages: 1\nTitle: Credential handling\n";
    return "GROQ_API_KEY=unit-test-secret-value\nOPENAI_API_KEY=\"unit test secret tail\"\nExample token: sk-abcdefghijklmnopqrs";
  };

  try {
    const prepared = preparePdfClassroomRun({
      directory: sourceDirectory,
      startUrl,
      sourceUrlPrefix: startUrl,
      runCommand,
    });
    expect(prepared.coverage).toMatchObject({ preparedPdfs: 1, unresolvedPdfs: 0 });
    expect(prepared.files[0]).toMatchObject({ redactedCredentialLikeValues: 3 });
    const source = parseClientSourcePack(prepared.batches[0]).sources[0];
    expect(source.text).toContain("GROQ_API_KEY=***");
    expect(source.text).toContain("OPENAI_API_KEY=***");
    expect(source.text).toContain("Example token: ***");
    expect(source.text).not.toContain("unit-test-secret-value");
    expect(source.text).not.toContain("unit test secret tail");
    expect(source.text).not.toContain("sk-abcdefghijklmnopqrs");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
