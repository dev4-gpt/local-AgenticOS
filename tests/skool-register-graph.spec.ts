import { expect, test } from "@playwright/test";
import { buildSkoolRegisterGraph, mergeSkoolRegisterGraph, mergeSkoolSourcePackGraph, privateGraphArtifactPath } from "../scripts/import-skool-register-graph.mjs";
import { validatePortableKnowledgeGraph } from "../scripts/portable-knowledge-graph.mjs";
import { reportSkoolTextGaps } from "../scripts/report-skool-text-gaps.mjs";

const lessonId = "0123456789abcdef0123456789abcdef";
const videoId = "abcdef0123456789abcdef0123456789";
const register = `# Classroom register\n\n## May lesson\n- Lesson: https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${lessonId}\n- Date: created 2026-05-01, updated 2026-05-02\n- Video: https://youtu.be/AbCd1234\n- Link: https://example.com/docs\n\n## System lesson\n- Lesson: https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${videoId}\n- Date: created 2026-05-16, updated 2026-10-11\n- Video: (Skool-hosted ${lessonId})\n- Link: https://example.com/docs\n`;

test("exact outbound resource URLs link companion captures without closing lesson-body gaps", () => {
  const registerGraph = buildSkoolRegisterGraph(register, "A1b2C3d4E5f6G7h8I9j0");
  const base = { "@context": "https://schema.org", "@graph": [
    { "@id": "document:manual", "@type": "LearningResource", name: "Manual", url: "https://example.com/docs", text: "Manual text" },
    { "@id": "document:manual-part", "@type": "LearningResource", url: "https://example.com/docs#part", text: "Second manual segment" },
    { "@id": "document:wrong-url", "@type": "LearningResource", name: "Manual", url: "https://example.com/not-linked", text: "Same title is insufficient" },
    { "@id": "document:empty", "@type": "LearningResource", url: "https://example.com/docs", text: " " },
    { "@id": "document:unsafe", "@type": "LearningResource", url: "https://example.com/docs?session=private", text: "Unsafe URL" },
  ], edges: [], provenance: { complete: false } };
  const merged = mergeSkoolRegisterGraph(base, registerGraph);
  const edges = merged.edges.filter((edge) => edge["@type"] === "hasCompanionTextCaptureSegment");
  expect(edges).toHaveLength(4);
  expect(new Set(edges.map((edge) => edge.target))).toEqual(new Set(["document:manual", "document:manual-part"]));
  expect(reportSkoolTextGaps(merged)).toMatchObject({
    lessonsWithText: 0, lessonsWithoutText: 2, lessonsWithCompanionText: 2,
    lessonsWithoutPageTextWithCompanionText: 2, linkedCompanionTextSegments: 4,
    completenessVerified: false,
    missing: [{ hasCompanionText: true, companionTextSegments: 2 }, { hasCompanionText: true, companionTextSegments: 2 }],
  });
  expect(mergeSkoolRegisterGraph(merged, registerGraph)).toEqual(merged);
  expect(validatePortableKnowledgeGraph(merged).coverage).toBe("partial");
  expect(() => reportSkoolTextGaps({ ...merged, provenance: { ...merged.provenance,
    textCaptureCrosswalk: { ...merged.provenance.textCaptureCrosswalk, linkedCompanionTextSegments: 0 },
  } })).toThrow("crosswalk_mismatch");
  expect(() => reportSkoolTextGaps({ ...merged, edges: [...merged.edges,
    { "@type": "hasCompanionTextCaptureSegment", source: `skool-lesson:${lessonId}`, target: "document:wrong-url" },
  ] })).toThrow("companion_capture_reference_invalid");
});

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
      { "@id": "document:unregistered-page", "@type": "LearningResource", url: "https://example.com/unregistered", text: "unregistered page" },
      { "@id": "document:unregistered-segment", "@type": "LearningResource", url: "https://example.com/unregistered#segment", text: "unregistered segment" },
    ],
    edges: [{ "@type": "hasTextCaptureSegment", source: "document:unregistered-page", target: "document:unregistered-segment" }],
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
    registeredLessons: 2,
    lessonsWithTextSegments: 1,
    lessonsWithoutTextSegments: 1,
    linkedTextSegments: 2,
    completenessVerified: false,
  });

  const mergedAgain = mergeSkoolRegisterGraph(merged, registerGraph);
  expect(mergedAgain.edges.filter((edge) => edge["@type"] === "hasTextCaptureSegment")).toHaveLength(3);
});

test("source-pack merge preserves source identifiers, exact lesson links, and register provenance", () => {
  const registerGraph = buildSkoolRegisterGraph(register, "A1b2C3d4E5f6G7h8I9j0");
  const base = mergeSkoolRegisterGraph({ "@context": "https://schema.org", "@graph": [], edges: [], provenance: {} }, registerGraph);
  const pack = {
    "@context": "https://schema.org",
    "@graph": [{
      "@id": "document:drive-source",
      "@type": "LearningResource",
      name: "May lesson source",
      identifier: `May lesson [drive_1Jze5NRrpekft50CWCjt0wN96bXVlc8CH:1/1]`,
      url: `https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${lessonId}`,
      text: "captured lesson text",
    }],
    edges: [],
    provenance: {
      format: "agentos-private-source-graph-v1",
      sourceSegments: 1,
      links: 0,
      complete: false,
      coverage: { outputSources: 1, outputLinks: 0, pendingPages: 1 },
      batchSha256: ["a".repeat(64)],
    },
  };

  const merged = mergeSkoolSourcePackGraph(base, pack);
  const lesson = merged["@graph"].find((node) => node["@id"] === `skool-lesson:${lessonId}`);
  const source = merged["@graph"].find((node) => node["@id"] === "document:drive-source");
  expect(source.identifier).toContain("drive_1Jze5NRrpekft50CWCjt0wN96bXVlc8CH");
  expect(lesson).toMatchObject({ contentStatus: "text_segments_available", pageTextCaptured: true, textCaptureSegmentCount: 1 });
  expect(merged.edges).toContainEqual({ "@type": "hasTextCaptureSegment", source: lesson["@id"], target: source["@id"] });
  expect(merged["@graph"].filter((node) => node["@type"] === "VideoObject")).toHaveLength(2);
  expect(merged.edges.filter((edge) => edge["@type"] === "hasVideoReference")).toHaveLength(2);
  expect(merged.provenance).toMatchObject({
    complete: false,
    videoAssetsIncluded: false,
    sourcePackImports: [{ format: "agentos-private-source-graph-v1", complete: false }],
    registerIndex: { lessonCount: 2, pageTextIncluded: false },
  });
  expect(() => validatePortableKnowledgeGraph(merged)).not.toThrow();

  const repeated = mergeSkoolSourcePackGraph(merged, pack);
  expect(repeated["@graph"]).toHaveLength(merged["@graph"].length);
  expect(repeated.edges).toHaveLength(merged.edges.length);
  expect(repeated.provenance.sourcePackImports).toHaveLength(1);
});

test("source-pack transcript remains distinct and links to its exact registered Skool lesson", () => {
  const registerGraph = buildSkoolRegisterGraph(register, "A1b2C3d4E5f6G7h8I9j0");
  const base = mergeSkoolRegisterGraph({ "@context": "https://schema.org", "@graph": [], edges: [], provenance: {} }, registerGraph);
  const lessonUrl = `https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${lessonId}`;
  const pack = {
    "@context": "https://schema.org",
    "@graph": [
      { "@id": "document:transcript-source", "@type": "LearningResource", url: lessonUrl, contentStatus: "metadata_only", pageTextCaptured: false },
      { "@id": "video:transcript", "@type": "VideoObject", url: "https://youtu.be/AbCd1234" },
      { "@id": "transcript:segment-1", "@type": "Transcript", text: "Visible official transcript text", contentStatus: "transcript_available" },
    ],
    edges: [
      { "@type": "hasTranscript", source: "video:transcript", target: "transcript:segment-1" },
      { "@type": "transcript_of", source: "transcript:segment-1", target: "document:transcript-source" },
    ],
    provenance: { format: "agentos-private-source-graph-v1", complete: false, coverage: {}, batchSha256: [] },
  };

  const merged = mergeSkoolSourcePackGraph(base, pack);
  const lesson = merged["@graph"].find((node) => node["@id"] === `skool-lesson:${lessonId}`);
  const transcript = merged["@graph"].find((node) => node["@id"] === "transcript:segment-1");
  expect(lesson).toMatchObject({ contentStatus: "metadata_only", pageTextCaptured: false, transcriptCaptureSegmentCount: 1 });
  expect(transcript).toMatchObject({ contentStatus: "transcript_unknown", captureScope: "unknown", captureScopeVerified: false });
  expect(merged.edges).toContainEqual({ "@type": "hasTranscriptCaptureSegment", source: lesson["@id"], target: "transcript:segment-1" });
  expect(merged.edges).not.toContainEqual({ "@type": "hasTextCaptureSegment", source: lesson["@id"], target: "transcript:segment-1" });
  expect(mergeSkoolSourcePackGraph(merged, pack).edges.filter((edge) => edge["@type"] === "hasTranscriptCaptureSegment")).toHaveLength(1);
});

test("source-pack merge preserves declared transcript scope without trusting verification claims", () => {
  const registerGraph = buildSkoolRegisterGraph(register, "A1b2C3d4E5f6G7h8I9j0");
  const base = mergeSkoolRegisterGraph({ "@context": "https://schema.org", "@graph": [], edges: [], provenance: {} }, registerGraph);
  const lessonUrl = `https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${lessonId}`;
  const transcript = { "@id": "transcript:declared", "@type": "Transcript", text: "Transcript excerpt", captureScope: "excerpt", captureScopeVerified: true };
  const pack = {
    "@context": "https://schema.org",
    "@graph": [
      { "@id": "document:transcript-source", "@type": "LearningResource", url: lessonUrl },
      transcript,
    ],
    edges: [{ "@type": "transcript_of", source: transcript["@id"], target: "document:transcript-source" }],
    provenance: { format: "agentos-private-source-graph-v1", complete: false, coverage: {}, batchSha256: [] },
  };

  const merged = mergeSkoolSourcePackGraph(base, pack);
  expect(merged["@graph"].find((node) => node["@id"] === transcript["@id"])).toMatchObject({
    contentStatus: "transcript_excerpt", captureScope: "excerpt", captureScopeVerified: false,
  });
  const invalidPack = { ...pack, "@graph": pack["@graph"].map((node) =>
    node["@id"] === transcript["@id"] ? { ...node, captureScope: "mostly-full" } : node) };
  expect(() => mergeSkoolSourcePackGraph(base, invalidPack)).toThrow("transcript_scope_invalid");
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
