import { expect, test } from "@playwright/test";
import { reportSkoolTextGaps } from "../scripts/report-skool-text-gaps.mjs";

const lessonUrl = (id: string) => `https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=${id}`;

test("Skool gap report uses exact lesson IDs and keeps legacy pending counters distinct", () => {
  const capturedId = "0123456789abcdef0123456789abcdef";
  const missingId = "abcdef0123456789abcdef0123456789";
  const graph = {
    "@graph": [
      { "@id": `skool-lesson:${capturedId}`, "@type": "LearningResource", name: "Captured", url: lessonUrl(capturedId), dateCreated: "2026-05-01" },
      { "@id": `skool-lesson:${missingId}`, "@type": "LearningResource", name: "Missing", url: lessonUrl(missingId), dateCreated: "2026-05-02" },
      { "@id": "document:captured", "@type": "LearningResource", url: lessonUrl(capturedId), text: "Captured text" },
      { "@id": "summary:missing", "@type": "CreativeWork", text: "Useful summary, not a lesson capture", contentStatus: "summary_only" },
      { "@id": "skool-video:1", "@type": "VideoObject", identifier: "hosted-video-1", provider: "Skool" },
    ],
    edges: [
      { "@type": "hasTextCaptureSegment", source: `skool-lesson:${capturedId}`, target: "document:captured" },
      { "@type": "hasSummary", source: `skool-lesson:${missingId}`, target: "summary:missing" },
      { "@type": "hasVideoReference", source: `skool-lesson:${missingId}`, target: "skool-video:1" },
    ],
    provenance: {
      coverage: { pendingPages: 25 },
      sourcePackImports: [
        { complete: false, coverage: { pendingPages: 3 } },
        { complete: false, coverage: { pendingPages: 1 } },
      ],
      textCaptureCrosswalk: { registeredLessons: 2, lessonsWithTextSegments: 1, lessonsWithoutTextSegments: 1, linkedTextSegments: 1 },
    },
  };
  expect(reportSkoolTextGaps(graph)).toMatchObject({
    registeredLessons: 2,
    lessonsWithText: 1,
    lessonsWithoutText: 1,
    linkedTextSegments: 1,
    lessonsWithSummaries: 1,
    lessonsWithSummaryOnly: 1,
    linkedSummarySegments: 1,
    sourcePackPendingPages: 25,
    sourcePackReceipts: 2,
    receiptsWithPendingPageCounts: 2,
    receiptsWithNonzeroPendingPages: 2,
    sumOfReceiptPendingPageReports: 4,
    pendingCounterComparable: false,
    pendingCounterReconciled: false,
    pendingCounterInterpretation: "aggregate_or_unscoped_receipts_are_not_unique_lesson_counts",
    completenessVerified: false,
    missing: [{ lessonId: missingId, title: "Missing", url: lessonUrl(missingId), hasSummary: true, videoReference: { provider: "Skool", identifier: "hosted-video-1" } }],
  });
});

test("a single complete receipt is compared only when its declared inventory matches the register", () => {
  const id = "0123456789abcdef0123456789abcdef";
  const graph = {
    "@graph": [{ "@id": `skool-lesson:${id}`, "@type": "LearningResource", url: lessonUrl(id) }],
    edges: [],
    provenance: {
      sourcePackImports: [{ complete: true, coverage: {
        pendingPages: 1, discoveredQueueExhausted: true, declaredInventory: { registeredLessons: 1 },
      } }],
    },
  };
  expect(reportSkoolTextGaps(graph)).toMatchObject({
    sourcePackReceipts: 1,
    lessonsWithSummaries: 0,
    lessonsWithSummaryOnly: 0,
    linkedSummarySegments: 0,
    pendingCounterComparable: true,
    pendingCounterReconciled: true,
    pendingCounterInterpretation: "single_complete_inventory_receipt_matches_unique_lesson_gaps",
  });
});

test("gap report counts transcripts separately from page-text coverage", () => {
  const id = "0123456789abcdef0123456789abcdef";
  const graph = {
    "@graph": [
      { "@id": `skool-lesson:${id}`, "@type": "LearningResource", name: "Transcript lesson", url: lessonUrl(id), contentStatus: "metadata_only", pageTextCaptured: false },
      { "@id": "transcript:1", "@type": "Transcript", text: "Timestamped video transcript", contentStatus: "transcript_excerpt", captureScope: "excerpt", captureScopeVerified: false },
      { "@id": "summary:1", "@type": "CreativeWork", text: "Separate summary", contentStatus: "summary_only" },
    ],
    edges: [
      { "@type": "hasTranscriptCaptureSegment", source: `skool-lesson:${id}`, target: "transcript:1" },
      { "@type": "hasSummary", source: `skool-lesson:${id}`, target: "summary:1" },
    ],
    provenance: {},
  };

  expect(reportSkoolTextGaps(graph)).toMatchObject({
    lessonsWithText: 0,
    lessonsWithoutText: 1,
    linkedTextSegments: 0,
    lessonsWithTranscripts: 1,
    lessonsWithTranscriptOnly: 1,
    linkedTranscriptSegments: 1,
    declaredTranscriptScopeCounts: { full: { lessons: 0, segments: 0 }, excerpt: { lessons: 1, segments: 1 }, unknown: { lessons: 0, segments: 0 } },
    lessonsWithSummaryOnly: 1,
    missing: [{ lessonId: id, title: "Transcript lesson", hasSummary: true, hasTranscript: true, declaredTranscriptScopes: ["excerpt"], videoReference: null }],
  });
});

test("legacy transcript nodes are counted as unknown rather than complete", () => {
  const id = "0123456789abcdef0123456789abcdef";
  const graph = {
    "@graph": [
      { "@id": `skool-lesson:${id}`, "@type": "LearningResource", url: lessonUrl(id) },
      { "@id": "transcript:legacy", "@type": "Transcript", text: "Transcript with no capture scope" },
    ],
    edges: [{ "@type": "hasTranscriptCaptureSegment", source: `skool-lesson:${id}`, target: "transcript:legacy" }],
    provenance: {},
  };
  expect(reportSkoolTextGaps(graph)).toMatchObject({
    declaredTranscriptScopeCounts: { full: { lessons: 0, segments: 0 }, excerpt: { lessons: 0, segments: 0 }, unknown: { lessons: 1, segments: 1 } },
    missing: [{ declaredTranscriptScopes: ["unknown"] }],
  });
});

test("Skool gap report rejects credential-like query parameters and inconsistent crosswalk counts", () => {
  const id = "0123456789abcdef0123456789abcdef";
  const base = {
    "@graph": [{ "@id": `skool-lesson:${id}`, "@type": "LearningResource", url: `${lessonUrl(id)}&session=private` }],
    edges: [],
    provenance: {},
  };
  expect(() => reportSkoolTextGaps(base)).toThrow("lesson_identity_invalid");
  expect(() => reportSkoolTextGaps({ ...base, "@graph": [{ ...base["@graph"][0], url: lessonUrl(id) }], provenance: {
    textCaptureCrosswalk: { registeredLessons: 1, lessonsWithTextSegments: 1, lessonsWithoutTextSegments: 0, linkedTextSegments: 0 },
  } })).toThrow("crosswalk_mismatch");
});
