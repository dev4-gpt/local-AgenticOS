#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { prepareClassroomSourcePack } from "./prepare-classroom-source-pack.mjs";

const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_TEXT_BYTES = 20 * 1024 * 1024;

export function parsePdfLinks(output) {
  const links = [];
  const skipped = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+Annotation\s+(.+?)\s*$/);
    if (!match) continue;
    try {
      const url = new URL(match[2].trim());
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("unsupported_link");
      links.push({ url: url.toString(), text: `PDF link on page ${Number(match[1])}` });
    } catch {
      skipped.push(`PDF page ${Number(match[1])}: unsupported or invalid link omitted`);
    }
  }
  return { links, skipped };
}

export function cleanPdfText(text) {
  return text.replace(/\f(?:\r?\n)*/g, "\n\n").replace(/\u0000/g, "").replace(/[^\S\n\r\t]+\n/g, "\n").trim();
}

function run(command, args, maxBuffer = MAX_TEXT_BYTES) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer, timeout: 120_000 });
  if (result.error?.code === "ENOBUFS") throw new Error("pdf_text_too_large");
  if (result.error?.code === "ETIMEDOUT") throw new Error("pdf_extraction_timeout");
  if (result.error) throw new Error(`${command}_unavailable`);
  if (result.status !== 0) throw new Error(`${command}_failed`);
  return result.stdout;
}

function metadataValue(metadata, label) {
  const match = metadata.match(new RegExp(`^${label}:\\s*(.*)$`, "mi"));
  return match?.[1]?.trim() || "";
}

function writePrivate(file, contents) {
  if (existsSync(file)) throw new Error("output_exists");
  writeFileSync(file, contents, { flag: "wx", mode: 0o600 });
}

export function pdfSourcePack({ pdfPath, pageUrl, title, publishedDate, collectedAt, runCommand = run }) {
  const fileStat = lstatSync(pdfPath);
  if (!fileStat.isFile() || fileStat.size < 1 || fileStat.size > MAX_PDF_BYTES) throw new Error("pdf_file_invalid");
  if (path.extname(pdfPath).toLowerCase() !== ".pdf") throw new Error("pdf_file_invalid");
  const sourceUrl = new URL(pageUrl);
  if (!["http:", "https:"].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error("source_url_invalid");
  sourceUrl.hash = "";
  const metadata = runCommand("pdfinfo", [pdfPath]);
  const pages = Number(metadataValue(metadata, "Pages"));
  if (!Number.isSafeInteger(pages) || pages < 1) throw new Error("pdf_page_count_invalid");
  const extracted = runCommand("pdftotext", ["-enc", "UTF-8", "-layout", "-nopgbrk", pdfPath, "-"]);
  if (Buffer.byteLength(extracted, "utf8") > MAX_TEXT_BYTES) throw new Error("pdf_text_too_large");
  const text = cleanPdfText(extracted);
  if (!text) throw new Error("pdf_text_unavailable_or_scanned_needs_ocr");
  const extractedLinks = parsePdfLinks(runCommand("pdfinfo", ["-url", pdfPath]));
  const fileTitle = path.basename(pdfPath, path.extname(pdfPath)).replace(/^\d{4}-\d{2}-\d{2}[-_ ]*/, "").replace(/[-_]+/g, " ").trim();
  const sourceTitle = title?.trim() || metadataValue(metadata, "Title") || fileTitle;
  const date = publishedDate || path.basename(pdfPath).match(/^(\d{4}-\d{2}-\d{2})[-_ ]/)?.[1];
  const source = { title: sourceTitle, tab: sourceTitle, url: sourceUrl.toString(), text, links: extractedLinks.links, collectedAt };
  if (date) source.publishedAt = date;
  const prepared = prepareClassroomSourcePack({ startUrl: sourceUrl.toString(), sources: [source], skipped: extractedLinks.skipped, pending: [] });
  return {
    batches: prepared.batches,
    coverage: prepared.coverage,
    metadata: {
      filename: path.basename(pdfPath),
      inputSha256: createHash("sha256").update(readFileSync(pdfPath)).digest("hex"),
      pages,
      textCharacters: text.length,
      embeddedLinks: extractedLinks.links.length,
      skippedLinkAnnotations: extractedLinks.skipped.length,
      title: sourceTitle,
      publishedDate: date ?? null,
    },
  };
}

if (process.argv[1]?.endsWith("/prepare-pdf-source-pack.mjs")) {
  const args = process.argv.slice(2);
  const [pdfPath, pageUrl, output, ...options] = args;
  const option = (name) => {
    const index = options.indexOf(name);
    return index < 0 ? undefined : options[index + 1];
  };
  if (!pdfPath || !pageUrl || !output || options.some((item, index) => ["--title", "--published-date"].includes(item) && !options[index + 1])) {
    console.error("Usage: node scripts/prepare-pdf-source-pack.mjs lesson.pdf lesson-page-url output.json [--title title] [--published-date YYYY-MM-DD]");
    process.exitCode = 2;
  } else {
    try {
      const result = pdfSourcePack({
        pdfPath,
        pageUrl,
        title: option("--title"),
        publishedDate: option("--published-date"),
      });
      const parsed = path.parse(output);
      const batchFiles = result.batches.map((batch, index) => {
        const suffix = String(index + 1).padStart(3, "0");
        const file = path.join(parsed.dir, `${parsed.name}.part-${suffix}${parsed.ext || ".json"}`);
        const encoded = JSON.stringify(batch, null, 2);
        return { file, encoded, sha256: createHash("sha256").update(encoded).digest("hex"), sources: batch.sources.length, links: batch.sources.reduce((sum, item) => sum + item.links.length, 0) };
      });
      const manifest = path.join(parsed.dir, `${parsed.name}.manifest.json`);
      if ([...batchFiles.map((batch) => batch.file), manifest].some((file) => existsSync(file))) throw new Error("output_exists");
      for (const batch of batchFiles) writePrivate(batch.file, batch.encoded);
      const manifestBatches = batchFiles.map(({ file, sha256, sources, links }) => ({ file, sha256, sources, links }));
      writePrivate(manifest, JSON.stringify({ version: 1, ...result.metadata, coverage: result.coverage, batches: manifestBatches }, null, 2));
      console.log(JSON.stringify({ manifest, pages: result.metadata.pages, sources: result.coverage.outputSources, links: result.coverage.outputLinks, skipped: result.coverage.skippedPages, batches: batchFiles.length }));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "pdf_source_pack_failed");
      process.exitCode = 1;
    }
  }
}
