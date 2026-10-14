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

  const localUrl = structuredClone(source);
  localUrl["@graph"][0].url = "http://127.0.0.1/private";
  expect(() => validatePortableKnowledgeGraph(localUrl)).toThrow("portable_graph_url_invalid");

  for (const privateUrl of ["https://admin.localhost/", "http://10.0.0.5/", "http://[::ffff:127.0.0.1]/"]) {
    const privateTarget = structuredClone(source);
    privateTarget["@graph"][0].url = privateUrl;
    expect(() => validatePortableKnowledgeGraph(privateTarget)).toThrow("portable_graph_url_invalid");
  }

  const duplicate = structuredClone(source);
  duplicate["@graph"][1].id = duplicate["@graph"][0].id;
  expect(() => validatePortableKnowledgeGraph(duplicate)).toThrow("portable_graph_node_duplicate");
});

test("AgentOS source graph uses its coverage provenance and validates explicit edge endpoints", () => {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      { "@id": "document:one", "@type": "LearningResource", url: "https://example.org/lesson" },
      { "@id": "url:two", "@type": "URL", url: "https://example.org/reference" },
    ],
    edges: [{ "@type": "links_to", source: "document:one", target: "url:two" }],
    provenance: {
      format: "agentos-private-source-graph-v1",
      complete: false,
      coverage: { completeCommunityExport: false, discoveredQueueExhausted: false },
    },
  };
  expect(validatePortableKnowledgeGraph(graph)).toMatchObject({
    nodeCount: 2,
    relationCount: 1,
    explicitEdgeCount: 1,
    coverage: "partial",
    graphFormat: "agentos-private-source-graph-v1",
  });
  graph.edges[0].target = "url:missing";
  expect(() => validatePortableKnowledgeGraph(graph)).toThrow("portable_graph_edge_invalid");
});

test("metadata-only graph register is partial unless provenance explicitly proves completeness", () => {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [{ "@id": "lesson:one", "@type": "LearningResource" }],
    edges: [],
    provenance: { format: "agentos-skool-register-graph-v1", complete: false },
  };
  expect(validatePortableKnowledgeGraph(graph)).toMatchObject({ coverage: "partial", nodeCount: 1 });
});
