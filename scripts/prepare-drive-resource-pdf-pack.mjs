#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pdfSourcePack } from "./prepare-pdf-source-pack.mjs";
import { splitMarkdownSourcePack } from "./prepare-markdown-source-pack.mjs";

const DRIVE_FILE_NAME = /^([A-Za-z0-9_-]{20,200})--(.+)\.pdf$/i;
const PRIVATE_DIRECTORY = path.resolve("tmp/authorized-skool-import");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function privateOutputStem(candidate) {
  if (typeof candidate !== "string" || path.isAbsolute(candidate)) throw new Error("private_resource_output_required");
  const resolved = path.resolve(candidate);
  if (path.dirname(resolved) !== PRIVATE_DIRECTORY || !/^[A-Za-z0-9._-]+$/.test(path.basename(resolved))) {
    throw new Error("private_resource_output_required");
  }
  return resolved;
}

function driveMetadata(filename) {
  const match = filename.match(DRIVE_FILE_NAME);
  if (!match) throw new Error("drive_pdf_filename_invalid");
  let title;
  try { title = decodeURIComponent(match[2]); } catch { throw new Error("drive_pdf_title_invalid"); }
  if (!title.trim() || title.length > 240 || /[\r\n\0]/.test(title)) throw new Error("drive_pdf_title_invalid");
  return { id: match[1], title: title.trim() };
}

export function buildDriveResourcePdfPack({ directory, collectedAt = new Date().toISOString(), runCommand }) {
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error("drive_pdf_directory_invalid");
  if (typeof collectedAt !== "string" || Number.isNaN(Date.parse(collectedAt))) throw new Error("drive_pdf_collection_time_invalid");
  const filenames = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.name)
    .sort();
  if (!filenames.length || filenames.length > 500) throw new Error("drive_pdf_file_count_invalid");

  const sources = [];
  const skipped = [];
  const files = [];
  let importedLinks = 0;
  let totalPages = 0;
  let redactedCredentialLikeValues = 0;

  for (const filename of filenames) {
    try {
      const { id, title } = driveMetadata(filename);
      const pageUrl = `https://drive.google.com/file/d/${id}/view`;
      const result = pdfSourcePack({
        pdfPath: path.join(directory, filename),
        pageUrl,
        title,
        collectedAt,
        inferPublishedDateFromFilename: false,
        sanitizeCredentialLikeText: true,
        ...(runCommand ? { runCommand } : {}),
      });
      const records = result.batches.flatMap((batch) => batch.sources);
      if (!records.length) throw new Error("pdf_sources_empty");
      sources.push(...records);
      importedLinks += records.reduce((count, record) => count + record.links.length, 0);
      totalPages += result.metadata.pages;
      redactedCredentialLikeValues += result.metadata.redactedCredentialLikeValues;
      skipped.push(...result.batches.flatMap((batch) => batch.skipped));
      files.push({
        filename,
        driveFileId: id,
        title,
        inputSha256: result.metadata.inputSha256,
        pages: result.metadata.pages,
        textCharacters: result.metadata.textCharacters,
        embeddedLinks: result.metadata.embeddedLinks,
        textLinks: result.metadata.textLinks,
        uniqueLinks: result.metadata.uniqueLinks,
        redactedCredentialLikeValues: result.metadata.redactedCredentialLikeValues,
        status: "prepared",
      });
    } catch (error) {
      const code = error instanceof Error && /^[a-z0-9_]{1,80}$/.test(error.message) ? error.message : "pdf_processing_failed";
      files.push({ filename, status: "failed", reason: code });
      skipped.push(`${filename}: ${code}`);
    }
  }

  const pack = {
    startUrl: "https://drive.google.com/",
    skipped: skipped.slice(0, 100),
    sources,
  };
  const batches = sources.length ? splitMarkdownSourcePack(pack) : [];
  const preparedFiles = files.filter((file) => file.status === "prepared").length;
  const failedFiles = files.length - preparedFiles;
  const coverage = {
    inputPdfs: files.length,
    preparedPdfs: preparedFiles,
    failedPdfs: failedFiles,
    importedSourceSegments: sources.length,
    importedLinks,
    totalPages,
    redactedCredentialLikeValues,
    completeCommunityExport: false,
    discoveredQueueExhausted: false,
  };
  return { startUrl: pack.startUrl, skipped: pack.skipped, files, batches, coverage };
}

function writePrivateNew(file, contents) {
  if (existsSync(file)) throw new Error("drive_pdf_output_exists");
  writeFileSync(file, contents, { flag: "wx", mode: 0o600 });
}

if (process.argv[1]?.endsWith("/prepare-drive-resource-pdf-pack.mjs")) {
  const [directory, outputStemCandidate] = process.argv.slice(2);
  if (!directory || !outputStemCandidate) {
    console.error("Usage: node scripts/prepare-drive-resource-pdf-pack.mjs pdf-directory tmp/authorized-skool-import/output-stem");
    process.exitCode = 2;
  } else {
    try {
      const outputStem = privateOutputStem(outputStemCandidate);
      const result = buildDriveResourcePdfPack({ directory });
      const batches = result.batches.map((batch, index) => {
        const file = `${outputStem}.part-${String(index + 1).padStart(3, "0")}.json`;
        const encoded = JSON.stringify(batch, null, 2);
        writePrivateNew(file, encoded);
        return {
          file: path.relative(process.cwd(), file),
          sha256: sha256(encoded),
          sources: batch.sources.length,
          links: batch.sources.reduce((count, source) => count + source.links.length, 0),
        };
      });
      const manifest = {
        version: 1,
        sourceKind: "authorized_drive_pdf_resources",
        startUrl: result.startUrl,
        skipped: result.skipped.length,
        coverage: result.coverage,
        files: result.files,
        batches,
      };
      const manifestPath = `${outputStem}.manifest.json`;
      writePrivateNew(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(JSON.stringify({ manifest: path.relative(process.cwd(), manifestPath), ...result.coverage, batches: batches.length }));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "drive_pdf_pack_failed");
      process.exitCode = 1;
    }
  }
}
