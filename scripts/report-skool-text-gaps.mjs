import { readFileSync } from "node:fs";
import { companionResourceUrl, privateGraphArtifactPath } from "./import-skool-register-graph.mjs";

export function reportSkoolTextGaps(graph) {
  if (!graph || !Array.isArray(graph["@graph"]) || !Array.isArray(graph.edges)) {
    throw new Error("graph_invalid");
  }
  const nodes = new Map(graph["@graph"].map((node) => [node?.["@id"], node]));
  const lessons = graph["@graph"].filter((node) => node?.["@type"] === "LearningResource"
    && typeof node["@id"] === "string" && node["@id"].startsWith("skool-lesson:"));
  if (!lessons.length || lessons.some((node) => !nodes.has(node["@id"]))) throw new Error("lesson_register_invalid");

  const textSegmentsByLesson = new Map(lessons.map((lesson) => [lesson["@id"], new Set()]));
  const summariesByLesson = new Map(lessons.map((lesson) => [lesson["@id"], new Set()]));
  const companionsByLesson = new Map(lessons.map((lesson) => [lesson["@id"], new Set()]));
  const transcriptsByLesson = new Map(lessons.map((lesson) => [lesson["@id"], new Set()]));
  const transcriptScopesByLesson = new Map(lessons.map((lesson) => [lesson["@id"], new Map()]));
  const resourceUrlsByLesson = new Map(lessons.map((lesson) => [lesson["@id"], new Set()]));
  for (const edge of graph.edges) {
    if (edge?.["@type"] !== "links_to" || !resourceUrlsByLesson.has(edge.source)) continue;
    const url = companionResourceUrl(nodes.get(edge.target)?.url);
    if (url) resourceUrlsByLesson.get(edge.source).add(url);
  }
  for (const edge of graph.edges) {
    if (!textSegmentsByLesson.has(edge?.source)) continue;
    const segment = nodes.get(edge.target);
    if (edge["@type"] === "hasCompanionTextCaptureSegment") {
      const url = companionResourceUrl(segment?.url);
      if (segment?.["@type"] !== "LearningResource" || typeof segment.text !== "string" || !segment.text.trim()
        || !url || !resourceUrlsByLesson.get(edge.source).has(url)) throw new Error("companion_capture_reference_invalid");
      companionsByLesson.get(edge.source).add(edge.target);
    }
    if (edge["@type"] === "hasTextCaptureSegment"
      && segment?.["@type"] === "LearningResource"
      && typeof segment.text === "string" && segment.text.trim()) {
      textSegmentsByLesson.get(edge.source).add(edge.target);
    }
    if (edge["@type"] === "hasSummary"
      && segment?.["@type"] === "CreativeWork"
      && typeof segment.text === "string" && segment.text.trim()) {
      summariesByLesson.get(edge.source).add(edge.target);
    }
    if (edge["@type"] === "hasTranscriptCaptureSegment"
      && segment?.["@type"] === "Transcript"
      && typeof segment.text === "string" && segment.text.trim()) {
      transcriptsByLesson.get(edge.source).add(edge.target);
      const scope = ["full", "excerpt", "unknown"].includes(segment.captureScope) ? segment.captureScope : "unknown";
      transcriptScopesByLesson.get(edge.source).set(edge.target, scope);
    }
  }

  const missing = [];
  let linkedSegments = 0;
  let linkedSummaries = 0;
  for (const lesson of lessons) {
    const segments = textSegmentsByLesson.get(lesson["@id"]);
    const summaries = summariesByLesson.get(lesson["@id"]);
    const transcripts = transcriptsByLesson.get(lesson["@id"]);
    const transcriptScopes = transcriptScopesByLesson.get(lesson["@id"]);
    linkedSegments += segments.size;
    linkedSummaries += summaries.size;
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
      hasSummary: summaries.size > 0,
      hasCompanionText: companionsByLesson.get(lesson["@id"]).size > 0,
      companionTextSegments: companionsByLesson.get(lesson["@id"]).size,
      hasTranscript: transcripts.size > 0,
      declaredTranscriptScopes: [...new Set(transcripts.size ? [...transcripts].map((id) => transcriptScopes.get(id)) : [])].sort(),
      videoReference: typeof videoNode?.url === "string" ? { url: videoNode.url }
        : typeof videoNode?.identifier === "string" && videoNode.provider === "Skool"
          ? { provider: "Skool", identifier: videoNode.identifier }
          : null,
    });
  }

  const linkedTranscriptSegments = [...transcriptsByLesson.values()].reduce((sum, segments) => sum + segments.size, 0);
  const linkedCompanionTextSegments = [...companionsByLesson.values()].reduce((sum, segments) => sum + segments.size, 0);
  const lessonsWithCompanionText = [...companionsByLesson.values()].filter((segments) => segments.size > 0).length;
  const transcriptScopeCounts = Object.fromEntries(["full", "excerpt", "unknown"].map((scope) => [scope, {
    lessons: [...transcriptScopesByLesson.values()].filter((segments) => [...segments.values()].includes(scope)).length,
    segments: [...transcriptScopesByLesson.values()].reduce((sum, segments) =>
      sum + [...segments.values()].filter((value) => value === scope).length, 0),
  }]));

  missing.sort((left, right) => (left.createdAt ?? "").localeCompare(right.createdAt ?? "") || left.lessonId.localeCompare(right.lessonId));
  const crosswalk = graph.provenance?.textCaptureCrosswalk;
  if (crosswalk && (crosswalk.registeredLessons !== lessons.length
    || crosswalk.lessonsWithTextSegments !== lessons.length - missing.length
    || crosswalk.lessonsWithoutTextSegments !== missing.length
    || crosswalk.linkedTextSegments !== linkedSegments
    || (crosswalk.linkedCompanionTextSegments !== undefined && crosswalk.linkedCompanionTextSegments !== linkedCompanionTextSegments)
    || (crosswalk.lessonsWithCompanionTextSegments !== undefined && crosswalk.lessonsWithCompanionTextSegments !== lessonsWithCompanionText))) {
    throw new Error("crosswalk_mismatch");
  }
  const pendingPages = graph.provenance?.coverage?.pendingPages;
  const sourcePackImports = Array.isArray(graph.provenance?.sourcePackImports) ? graph.provenance.sourcePackImports : [];
  const pendingReceipts = sourcePackImports.filter((receipt) => Number.isInteger(receipt?.coverage?.pendingPages));
  const scopedCompleteReceipts = pendingReceipts.filter((receipt) => {
    const coverage = receipt.coverage;
    const declaredLessons = coverage.declaredInventory?.registeredLessons ?? coverage.declaredInventory?.totalLessons;
    return receipt.complete === true && coverage.discoveredQueueExhausted === true
      && Number.isInteger(declaredLessons) && declaredLessons === lessons.length;
  });
  const pendingCounterComparable = scopedCompleteReceipts.length === 1;
  const comparablePendingPages = pendingCounterComparable ? scopedCompleteReceipts[0].coverage.pendingPages : null;
  return {
    method: "exact_skool_lesson_id_to_nonempty_text_segment_edge",
    registeredLessons: lessons.length,
    lessonsWithText: lessons.length - missing.length,
    lessonsWithoutText: missing.length,
    linkedTextSegments: linkedSegments,
    lessonsWithCompanionText,
    lessonsWithoutPageTextWithCompanionText: [...companionsByLesson.entries()].filter(([id, segments]) => segments.size > 0 && textSegmentsByLesson.get(id).size === 0).length,
    linkedCompanionTextSegments,
    lessonsWithSummaries: [...summariesByLesson.values()].filter((segments) => segments.size > 0).length,
    lessonsWithSummaryOnly: [...summariesByLesson.entries()].filter(([lessonId, segments]) =>
      segments.size > 0 && textSegmentsByLesson.get(lessonId).size === 0).length,
    linkedSummarySegments: linkedSummaries,
    lessonsWithTranscripts: [...transcriptsByLesson.values()].filter((segments) => segments.size > 0).length,
    lessonsWithTranscriptOnly: [...transcriptsByLesson.entries()].filter(([lessonId, segments]) =>
      segments.size > 0 && textSegmentsByLesson.get(lessonId).size === 0).length,
    linkedTranscriptSegments,
    declaredTranscriptScopeCounts: transcriptScopeCounts,
    sourcePackPendingPages: Number.isInteger(pendingPages) ? pendingPages : null,
    sourcePackReceipts: sourcePackImports.length,
    receiptsWithPendingPageCounts: pendingReceipts.length,
    receiptsWithNonzeroPendingPages: pendingReceipts.filter((receipt) => receipt.coverage.pendingPages > 0).length,
    sumOfReceiptPendingPageReports: pendingReceipts.reduce((sum, receipt) => sum + receipt.coverage.pendingPages, 0),
    pendingCounterComparable,
    pendingCounterReconciled: pendingCounterComparable && comparablePendingPages === missing.length,
    pendingCounterInterpretation: pendingCounterComparable
      ? comparablePendingPages === missing.length ? "single_complete_inventory_receipt_matches_unique_lesson_gaps" : "single_complete_inventory_receipt_differs_from_unique_lesson_gaps"
      : "aggregate_or_unscoped_receipts_are_not_unique_lesson_counts",
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
