#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pdfSourcePack } from "./prepare-pdf-source-pack.mjs";
import { splitMarkdownSourcePack } from "./prepare-markdown-source-pack.mjs";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 120_000 });
  if (result.error || result.status !== 0) throw new Error("pdf_extraction_failed");
  return result.stdout;
}

function validUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label}_invalid`); }
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.hash) throw new Error(`${label}_invalid`);
  return url;
}

function insidePrefix(candidate, prefix) {
  if (candidate.origin !== prefix.origin) return false;
  const pathPrefix = prefix.pathname.replace(/\/+$/, "");
  return candidate.pathname === pathPrefix || candidate.pathname.startsWith(`${pathPrefix}/`);
}

function candidateUrls(text, prefix) {
  const urls = new Set();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    const raw = match[0].replace(/[.,;:!?]+$/, "").replace(/[)\]}]+$/, "");
    try {
      const url = new URL(raw);
      url.hash = "";
      if (insidePrefix(url, prefix)) urls.add(url.toString());
    } catch { /* Ignore non-URL text. */ }
  }
  return [...urls].sort();
}

function footerSourceUrl(text, prefix) {
  const candidates = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    const raw = match[0].replace(/[.,;:!?]+$/, "").replace(/[)\]}]+$/, "");
    try {
      const url = new URL(raw);
      if (insidePrefix(url, prefix)) candidates.push({ url: url.toString(), end: match.index + raw.length });
    } catch { /* Ignore non-URL text. */ }
  }
  const last = candidates.at(-1);
  return last && /^\s*\d+\/\d+\s*$/.test(text.slice(last.end)) ? last.url : null;
}

function canonicalUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.searchParams.sort();
  return url.toString();
}

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename)).replace(/^\d{4}-\d{2}-\d{2}[-_ ]*/, "").trim();
}

export function preparePdfClassroomRun({ directory, startUrl, sourceUrlPrefix, runCommand = run }) {
  const dirStat = lstatSync(directory);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error("pdf_directory_invalid");
  const root = validUrl(startUrl, "classroom_start_url");
  if (root.search) throw new Error("classroom_start_url_invalid");
  const prefix = validUrl(sourceUrlPrefix, "source_url_prefix");
  if (prefix.search || prefix.origin !== root.origin || !insidePrefix(prefix, root)) throw new Error("source_url_prefix_invalid");

  const filenames = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.name).sort();
  if (!filenames.length || filenames.length > 500) throw new Error("pdf_file_count_invalid");

  const rows = [];
  for (const filename of filenames) {
    const pdfPath = path.join(directory, filename);
    try {
      const firstPage = runCommand("pdftotext", ["-f", "1", "-l", "1", "-enc", "UTF-8", "-layout", "-nopgbrk", pdfPath, "-"]);
      const candidates = candidateUrls(firstPage, prefix);
      if (candidates.length > 1) {
        const footerUrl = footerSourceUrl(firstPage, prefix);
        if (footerUrl) candidates.splice(0, candidates.length, footerUrl);
      }
      if (candidates.length !== 1) {
        rows.push({ filename, status: candidates.length ? "ambiguous_source_url" : "source_url_missing", candidateCount: candidates.length });
        continue;
      }
      const result = pdfSourcePack({
        pdfPath,
        pageUrl: candidates[0],
        title: titleFromFilename(filename),
        inferPublishedDateFromFilename: false,
        sanitizeCredentialLikeText: true,
        runCommand,
      });
      rows.push({
        filename,
        status: "prepared",
        sourceUrl: candidates[0],
        ...result.metadata,
        skipped: [...new Set(result.batches.flatMap((batch) => batch.skipped))],
        sources: result.batches.flatMap((batch) => batch.sources),
      });
    } catch (error) {
      rows.push({ filename, status: error instanceof Error ? error.message : "pdf_preparation_failed" });
    }
  }

  const groups = new Map();
  for (const row of rows.filter((item) => item.status === "prepared")) {
    const key = canonicalUrl(row.sourceUrl);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const skipped = [];
  const sources = [];
  let skippedReferences = 0;
  let conflictingSourceUrlGroups = 0;
  let preservedConflictingSnapshots = 0;
  for (const row of rows) {
    if (row.status !== "prepared") {
      skipped.push(`${row.filename}: ${row.status}`);
      continue;
    }
    const group = groups.get(canonicalUrl(row.sourceUrl));
    if (group.length > 1) {
      const identical = group.every((item) => item.inputSha256 === group[0].inputSha256);
      if (!identical) {
        if (row === group[0]) conflictingSourceUrlGroups += 1;
        row.status = "preserved_source_url_snapshot";
        preservedConflictingSnapshots += 1;
        const snapshotLabel = ` [PDF snapshot ${row.inputSha256.slice(0, 12)}]`;
        for (const source of row.sources) {
          source.tab = `${source.tab.slice(0, 240 - snapshotLabel.length)}${snapshotLabel}`;
        }
      } else {
        const first = group[0];
        if (row !== first) {
          row.status = "duplicate_identical_pdf";
          skipped.push(`${row.filename}: byte-identical duplicate of ${first.filename}`);
          continue;
        }
      }
    }
    for (const warning of row.skipped ?? []) {
      skipped.push(`${row.filename}: ${warning}`);
      skippedReferences += 1;
    }
    sources.push(...row.sources);
    delete row.sources;
  }

  if (!sources.length) throw new Error("no_unambiguous_pdf_sources");
  const pack = { startUrl: root.toString(), skipped, sources };
  const batches = splitMarkdownSourcePack(pack);
  return {
    batches,
    files: rows.map(({ sources: _sources, ...row }) => row),
    coverage: {
      inputPdfs: filenames.length,
      preparedPdfs: rows.filter((row) => ["prepared", "preserved_source_url_snapshot", "duplicate_identical_pdf"].includes(row.status)).length,
      conflictingSourceUrlGroups,
      preservedConflictingSnapshots,
      importedSourceSegments: sources.length,
      importedLinks: sources.reduce((count, source) => count + source.links.length, 0),
      skippedReferences,
      ambiguousPdfs: rows.filter((row) => row.status === "ambiguous_source_url").length,
      unresolvedPdfs: rows.filter((row) => !["prepared", "preserved_source_url_snapshot", "duplicate_identical_pdf"].includes(row.status)).length,
      completeCommunityExport: false,
      discoveredQueueExhausted: false,
    },
  };
}

function writePrivate(file, contents) {
  writeFileSync(file, contents, { flag: "wx", mode: 0o600 });
}

if (process.argv[1]?.endsWith("/prepare-pdf-classroom-run.mjs")) {
  const args = process.argv.slice(2);
  const directory = args[0];
  const output = args[1];
  const value = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  if (!directory || !output || !value("--start-url") || !value("--source-url-prefix")) {
    console.error("Usage: node scripts/prepare-pdf-classroom-run.mjs pdf-directory output.json --start-url url --source-url-prefix url");
    process.exitCode = 2;
  } else {
    try {
      const prepared = preparePdfClassroomRun({ directory, startUrl: value("--start-url"), sourceUrlPrefix: value("--source-url-prefix") });
      const parsed = path.parse(output);
      const files = prepared.batches.map((batch, index) => {
        const file = path.join(parsed.dir, `${parsed.name}.part-${String(index + 1).padStart(3, "0")}${parsed.ext || ".json"}`);
        const contents = JSON.stringify(batch, null, 2);
        return { file, contents, sha256: createHash("sha256").update(contents).digest("hex"), sources: batch.sources.length, links: batch.sources.reduce((count, source) => count + source.links.length, 0) };
      });
      const manifestPath = path.join(parsed.dir, `${parsed.name}.manifest.json`);
      if ([...files.map((item) => item.file), manifestPath].some((file) => existsSync(file))) throw new Error("classroom_output_exists");
      for (const item of files) writePrivate(item.file, item.contents);
      const skipped = prepared.batches.reduce((count, batch) => count + batch.skipped.length, 0);
      writePrivate(manifestPath, JSON.stringify({
        version: 1,
        startUrl: new URL(value("--start-url")).toString(),
        sources: prepared.coverage.importedSourceSegments,
        links: prepared.coverage.importedLinks,
        skipped,
        sourceUrlPrefix: new URL(value("--source-url-prefix")).toString(),
        coverage: prepared.coverage,
        files: prepared.files,
        batches: files.map(({ file, sha256, sources, links }) => ({ file, sha256, sources, links })),
      }, null, 2));
      console.log(JSON.stringify({ manifest: manifestPath, ...prepared.coverage, batches: files.length }));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "pdf_classroom_run_failed");
      process.exitCode = 1;
    }
  }
}
