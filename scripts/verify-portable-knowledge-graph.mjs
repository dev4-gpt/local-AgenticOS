import { readFileSync } from "node:fs";
import { validatePortableKnowledgeGraph } from "./portable-knowledge-graph.mjs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/verify-portable-knowledge-graph.mjs graph.jsonld");
  process.exitCode = 2;
} else {
  try {
    const report = validatePortableKnowledgeGraph(JSON.parse(readFileSync(file, "utf8")));
    console.log(JSON.stringify({ file, ...report }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "portable_graph_invalid");
    process.exitCode = 1;
  }
}
