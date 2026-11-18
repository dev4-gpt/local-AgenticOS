import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isPrivateAddress } from "../src/lib/clientPrivateAddress.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const SENSITIVE_QUERY_KEY = /^(?:api_?key|access_?token|refresh_?token|id_?token|token|secret|password|code|signature|sig|auth|authorization|jwt|session|session_?id|awsaccesskeyid|googleaccessid|key_pair_id|x_(?:amz|goog)_(?:algorithm|credential|date|expires|security_token|signature|signedheaders))$/i;

function unsafeLink(urlValue) {
  try {
    const url = new URL(urlValue);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return !["http:", "https:"].includes(url.protocol) || Boolean(url.username || url.password)
      || !hostname || isPrivateAddress(hostname)
      || [...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key.replace(/[-\s]/g, "_")));
  } catch {
    return true;
  }
}

export function sanitizePrivateSourcePack(manifest, readBatch = readFileSync) {
  if (!manifest || !Array.isArray(manifest.batches) || !manifest.coverage || !Number.isInteger(manifest.coverage.importedLinks)) {
    throw new Error("source_manifest_invalid");
  }
  let omittedLinks = 0;
  let importedLinks = 0;
  let importedSourceSegments = 0;
  let skippedCount = 0;
  const batches = manifest.batches.map((entry) => {
    if (typeof entry.file !== "string" || path.isAbsolute(entry.file)) throw new Error("source_batch_path_invalid");
    const encoded = readBatch(entry.file);
    const text = Buffer.isBuffer(encoded) ? encoded.toString("utf8") : String(encoded);
    if (sha256(text) !== entry.sha256) throw new Error("source_batch_hash_mismatch");
    const pack = JSON.parse(text);
    if (!Array.isArray(pack.sources)) throw new Error("source_batch_invalid");
    let batchLinks = 0;
    let batchOmittedLinks = 0;
    const sources = pack.sources.map((source) => {
      if (!source || !Array.isArray(source.links)) throw new Error("source_record_invalid");
      const links = source.links.filter((link) => {
        if (!link || typeof link.url !== "string") throw new Error("source_link_invalid");
        if (unsafeLink(link.url)) {
          omittedLinks++;
          batchOmittedLinks++;
          return false;
        }
        batchLinks++;
        return true;
      });
      return { ...source, links };
    });
    importedLinks += batchLinks;
    importedSourceSegments += sources.length;
    const skipped = [...(Array.isArray(pack.skipped) ? pack.skipped : [])];
    if (batchOmittedLinks) skipped.push(`Security review omitted ${batchOmittedLinks} unsafe URL reference(s).`);
    skippedCount += skipped.length;
    return { pack: { ...pack, sources, skipped }, links: batchLinks, sourceCount: sources.length };
  });
  if (importedLinks + omittedLinks !== manifest.coverage.importedLinks) throw new Error("source_manifest_coverage_mismatch");
  if (importedSourceSegments !== manifest.coverage.importedSourceSegments) throw new Error("source_manifest_coverage_mismatch");
  return {
    batches,
    omittedLinks,
    skippedCount,
    coverage: {
      ...manifest.coverage,
      importedLinks,
      skippedReferences: (manifest.coverage.skippedReferences ?? 0) + omittedLinks,
    },
    securityReview: {
      policy: "unsafe_url_targets_omitted",
      omittedLinks,
      sourceTextPreserved: true,
      completeCommunityExport: false,
    },
  };
}

function privateDirectoryPath(value) {
  if (typeof value !== "string" || path.isAbsolute(value)) throw new Error("private_source_pack_path_required");
  const directory = path.resolve("tmp/authorized-skool-import");
  const resolved = path.resolve(value);
  if (path.dirname(resolved) !== directory || !/^[A-Za-z0-9._-]+$/.test(path.basename(resolved))) {
    throw new Error("private_source_pack_path_required");
  }
  return resolved;
}

function writePrivateNew(file, contents) {
  if (existsSync(file)) throw new Error("output_exists");
  writeFileSync(file, contents, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

if (process.argv[1]?.endsWith("/sanitize-private-source-pack.mjs")) {
  const [manifestCandidate, outputStemCandidate] = process.argv.slice(2);
  if (!manifestCandidate || !outputStemCandidate) {
    console.error("Usage: node scripts/sanitize-private-source-pack.mjs private.manifest.json output-stem");
    process.exitCode = 2;
  } else {
    try {
      const manifestPath = privateDirectoryPath(manifestCandidate);
      const outputStem = privateDirectoryPath(outputStemCandidate);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const result = sanitizePrivateSourcePack(manifest, (file) => {
        const batchPath = privateDirectoryPath(file);
        return readFileSync(batchPath);
      });
      const batches = result.batches.map((batch, index) => {
        const suffix = String(index + 1).padStart(3, "0");
        const file = `${outputStem}.part-${suffix}.json`;
        const encoded = JSON.stringify(batch.pack, null, 2);
        writePrivateNew(file, encoded);
        return { file: path.relative(process.cwd(), file), sha256: sha256(encoded), sources: batch.sourceCount, links: batch.links };
      });
      const outputManifest = {
        ...manifest,
        sources: result.coverage.importedSourceSegments,
        links: result.coverage.importedLinks,
        skipped: result.skippedCount,
        coverage: result.coverage,
        securityReview: result.securityReview,
        batches,
      };
      const manifestOutput = `${outputStem}.manifest.json`;
      writePrivateNew(manifestOutput, JSON.stringify(outputManifest, null, 2));
      console.log(JSON.stringify({ manifest: manifestOutput, sources: result.coverage.importedSourceSegments, links: result.coverage.importedLinks, omittedLinks: result.omittedLinks, skipped: result.skippedCount, batches: batches.length }));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "source_pack_sanitization_failed");
      process.exitCode = 1;
    }
  }
}
