import { expect, test } from "@playwright/test";
import { buildSkoolRegisterGraph, mergeSkoolRegisterGraph, privateGraphArtifactPath } from "../scripts/import-skool-register-graph.mjs";
import { validatePortableKnowledgeGraph } from "../scripts/portable-knowledge-graph.mjs";

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

test("register lessons link only to text segments with the exact Skool lesson identity", () => {
  const registerGraph = buildSkoolRegisterGraph(register, "A1b2C3d4E5f6G7h8I9j0");
  const exactUrl = `https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${lessonId}`;
  const unregisteredLessonId = "fedcba9876543210fedcba9876543210";
  const base = {
    "@context": "https://schema.org",
    "@graph": [
      { "@id": "document:capture-1", "@type": "LearningResource", url: exactUrl, text: "captured portion one" },
      { "@id": "document:capture-2", "@type": "LearningResource", url: exactUrl, text: "captured portion two" },
      { "@id": "document:other-lesson", "@type": "LearningResource", url: `https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${unregisteredLessonId}`, text: "other lesson" },
    ],
    edges: [],
    provenance: { sourceSegments: 3, complete: false },
  };

  const merged = mergeSkoolRegisterGraph(base, registerGraph);
  const lesson = merged["@graph"].find((node) => node["@id"] === `skool-lesson:${lessonId}`);
  expect(lesson).toMatchObject({
    contentStatus: "text_segments_available",
    pageTextCaptured: true,
    textCaptureSegmentCount: 2,
    textCaptureCompleteness: "unverified",
  });
  expect(merged.edges.filter((edge) => edge["@type"] === "hasTextCaptureSegment" && edge.source === lesson["@id"]))
    .toHaveLength(2);
  expect(merged["@graph"].find((node) => node["@id"] === `skool-lesson:${videoId}`))
    .toMatchObject({ contentStatus: "metadata_only", pageTextCaptured: false });
  expect(merged.provenance.textCaptureCrosswalk).toMatchObject({
    method: "exact_skool_lesson_id_from_url",
    lessonsWithTextSegments: 1,
    completenessVerified: false,
  });

  const mergedAgain = mergeSkoolRegisterGraph(merged, registerGraph);
  expect(mergedAgain.edges.filter((edge) => edge["@type"] === "hasTextCaptureSegment")).toHaveLength(2);
});

test("merge redacts unsafe legacy URLs but preserves their graph references", () => {
  const registerGraph = { "@graph": [], edges: [], provenance: {} };
  const base = {
    "@context": "https://schema.org",
    "@graph": [
      { "@id": "skool-lesson:legacy", "@type": "LearningResource" },
      { "@id": "url:local", "@type": "URL", url: "http://127.0.0.1:3000/private" },
    ],
    edges: [{ "@type": "links_to", source: "skool-lesson:legacy", target: "url:local" }],
    provenance: { sourceSegments: 1, complete: false, registerIndex: { lessonCount: 107 } },
  };

  const merged = mergeSkoolRegisterGraph(base, registerGraph);
  expect(merged["@graph"].find((node) => node["@id"] === "url:local")).toMatchObject({
    "@type": "URL",
    urlOmitted: true,
    urlOmissionReason: "unsafe_or_invalid_url",
  });
  expect(merged.edges).toContainEqual(base.edges[0]);
  expect(merged.provenance.omittedUnsafeUrls).toBe(1);
  expect(merged.provenance.registerIndex).toEqual({ lessonCount: 107 });
  expect(() => validatePortableKnowledgeGraph(merged)).not.toThrow();
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
