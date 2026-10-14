const REFERENCE_FIELDS = ["source", "partOf", "relatedTo", "teaches"];
const SENSITIVE_QUERY_KEY = /(token|secret|auth|session|api[_-]?key|password|signature|^sig$)/i;

function values(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function referenceId(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value["@id"] === "string") return value["@id"];
  return null;
}

function safePublicUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && ![...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key));
  } catch {
    return false;
  }
}

export function validatePortableKnowledgeGraph(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input["@graph"]) || input["@graph"].length === 0) {
    throw new Error("portable_graph_nodes_invalid");
  }
  if (!input["@context"] || (typeof input["@context"] !== "string" && typeof input["@context"] !== "object")) {
    throw new Error("portable_graph_context_invalid");
  }
  if (!input.metadata || !["partial", "complete"].includes(input.metadata.coverage)) {
    throw new Error("portable_graph_coverage_invalid");
  }

  const nodes = new Map();
  for (const node of input["@graph"]) {
    const id = node?.id ?? node?.["@id"];
    const type = node?.type ?? node?.["@type"];
    if (!node || typeof id !== "string" || !id || typeof type !== "string" || !type) {
      throw new Error("portable_graph_node_invalid");
    }
    if (nodes.has(id)) throw new Error("portable_graph_node_duplicate");
    nodes.set(id, node);
    if (node.url !== undefined && !safePublicUrl(node.url)) throw new Error("portable_graph_url_invalid");
  }

  let relationCount = 0;
  for (const node of nodes.values()) {
    for (const field of REFERENCE_FIELDS) {
      for (const reference of values(node[field])) {
        const target = referenceId(reference);
        if (!target || !nodes.has(target)) throw new Error("portable_graph_reference_unresolved");
        relationCount++;
      }
    }
  }

  const edges = input.edges ?? [];
  if (!Array.isArray(edges)) throw new Error("portable_graph_edges_invalid");
  for (const edge of edges) {
    if (!edge || typeof edge["@type"] !== "string" || !nodes.has(edge.source) || !nodes.has(edge.target)) {
      throw new Error("portable_graph_edge_invalid");
    }
  }

  return {
    nodeCount: nodes.size,
    relationCount: relationCount + edges.length,
    explicitEdgeCount: edges.length,
    coverage: input.metadata.coverage,
    graphFormat: input.metadata.graphFormat ?? null,
  };
}
