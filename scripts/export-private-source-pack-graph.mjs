import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function buildPrivateSourcePackGraph(manifest, read = readFileSync, projectRoot = process.cwd()) {
  if (!manifest || !Array.isArray(manifest.batches) || !manifest.coverage) throw new Error("source_manifest_invalid");
  const nodes = new Map();
  const edges = [];
  const batchHashes = [];
  const expectedSources = manifest.coverage.importedSourceSegments ?? manifest.coverage.outputSources;
  const expectedLinks = manifest.coverage.importedLinks ?? manifest.coverage.outputLinks;
  const mediaOnlySourceIds = new Set(manifest.coverage.mediaOnlySourceIds ?? []);
  const pageTextMissingSourceIds = new Set(manifest.coverage.pageTextMissingSourceIds ?? manifest.coverage.mediaOnlySourceIds ?? []);
  const observedMediaOnlySourceIds = new Set();
  const observedPageTextMissingSourceIds = new Set();
  let sourceCount = 0;
  let linkCount = 0;
  let textSourceCount = 0;
  let mediaOnlySourceCount = 0;
  let pageTextMissingSourceCount = 0;
  let transcriptSegmentCount = 0;
  let transcriptCharacterCount = 0;

  for (const batch of manifest.batches) {
    if (typeof batch.file !== "string" || path.isAbsolute(batch.file)) throw new Error("source_batch_path_invalid");
    const projectPath = path.resolve(projectRoot, batch.file);
    const relativePath = path.relative(projectRoot, projectPath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) throw new Error("source_batch_path_invalid");
    const encoded = read(projectPath);
    const contents = Buffer.isBuffer(encoded) ? encoded.toString("utf8") : String(encoded);
    if (sha256(contents) !== batch.sha256) throw new Error("source_batch_hash_mismatch");
    const pack = JSON.parse(contents);
    if (!Array.isArray(pack.sources)) throw new Error("source_batch_invalid");
    batchHashes.push(batch.sha256);

    for (const source of pack.sources) {
      if (typeof source.title !== "string" || typeof source.text !== "string" || typeof source.url !== "string" || !Array.isArray(source.links)) {
        throw new Error("source_record_invalid");
      }
      const documentId = `document:${sha256(`${source.url}\n${source.tab ?? source.title}`)}`;
      const sourceIdentity = source.tab?.match(/\[([A-Za-z0-9_-]+):\d+\/\d+\]$/)?.[1];
      const mediaOnly = sourceIdentity !== undefined && mediaOnlySourceIds.has(sourceIdentity);
      const pageTextMissing = sourceIdentity !== undefined && pageTextMissingSourceIds.has(sourceIdentity);
      if (mediaOnly) observedMediaOnlySourceIds.add(sourceIdentity);
      if (pageTextMissing) observedPageTextMissingSourceIds.add(sourceIdentity);
      nodes.set(documentId, {
        "@id": documentId,
        "@type": "LearningResource",
        name: source.title,
        url: source.url,
        identifier: source.tab ?? source.title,
        ...(pageTextMissing
          ? { contentStatus: "metadata_only", pageTextCaptured: false }
          : { text: source.text, contentStatus: "text_segments_available", pageTextCaptured: true }),
        ...(source.publishedAt ? { datePublished: source.publishedAt } : {}),
        ...(source.collectedAt ? { dateCreated: source.collectedAt } : {}),
      });
      if (pageTextMissing) {
        pageTextMissingSourceCount++;
        if (mediaOnly) mediaOnlySourceCount++;
      } else textSourceCount++;
      const sourceUrlId = `url:${sha256(source.url)}`;
      if (!nodes.has(sourceUrlId)) nodes.set(sourceUrlId, { "@id": sourceUrlId, "@type": "URL", url: source.url });
      edges.push({ "@type": "source_at", source: documentId, target: sourceUrlId });
      sourceCount++;

      for (const link of source.links) {
        if (!link || typeof link.url !== "string" || typeof link.text !== "string") throw new Error("source_link_invalid");
        const targetId = `url:${sha256(link.url)}`;
        const isMedia = /^Media:\s/i.test(link.text) || /^Embed:\s/i.test(link.text);
        const isVideo = isMedia && /(?:youtube\.com|youtu\.be)\//i.test(link.url);
        if (!nodes.has(targetId)) nodes.set(targetId, {
          "@id": targetId,
          "@type": isVideo ? "VideoObject" : "URL",
          url: link.url,
          ...(isMedia ? { name: link.text.replace(/^(?:Media|Embed):\s*/i, "") } : {}),
          ...(isMedia ? { mediaBytesCaptured: false } : {}),
        });
        edges.push({ "@type": isMedia ? (isVideo ? "hasVideoReference" : "hasMediaReference") : "links_to", source: documentId, target: targetId, name: link.text });
        linkCount++;
      }

      if (source.transcripts !== undefined && !Array.isArray(source.transcripts)) throw new Error("source_transcript_invalid");
      for (const transcript of source.transcripts ?? []) {
        if (!transcript || typeof transcript.url !== "string" || typeof transcript.title !== "string"
          || typeof transcript.text !== "string" || !transcript.text.trim()
          || !Number.isInteger(transcript.segment) || !Number.isInteger(transcript.segmentCount)
          || transcript.segment < 1 || transcript.segment > transcript.segmentCount) {
          throw new Error("source_transcript_invalid");
        }
        const videoId = `url:${sha256(transcript.url)}`;
        if (!nodes.has(videoId)) nodes.set(videoId, {
          "@id": videoId,
          "@type": /(?:youtube\.com|youtu\.be)\//i.test(transcript.url) ? "VideoObject" : "MediaObject",
          url: transcript.url,
          name: transcript.title,
          mediaBytesCaptured: false,
        });
        const transcriptId = `transcript:${sha256(`${transcript.url}\n${source.url}\n${transcript.segment}`)}`;
        nodes.set(transcriptId, {
          "@id": transcriptId,
          "@type": "Transcript",
          name: transcript.title,
          text: transcript.text,
          contentStatus: "transcript_available",
          segment: transcript.segment,
          segmentCount: transcript.segmentCount,
          ...(transcript.collectedAt ? { dateCreated: transcript.collectedAt } : {}),
        });
        edges.push({ "@type": "hasTranscript", source: videoId, target: transcriptId });
        edges.push({ "@type": "transcript_of", source: transcriptId, target: documentId });
        transcriptSegmentCount++;
        transcriptCharacterCount += transcript.text.length;
      }
    }
  }

  if (sourceCount !== expectedSources || linkCount !== expectedLinks) {
    throw new Error("source_manifest_coverage_mismatch");
  }
  if ([...mediaOnlySourceIds].some((id) => !observedMediaOnlySourceIds.has(id))) {
    throw new Error("source_manifest_media_only_mismatch");
  }
  if ([...pageTextMissingSourceIds].some((id) => !observedPageTextMissingSourceIds.has(id))) {
    throw new Error("source_manifest_page_text_missing_mismatch");
  }
  return {
    "@context": "https://schema.org",
    "@graph": [...nodes.values()],
    edges,
    provenance: {
      source: manifest.startUrl,
      format: "agentos-private-source-graph-v1",
      coverage: manifest.coverage,
      sourceSegments: sourceCount,
      textSourceSegments: textSourceCount,
      mediaOnlySourceSegments: mediaOnlySourceCount,
      pageTextMissingSourceSegments: pageTextMissingSourceCount,
      transcriptSegments: transcriptSegmentCount,
      transcriptCharacters: transcriptCharacterCount,
      links: linkCount,
      batchSha256: batchHashes,
      complete: manifest.coverage.completeCommunityExport === true && manifest.coverage.discoveredQueueExhausted === true,
      videoAssetsIncluded: false,
    },
  };
}

function writePrivateFile(file, contents) {
  if (existsSync(file)) chmodSync(file, 0o600);
  writeFileSync(file, contents, { mode: 0o600 });
}

if (process.argv[1]?.endsWith("/export-private-source-pack-graph.mjs")) {
  const [manifestPath, outputPath] = process.argv.slice(2);
  if (!manifestPath || !outputPath) {
    console.error("Usage: node scripts/export-private-source-pack-graph.mjs manifest.json output.jsonld");
    process.exitCode = 2;
  } else {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const graph = buildPrivateSourcePackGraph(manifest);
    writePrivateFile(outputPath, JSON.stringify(graph));
    console.log(JSON.stringify({ output: outputPath, nodes: graph["@graph"].length, edges: graph.edges.length, ...graph.provenance }));
  }
}
