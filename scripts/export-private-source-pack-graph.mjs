import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function buildPrivateSourcePackGraph(manifest, read = readFileSync, projectRoot = process.cwd()) {
  if (!manifest || !Array.isArray(manifest.batches) || !manifest.coverage) throw new Error("source_manifest_invalid");
  const nodes = new Map();
  const edges = [];
  const batchHashes = [];
  let sourceCount = 0;
  let linkCount = 0;

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
      nodes.set(documentId, {
        "@id": documentId,
        "@type": "LearningResource",
        name: source.title,
        text: source.text,
        url: source.url,
        identifier: source.tab ?? source.title,
      });
      const sourceUrlId = `url:${sha256(source.url)}`;
      if (!nodes.has(sourceUrlId)) nodes.set(sourceUrlId, { "@id": sourceUrlId, "@type": "URL", url: source.url });
      edges.push({ "@type": "source_at", source: documentId, target: sourceUrlId });
      sourceCount++;

      for (const link of source.links) {
        if (!link || typeof link.url !== "string" || typeof link.text !== "string") throw new Error("source_link_invalid");
        const targetId = `url:${sha256(link.url)}`;
        if (!nodes.has(targetId)) nodes.set(targetId, { "@id": targetId, "@type": "URL", url: link.url });
        edges.push({ "@type": "links_to", source: documentId, target: targetId, name: link.text });
        linkCount++;
      }
    }
  }

  if (sourceCount !== manifest.coverage.importedSourceSegments || linkCount !== manifest.coverage.importedLinks) {
    throw new Error("source_manifest_coverage_mismatch");
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
