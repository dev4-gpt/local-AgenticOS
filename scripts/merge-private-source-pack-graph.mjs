import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mergeSkoolSourcePackGraph, privateGraphArtifactPath } from "./import-skool-register-graph.mjs";
import { validatePortableKnowledgeGraph } from "./portable-knowledge-graph.mjs";

const [baseCandidate, sourcePackCandidate, outputCandidate] = process.argv.slice(2);
if (!baseCandidate || !sourcePackCandidate || !outputCandidate) {
  console.error("Usage: node scripts/merge-private-source-pack-graph.mjs base.jsonld source-pack.jsonld output.jsonld");
  process.exitCode = 2;
} else {
  try {
    const basePath = privateGraphArtifactPath(baseCandidate);
    const sourcePackPath = privateGraphArtifactPath(sourcePackCandidate);
    const outputPath = privateGraphArtifactPath(outputCandidate);
    if (existsSync(outputPath)) throw new Error("output_exists");
    const base = JSON.parse(readFileSync(basePath, "utf8"));
    const sourcePack = JSON.parse(readFileSync(sourcePackPath, "utf8"));
    validatePortableKnowledgeGraph(base);
    validatePortableKnowledgeGraph(sourcePack);
    const merged = mergeSkoolSourcePackGraph(base, sourcePack);
    const validation = validatePortableKnowledgeGraph(merged);
    writeFileSync(outputPath, JSON.stringify(merged), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ output: outputCandidate, ...validation, imports: merged.provenance.sourcePackImports.length }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "private_graph_merge_failed");
    process.exitCode = 1;
  }
}
