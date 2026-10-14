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

function calendarDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("classroom_published_date_invalid");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error("classroom_published_date_invalid");
  return value;
}

export function prepareClassroomSourcePack(run) {
  if (!run || typeof run !== "object" || typeof run.startUrl !== "string" || !Array.isArray(run.sources) || !run.sources.length) {
    throw new Error("classroom_run_invalid");
  }
  const startUrl = safeExportUrl(run.startUrl);
  const ids = new Set();
  const identities = new Set();
  const sourceDates = new Map();
  const sources = [];
  let inputLinks = 0;
  let mediaReferences = 0;
  const mediaOnlySourceIds = [];
  const pageTextMissingSourceIds = [];
  let transcriptSegments = 0;
  let transcriptCharacters = 0;
  for (const source of run.sources) {
    if (!source || typeof source.title !== "string" || !source.title.trim() || source.title.trim().length > 240
      || typeof source.url !== "string" || (source.text !== undefined && typeof source.text !== "string")
      || SECRET_LIKE.test(`${source.title}\n${source.text ?? ""}`)
      || (source.links !== undefined && !Array.isArray(source.links))
      || (source.collectedAt !== undefined && (typeof source.collectedAt !== "string" || Number.isNaN(Date.parse(source.collectedAt))))) {
      throw new Error("classroom_source_invalid");
    }
    if ((source.media !== undefined && !Array.isArray(source.media))
      || (source.transcripts !== undefined && !Array.isArray(source.transcripts))
      || (source.video_page_links !== undefined && !Array.isArray(source.video_page_links))) {
      throw new Error("classroom_media_invalid");
    }
    const url = safeExportUrl(source.url);
    const label = typeof source.tab === "string" && source.tab.trim() ? source.tab.trim() : "Page";
    if (SECRET_LIKE.test(label)) throw new Error("classroom_source_invalid");
    const identity = JSON.stringify([url, label]);
    const id = source.id === undefined ? `src_${createHash("sha256").update(identity).digest("hex").slice(0, 20)}` : source.id;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw new Error("classroom_source_invalid");
    if (identities.has(identity)) throw new Error("classroom_source_duplicate_page");
    identities.add(identity);
    sourceDates.set(identity, source.publishedAt === undefined ? null : calendarDay(source.publishedAt));
    ids.add(id);
    const mediaLinks = (source.media ?? []).map((item) => {
      if (!item || typeof item !== "object" || !["video", "audio", "image", "embed", "file"].includes(item.kind)
        || typeof item.title !== "string" || !item.title.trim() || item.title.trim().length > 280
        || SECRET_LIKE.test(item.title)) throw new Error("classroom_media_invalid");
      return { url: item.url, text: `${item.kind === "embed" ? "Embed" : "Media"}: ${item.title.trim()}` };
    });
    const videoLinks = (source.video_page_links ?? []).map((value) => {
      if (typeof value !== "string") throw new Error("classroom_media_invalid");
      return { url: value, text: "Media: Video page" };
    });
    const transcripts = (source.transcripts ?? []).flatMap((item) => {
      if (!item || typeof item !== "object" || typeof item.text !== "string" || !item.text.trim()
        || item.text.length > 500_000 || SECRET_LIKE.test(item.text)
        || (item.title !== undefined && (typeof item.title !== "string" || !item.title.trim() || item.title.length > 280 || SECRET_LIKE.test(item.title)))
        || (item.collectedAt !== undefined && (typeof item.collectedAt !== "string" || Number.isNaN(Date.parse(item.collectedAt))))) {
        throw new Error("classroom_transcript_invalid");
      }
      const transcriptUrl = safeExportUrl(item.url);
      const segments = textChunks(item.text.trim());
      transcriptSegments += segments.length;
      transcriptCharacters += item.text.trim().length;
      return segments.map((text, index) => ({
        url: transcriptUrl,
        title: item.title?.trim() || source.title.trim(),
        text,
        segment: index + 1,
        segmentCount: segments.length,
        ...(item.collectedAt ? { collectedAt: item.collectedAt } : {}),
      }));
    });
    const suppliedLinks = [...(source.links ?? []), ...mediaLinks, ...videoLinks];
    if (!source.text?.trim() && !mediaLinks.length && !videoLinks.length && !transcripts.length) throw new Error("classroom_source_invalid");
    if (!source.text?.trim()) {
      pageTextMissingSourceIds.push(id);
      if (!transcripts.length) mediaOnlySourceIds.push(id);
    }
    inputLinks += suppliedLinks.length;
    const safeLinks = suppliedLinks.map((link) => {
      if (!link || typeof link !== "object" || typeof link.text !== "string"
        || link.text.trim().length > 300 || SECRET_LIKE.test(link.text)) throw new Error("classroom_link_invalid");
      const linkUrl = safeExportUrl(link.url);
      const text = link.text.trim();
      if (/^(?:Media|Embed):\s/.test(text)) mediaReferences += 1;
      return { url: linkUrl, text };
    });
    const text = textChunks(source.text?.trim() || "[No lesson text or transcript supplied in the authorized export.]");
    const links = [];
    for (let start = 0; start < safeLinks.length; start += MAX_LINKS_PER_SOURCE) {
      links.push(safeLinks.slice(start, start + MAX_LINKS_PER_SOURCE));
    }
    const count = Math.max(text.length, links.length);
    const publishedAt = sourceDates.get(identity);
    for (let index = 0; index < count; index += 1) {
      const suffix = ` [${id}:${index + 1}/${count}]`;
      sources.push({
        title: source.title.trim(),
        url,
        tab: `${label.slice(0, 240 - suffix.length)}${suffix}`,
        text: text[index] ?? text[0].slice(0, 1_000),
        ...(publishedAt ? { publishedAt } : {}),
        collectedAt: source.collectedAt,
        links: links[index] ?? [],
        ...(index === 0 && transcripts.length ? { transcripts } : {}),
      });
    }
  }
  if (run.skipped !== undefined && (!Array.isArray(run.skipped) || run.skipped.some((item) => typeof item !== "string" || !item.trim() || item.length > 512 || SECRET_LIKE.test(item)))) {
    throw new Error("classroom_skipped_entries_invalid");
  }
  if (run.pending !== undefined && (!Array.isArray(run.pending) || run.pending.some((item) => typeof item !== "string" || !item.trim()))) {
    throw new Error("classroom_pending_entries_invalid");
  }
  let declaredInventory = null;
  if (run.expected !== undefined) {
    const expected = run.expected;
    if (!expected || typeof expected !== "object" || !Array.isArray(expected.pages)
      || !expected.pages.length || expected.pages.length > 10_000) throw new Error("classroom_expected_inventory_invalid");
    const firstPublishedDate = calendarDay(expected.firstPublishedDate);
    const lastPublishedDate = calendarDay(expected.lastPublishedDate);
    if (firstPublishedDate > lastPublishedDate) throw new Error("classroom_expected_inventory_invalid");
    const declared = new Set();
    const missingPages = [];
    const undeclaredPages = [];
    const missingDates = [];
    const outsideWindow = [];
    const observedDates = [];
    for (const page of expected.pages) {
      if (!page || typeof page !== "object" || (page.tab !== undefined && (typeof page.tab !== "string" || !page.tab.trim() || SECRET_LIKE.test(page.tab)))) throw new Error("classroom_expected_inventory_invalid");
      const url = safeExportUrl(page.url);
      const tab = page.tab?.trim() || "Page";
      const identity = JSON.stringify([url, tab]);
      if (declared.has(identity)) throw new Error("classroom_expected_inventory_invalid");
      declared.add(identity);
      if (!sourceDates.has(identity)) {
        missingPages.push({ url, tab });
        continue;
      }
      const publishedAt = sourceDates.get(identity);
      if (!publishedAt) missingDates.push({ url, tab });
      else if (publishedAt < firstPublishedDate || publishedAt > lastPublishedDate) outsideWindow.push({ url, tab, publishedAt });
      else observedDates.push(publishedAt);
    }
    for (const identity of identities) {
      if (!declared.has(identity)) {
        const [url, tab] = JSON.parse(identity);
        undeclaredPages.push({ url, tab });
      }
    }
    const observedFirstDate = observedDates.length ? observedDates.sort()[0] : null;
    const observedLastDate = observedDates.length ? observedDates.at(-1) : null;
    declaredInventory = {
      expectedPages: expected.pages.length,
      matchedPages: expected.pages.length - missingPages.length,
      missingPages,
      undeclaredPages,
      missingDates,
      outsideWindow,
      firstPublishedDate,
      lastPublishedDate,
      observedFirstDate,
      observedLastDate,
      allDeclaredPagesPresent: missingPages.length === 0,
      declaredDateWindowMatched: missingPages.length === 0 && undeclaredPages.length === 0 && missingDates.length === 0 && outsideWindow.length === 0
        && observedFirstDate === firstPublishedDate && observedLastDate === lastPublishedDate,
    };
  }
  const skipped = [...(run.skipped ?? [])];
  if (mediaOnlySourceIds.length) skipped.push(`${mediaOnlySourceIds.length} media-only ${mediaOnlySourceIds.length === 1 ? "source has" : "sources have"} no lesson text or transcript; review mediaOnlySourceIds in the private manifest`);
  if (pageTextMissingSourceIds.length && pageTextMissingSourceIds.length > mediaOnlySourceIds.length) skipped.push(`${pageTextMissingSourceIds.length - mediaOnlySourceIds.length} source(s) have transcript text but no captured lesson-page text; review pageTextMissingSourceIds in the private manifest`);
  if (Array.isArray(run.pending) && run.pending.length) skipped.push(`${run.pending.length} discovered pages remain uncollected`);
  if (!Array.isArray(run.pending)) skipped.push("Collection coverage unknown: no pending-page inventory in source run");
  if (declaredInventory?.missingPages.length) skipped.push(`${declaredInventory.missingPages.length} ${declaredInventory.missingPages.length === 1 ? "page is" : "pages are"} missing from the declared owner inventory; review the private manifest`);
  if (declaredInventory?.undeclaredPages.length) skipped.push(`${declaredInventory.undeclaredPages.length} ${declaredInventory.undeclaredPages.length === 1 ? "page is" : "pages are"} not in the declared owner inventory; review the private manifest`);
  if (declaredInventory && !declaredInventory.declaredDateWindowMatched) skipped.push("Declared publication-date window is not fully supported by this export; review the private manifest");
  const batches = splitMarkdownSourcePack({ startUrl, skipped, sources });
  if (batches.length > 100) throw new Error("classroom_batch_limit_exceeded");
  const outputLinks = batches.reduce((total, batch) => total + batch.sources.reduce((sum, source) => sum + source.links.length, 0), 0);
  if (outputLinks !== inputLinks) throw new Error("classroom_link_loss");
  return {
    batches,
    coverage: {
      inputSources: run.sources.length,
      outputSources: sources.length,
      publicationDates: sources.filter((source) => source.publishedAt !== undefined).length,
      inputLinks,
      outputLinks,
      mediaReferences,
      transcriptSegments,
      transcriptCharacters,
      mediaOnlySources: mediaOnlySourceIds.length,
      mediaOnlySourceIds,
      pageTextMissingSourceIds,
      skippedPages: Array.isArray(run.skipped) ? run.skipped.length : null,
      pendingPages: Array.isArray(run.pending) ? run.pending.length : null,
      discoveredQueueExhausted: Array.isArray(run.pending) && run.pending.length === 0,
      declaredInventory,
    },
  };
}

export function assertCompleteClassroomCoverage(coverage) {
  const inventory = coverage?.declaredInventory;
  if (!inventory || !inventory.declaredDateWindowMatched || !coverage.discoveredQueueExhausted
    || coverage.skippedPages !== 0 || coverage.mediaOnlySources !== 0) {
    throw new Error("classroom_export_incomplete");
  }
}

function writePrivateFile(file, contents) {
  writeFileSync(file, contents, { flag: "wx", mode: 0o600 });
}

if (process.argv[1]?.endsWith("/prepare-classroom-source-pack.mjs")) {
  const args = process.argv.slice(2);
  const requireComplete = args.includes("--require-complete");
  const [input, output] = args.filter((arg) => arg !== "--require-complete");
  if (!input || !output) {
    console.error("Usage: node scripts/prepare-classroom-source-pack.mjs classroom-run.json output.json [--require-complete]");
    process.exitCode = 2;
  } else {
    const raw = readFileSync(input);
    const { batches, coverage } = prepareClassroomSourcePack(JSON.parse(raw.toString("utf8")));
    if (requireComplete) assertCompleteClassroomCoverage(coverage);
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
    const { declaredInventory, mediaOnlySourceIds, ...counts } = coverage;
    console.log(JSON.stringify({ manifest, coverage: {
      ...counts,
      mediaOnlySourceIdsCount: mediaOnlySourceIds.length,
      declaredInventory: declaredInventory && {
        expectedPages: declaredInventory.expectedPages,
        matchedPages: declaredInventory.matchedPages,
        missingPages: declaredInventory.missingPages.length,
        undeclaredPages: declaredInventory.undeclaredPages.length,
        missingDates: declaredInventory.missingDates.length,
        outsideWindow: declaredInventory.outsideWindow.length,
        declaredDateWindowMatched: declaredInventory.declaredDateWindowMatched,
      },
    }, batches: files.length }));
  }
}
