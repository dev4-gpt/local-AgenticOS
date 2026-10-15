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
      { "@id": "skool-video:1", "@type": "VideoObject", identifier: "hosted-video-1", provider: "Skool" },
    ],
    edges: [
      { "@type": "hasTextCaptureSegment", source: `skool-lesson:${capturedId}`, target: "document:captured" },
      { "@type": "hasVideoReference", source: `skool-lesson:${missingId}`, target: "skool-video:1" },
    ],
    provenance: {
      coverage: { pendingPages: 25 },
      textCaptureCrosswalk: { registeredLessons: 2, lessonsWithTextSegments: 1, lessonsWithoutTextSegments: 1, linkedTextSegments: 1 },
    },
  };
  expect(reportSkoolTextGaps(graph)).toMatchObject({
    registeredLessons: 2,
    lessonsWithText: 1,
    lessonsWithoutText: 1,
    linkedTextSegments: 1,
    sourcePackPendingPages: 25,
    pendingCounterReconciled: false,
    completenessVerified: false,
    missing: [{ lessonId: missingId, title: "Missing", url: lessonUrl(missingId), videoReference: { provider: "Skool", identifier: "hosted-video-1" } }],
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
