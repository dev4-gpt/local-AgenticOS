import { readFileSync } from "node:fs";
import { privateGraphArtifactPath } from "./import-skool-register-graph.mjs";

export function reportSkoolTextGaps(graph) {
  if (!graph || !Array.isArray(graph["@graph"]) || !Array.isArray(graph.edges)) {
    throw new Error("graph_invalid");
  }
  const nodes = new Map(graph["@graph"].map((node) => [node?.["@id"], node]));
  const lessons = graph["@graph"].filter((node) => node?.["@type"] === "LearningResource"
    && typeof node["@id"] === "string" && node["@id"].startsWith("skool-lesson:"));
  if (!lessons.length || lessons.some((node) => !nodes.has(node["@id"]))) throw new Error("lesson_register_invalid");

  const textSegmentsByLesson = new Map(lessons.map((lesson) => [lesson["@id"], new Set()]));
  for (const edge of graph.edges) {
    if (edge?.["@type"] !== "hasTextCaptureSegment" || !textSegmentsByLesson.has(edge.source)) continue;
    const segment = nodes.get(edge.target);
    if (segment?.["@type"] === "LearningResource" && typeof segment.text === "string" && segment.text.trim()) {
      textSegmentsByLesson.get(edge.source).add(edge.target);
    }
  }

  const missing = [];
  let linkedSegments = 0;
  for (const lesson of lessons) {
    const segments = textSegmentsByLesson.get(lesson["@id"]);
    linkedSegments += segments.size;
    if (segments.size) continue;
    const url = new URL(lesson.url);
    const lessonKey = lesson["@id"].slice("skool-lesson:".length);
    if (url.origin !== "https://www.skool.com"
      || url.pathname !== "/ai-profit-lab-7462/classroom/9daf24e1"
      || url.searchParams.getAll("md").length !== 1
      || url.searchParams.get("md")?.toLowerCase() !== lessonKey
      || [...url.searchParams.keys()].some((key) => /(token|secret|auth|session|api[_-]?key|password|signature|^sig$)/i.test(key))) {
      throw new Error("lesson_identity_invalid");
    }
    const video = graph.edges.find((edge) => edge?.["@type"] === "hasVideoReference" && edge.source === lesson["@id"]);
    const videoNode = video ? nodes.get(video.target) : null;
    missing.push({
      lessonId: lessonKey,
      title: typeof lesson.name === "string" ? lesson.name : "Untitled lesson",
      url: url.toString(),
      createdAt: typeof lesson.dateCreated === "string" ? lesson.dateCreated : null,
      updatedAt: typeof lesson.dateModified === "string" ? lesson.dateModified : null,
      videoReference: typeof videoNode?.url === "string" ? { url: videoNode.url }
        : typeof videoNode?.identifier === "string" && videoNode.provider === "Skool"
          ? { provider: "Skool", identifier: videoNode.identifier }
          : null,
    });
  }

  missing.sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? "") || left.lessonId.localeCompare(right.lessonId));
  const crosswalk = graph.provenance?.textCaptureCrosswalk;
  if (crosswalk && (crosswalk.registeredLessons !== lessons.length
    || crosswalk.lessonsWithTextSegments !== lessons.length - missing.length
    || crosswalk.lessonsWithoutTextSegments !== missing.length
    || crosswalk.linkedTextSegments !== linkedSegments)) {
    throw new Error("crosswalk_mismatch");
  }
  const pendingPages = graph.provenance?.coverage?.pendingPages;
  return {
    method: "exact_skool_lesson_id_to_nonempty_text_segment_edge",
    registeredLessons: lessons.length,
    lessonsWithText: lessons.length - missing.length,
    lessonsWithoutText: missing.length,
    linkedTextSegments: linkedSegments,
    sourcePackPendingPages: Number.isInteger(pendingPages) ? pendingPages : null,
    pendingCounterReconciled: Number.isInteger(pendingPages) && pendingPages === missing.length,
    completenessVerified: false,
    missing,
  };
}

if (process.argv[1]?.endsWith("/report-skool-text-gaps.mjs")) {
  const [graphCandidate] = process.argv.slice(2);
  if (!graphCandidate) {
    console.error("Usage: node scripts/report-skool-text-gaps.mjs private-graph.jsonld");
    process.exitCode = 2;
  } else {
    try {
      const graphPath = privateGraphArtifactPath(graphCandidate);
      const graph = JSON.parse(readFileSync(graphPath, "utf8"));
      console.log(JSON.stringify(reportSkoolTextGaps(graph), null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "skool_gap_report_failed");
      process.exitCode = 1;
    }
  }
}
