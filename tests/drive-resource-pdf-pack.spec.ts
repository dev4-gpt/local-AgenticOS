import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDriveResourcePdfPack } from "../scripts/prepare-drive-resource-pdf-pack.mjs";

test("Drive resource PDFs retain file provenance, extracted links, and redacted text", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentos-drive-pdf-pack-"));
  const title = encodeURIComponent("Resource Pack");
  const filename = `AbCdEfGhIjKlMnOpQrStUvWxYz123456--${title}.pdf`;
  writeFileSync(path.join(directory, filename), "%PDF fixture");
  try {
    const result = buildDriveResourcePdfPack({
      directory,
      collectedAt: "2026-10-14T18:00:00.000Z",
      runCommand: (command, args) => {
        if (command === "pdfinfo" && args[0] === "-url") return "Page  Type          URL\n   1  Annotation    https://example.org/guide";
        if (command === "pdfinfo") return "Pages: 2\nTitle: Resource Pack\n";
        if (command === "pdftotext") return "Resource instructions\nAPI_KEY=example-secret-value\nSee https://example.org/guide.";
        throw new Error("unexpected_command");
      },
    });
    expect(result.coverage).toMatchObject({ inputPdfs: 1, preparedPdfs: 1, failedPdfs: 0, totalPages: 2, redactedCredentialLikeValues: 1, completeCommunityExport: false });
    const source = result.batches.flatMap((batch) => batch.sources)[0];
    expect(source).toMatchObject({
      title: "Resource Pack",
      url: "https://drive.google.com/file/d/AbCdEfGhIjKlMnOpQrStUvWxYz123456/view",
      collectedAt: "2026-10-14T18:00:00.000Z",
    });
    expect(source.text).not.toContain("example-secret-value");
    expect(source.links).toEqual([{ url: "https://example.org/guide", text: "PDF link on page 1" }]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("unreadable and malformed Drive PDFs are recorded as incomplete rather than omitted silently", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentos-drive-pdf-pack-"));
  writeFileSync(path.join(directory, "bad-name.pdf"), "%PDF fixture");
  writeFileSync(path.join(directory, `AbCdEfGhIjKlMnOpQrStUvWxYz123456--${encodeURIComponent("Scanned resource")}.pdf`), "%PDF fixture");
  try {
    const result = buildDriveResourcePdfPack({
      directory,
      runCommand: (command, args) => {
        if (command === "pdfinfo" && args[0] === "-url") return "";
        if (command === "pdfinfo") return "Pages: 1\n";
        if (command === "pdftotext") return "";
        throw new Error("unexpected_command");
      },
    });
    expect(result.coverage).toMatchObject({ inputPdfs: 2, preparedPdfs: 0, failedPdfs: 2, completeCommunityExport: false });
    expect(result.files.map((file) => file.reason)).toEqual(["pdf_text_unavailable_or_scanned_needs_ocr", "drive_pdf_filename_invalid"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
