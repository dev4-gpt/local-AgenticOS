import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { splitMarkdownSourcePack } from "./prepare-markdown-source-pack.mjs";

const MAX_TEXT_LENGTH = 30_000;
const MAX_LINKS_PER_SOURCE = 100;
const SENSITIVE_QUERY_KEY = /^(?:api_?key|access_?token|refresh_?token|id_?token|token|secret|password|code|signature|sig|auth|authorization|jwt|session|session_?id|awsaccesskeyid|googleaccessid|key_pair_id|x_(?:amz|goog)_(?:algorithm|credential|date|expires|security_token|signature|signedheaders))$/i;
const SECRET_LIKE = /(api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token)\s*[:=]\s*[^\s]{4,}|\b(?:sk|rk|ghp|xai)-[A-Za-z0-9_-]{16,}\b/i;

function safeExportUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || SECRET_LIKE.test(value)) throw new Error("classroom_url_invalid");
  let url;
  try { url = new URL(value); } catch { throw new Error("classroom_url_invalid"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname
    || [...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key.replace(/[-\s]/g, "_")))) {
    throw new Error("classroom_url_invalid");
  }
  url.hash = "";
  return url.toString();
}

function textChunks(text) {
  const chunks = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + MAX_TEXT_LENGTH, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

export function prepareClassroomSourcePack(run) {
  if (!run || typeof run !== "object" || typeof run.startUrl !== "string" || !Array.isArray(run.sources) || !run.sources.length) {
    throw new Error("classroom_run_invalid");
  }
  const startUrl = safeExportUrl(run.startUrl);
  const ids = new Set();
  const identities = new Set();
  const sources = [];
  let inputLinks = 0;
  let mediaReferences = 0;
  for (const source of run.sources) {
    if (!source || typeof source.title !== "string" || !source.title.trim() || source.title.trim().length > 240
      || typeof source.url !== "string" || typeof source.text !== "string" || !source.text.trim()
      || SECRET_LIKE.test(`${source.title}\n${source.text}`) || !Array.isArray(source.links)
      || (source.collectedAt !== undefined && (typeof source.collectedAt !== "string" || Number.isNaN(Date.parse(source.collectedAt))))) {
      throw new Error("classroom_source_invalid");
    }
    const url = safeExportUrl(source.url);
    const label = typeof source.tab === "string" && source.tab.trim() ? source.tab.trim() : "Page";
    if (SECRET_LIKE.test(label)) throw new Error("classroom_source_invalid");
    const identity = JSON.stringify([url, label]);
    const id = source.id === undefined ? `src_${createHash("sha256").update(identity).digest("hex").slice(0, 20)}` : source.id;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw new Error("classroom_source_invalid");
    if (identities.has(identity)) throw new Error("classroom_source_duplicate_page");
    identities.add(identity);
    ids.add(id);
    inputLinks += source.links.length;
    const safeLinks = source.links.map((link) => {
      if (!link || typeof link !== "object" || typeof link.text !== "string"
        || link.text.trim().length > 300 || SECRET_LIKE.test(link.text)) throw new Error("classroom_link_invalid");
      const linkUrl = safeExportUrl(link.url);
      const text = link.text.trim();
      if (/^(?:Media|Embed):\s/.test(text)) mediaReferences += 1;
      return { url: linkUrl, text };
    });
    const text = textChunks(source.text.trim());
    const links = [];
    for (let start = 0; start < safeLinks.length; start += MAX_LINKS_PER_SOURCE) {
      links.push(safeLinks.slice(start, start + MAX_LINKS_PER_SOURCE));
    }
    const count = Math.max(text.length, links.length);
    for (let index = 0; index < count; index += 1) {
      const suffix = ` [${id}:${index + 1}/${count}]`;
      sources.push({
        title: source.title.trim(),
        url,
        tab: `${label.slice(0, 240 - suffix.length)}${suffix}`,
        text: text[index] ?? text[0].slice(0, 1_000),
        collectedAt: source.collectedAt,
        links: links[index] ?? [],
      });
    }
  }
  if (run.skipped !== undefined && (!Array.isArray(run.skipped) || run.skipped.some((item) => typeof item !== "string" || !item.trim() || item.length > 512 || SECRET_LIKE.test(item)))) {
    throw new Error("classroom_skipped_entries_invalid");
  }
  if (run.pending !== undefined && (!Array.isArray(run.pending) || run.pending.some((item) => typeof item !== "string" || !item.trim()))) {
    throw new Error("classroom_pending_entries_invalid");
  }
  const skipped = [...(run.skipped ?? [])];
  if (Array.isArray(run.pending) && run.pending.length) skipped.push(`${run.pending.length} discovered pages remain uncollected`);
  if (!Array.isArray(run.pending)) skipped.push("Collection coverage unknown: no pending-page inventory in source run");
  const batches = splitMarkdownSourcePack({ startUrl, skipped, sources });
  if (batches.length > 100) throw new Error("classroom_batch_limit_exceeded");
  const outputLinks = batches.reduce((total, batch) => total + batch.sources.reduce((sum, source) => sum + source.links.length, 0), 0);
  if (outputLinks !== inputLinks) throw new Error("classroom_link_loss");
  return {
    batches,
    coverage: {
      inputSources: run.sources.length,
      outputSources: sources.length,
      inputLinks,
      outputLinks,
      mediaReferences,
      skippedPages: Array.isArray(run.skipped) ? run.skipped.length : null,
      pendingPages: Array.isArray(run.pending) ? run.pending.length : null,
      discoveredQueueExhausted: Array.isArray(run.pending) && run.pending.length === 0,
    },
  };
}

function writePrivateFile(file, contents) {
  writeFileSync(file, contents, { flag: "wx", mode: 0o600 });
}

if (process.argv[1]?.endsWith("/prepare-classroom-source-pack.mjs")) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("Usage: node scripts/prepare-classroom-source-pack.mjs classroom-run.json output.json");
    process.exitCode = 2;
  } else {
    const raw = readFileSync(input);
    const { batches, coverage } = prepareClassroomSourcePack(JSON.parse(raw.toString("utf8")));
    const parsed = path.parse(output);
    const files = batches.map((batch, index) => {
      const file = path.join(parsed.dir, `${parsed.name}.part-${String(index + 1).padStart(3, "0")}${parsed.ext || ".json"}`);
      const encoded = JSON.stringify(batch, null, 2);
      return { file, encoded, sha256: createHash("sha256").update(encoded).digest("hex"), sources: batch.sources.length, links: batch.sources.reduce((sum, source) => sum + source.links.length, 0) };
    });
    const manifest = path.join(parsed.dir, `${parsed.name}.manifest.json`);
    const outputs = [...files.map((file) => file.file), manifest];
    if (outputs.some((file) => existsSync(file))) throw new Error("classroom_output_exists");
    for (const file of files) writePrivateFile(file.file, file.encoded);
    writePrivateFile(manifest, JSON.stringify({
      version: 1,
      inputSha256: createHash("sha256").update(raw).digest("hex"),
      startUrl: batches[0].startUrl,
      sources: coverage.outputSources,
      links: coverage.outputLinks,
      skipped: batches.reduce((count, batch) => count + batch.skipped.length, 0),
      coverage,
      batches: files.map(({ file, sha256, sources, links }) => ({ file, sha256, sources, links })),
    }, null, 2));
    console.log(JSON.stringify({ manifest, coverage, batches: files.length }));
  }
}
