import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { validatePortableKnowledgeGraph } from "../scripts/portable-knowledge-graph.mjs";

const seedPath = path.join(process.cwd(), "docs/oneday-content-library-graph-seed.jsonld");

test("portable Oneday seed has resolved, safe relations and explicitly partial coverage", () => {
  const graph = JSON.parse(readFileSync(seedPath, "utf8"));
  expect(validatePortableKnowledgeGraph(graph)).toMatchObject({
    nodeCount: 9,
    relationCount: 12,
    explicitEdgeCount: 0,
    coverage: "partial",
    graphFormat: "JSON-LD",
  });
});

test("portable graph rejects dangling relations, secret URLs, and duplicate IDs", () => {
  const source = JSON.parse(readFileSync(seedPath, "utf8"));
  const dangling = structuredClone(source);
  dangling["@graph"][1].teaches[0] = "https://www.oneday.org/knowledge/topic/missing";
  expect(() => validatePortableKnowledgeGraph(dangling)).toThrow("portable_graph_reference_unresolved");

  const secretUrl = structuredClone(source);
  secretUrl["@graph"][0].url = "https://www.oneday.org/library?api_key=not-for-logs";
  expect(() => validatePortableKnowledgeGraph(secretUrl)).toThrow("portable_graph_url_invalid");

  const duplicate = structuredClone(source);
  duplicate["@graph"][1].id = duplicate["@graph"][0].id;
  expect(() => validatePortableKnowledgeGraph(duplicate)).toThrow("portable_graph_node_duplicate");
});
