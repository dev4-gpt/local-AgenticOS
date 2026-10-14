import { expect, test } from "@playwright/test";
import { buildSkoolRegisterGraph, mergeSkoolRegisterGraph, privateGraphArtifactPath } from "../scripts/import-skool-register-graph.mjs";

const lessonId = "0123456789abcdef0123456789abcdef";
const videoId = "abcdef0123456789abcdef0123456789";
const register = `# Classroom register\n\n## May lesson\n- Lesson: https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${lessonId}\n- Date: created 2026-05-01, updated 2026-05-02\n- Video: https://youtu.be/AbCd1234\n- Link: https://example.com/docs\n\n## System lesson\n- Lesson: https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${videoId}\n- Date: created 2026-05-16, updated 2026-10-11\n- Video: (Skool-hosted ${lessonId})\n- Link: https://example.com/docs\n`;

test("Skool link register becomes an explicitly metadata-only graph", () => {
  const graph = buildSkoolRegisterGraph(register, "A1b2C3d4E5f6G7h8I9j0");
  const lessons = graph["@graph"].filter((node) => node["@type"] === "LearningResource");
  const videos = graph["@graph"].filter((node) => node["@type"] === "VideoObject");
  expect(lessons).toHaveLength(2);
  expect(lessons[0]).toMatchObject({ contentStatus: "metadata_only", pageTextCaptured: false });
  expect(videos).toHaveLength(2);
  expect(graph.edges.filter((edge) => edge["@type"] === "links_to")).toHaveLength(2);
  expect(graph.provenance).toMatchObject({
    lessonCount: 2,
    videoReferenceEdges: 2,
    publicVideoReferenceEdges: 1,
    uniquePublicVideoUrls: 1,
    skoolHostedVideoReferenceEdges: 1,
    uniqueSkoolHostedVideoIds: 1,
    outboundLinkEdges: 2,
    uniqueOutboundLinkUrls: 1,
    pageTextIncluded: false,
    videoAssetsIncluded: false,
    complete: false,
  });
});

test("Skool register graph merges into the private content graph without claiming completeness", () => {
  const registerGraph = buildSkoolRegisterGraph(register, "A1b2C3d4E5f6G7h8I9j0");
  const base = { "@context": "https://schema.org", "@graph": [{ "@id": "url:shared", "@type": "URL", url: "https://example.com/docs" }], edges: [], provenance: { sourceSegments: 7, complete: false } };
  const merged = mergeSkoolRegisterGraph(base, registerGraph);
  expect(merged["@graph"].filter((node) => node["@id"] === "url:shared")).toHaveLength(1);
  expect(merged["@graph"].filter((node) => node["@type"] === "LearningResource")).toHaveLength(2);
  expect(merged.edges).toHaveLength(registerGraph.edges.length);
  expect(merged.provenance).toMatchObject({ sourceSegments: 7, complete: false, videoAssetsIncluded: false, registerIndex: { lessonCount: 2, pageTextIncluded: false } });
});

test("Skool register rejects duplicate lesson IDs and secret-bearing links", () => {
  const duplicate = register.replace(`## System lesson\n- Lesson: https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${videoId}`, `## System lesson\n- Lesson: https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${lessonId}`);
  expect(() => buildSkoolRegisterGraph(duplicate, "A1b2C3d4E5f6G7h8I9j0")).toThrow("lesson_id_duplicate");
  const unsafe = register.replaceAll("https://example.com/docs", "https://example.com/docs?api_key=secret");
  const graph = buildSkoolRegisterGraph(unsafe, "A1b2C3d4E5f6G7h8I9j0");
  expect(graph.provenance.skippedUnsafeLinks).toBe(2);
  expect(graph["@graph"].some((node) => node.url?.includes("api_key"))).toBe(false);
});

test("Skool register omits loopback and private-network link targets", () => {
  const unsafe = register.replaceAll("https://example.com/docs", "https://admin.localhost/docs");
  const graph = buildSkoolRegisterGraph(unsafe, "A1b2C3d4E5f6G7h8I9j0");
  expect(graph.provenance.skippedUnsafeLinks).toBe(2);
  expect(graph.edges.some((edge) => edge["@type"] === "links_to")).toBe(false);
  expect(graph["@graph"].some((node) => node.url?.includes("localhost"))).toBe(false);
});

test("register graph output is restricted to the private ignored directory", () => {
  expect(privateGraphArtifactPath("tmp/authorized-skool-import/index.jsonld", "/repo")).toBe("/repo/tmp/authorized-skool-import/index.jsonld");
  expect(() => privateGraphArtifactPath("public/index.jsonld", "/repo")).toThrow("private_graph_path_required");
  expect(() => privateGraphArtifactPath("tmp/authorized-skool-import/../public/index.jsonld", "/repo")).toThrow("private_graph_path_required");
});
