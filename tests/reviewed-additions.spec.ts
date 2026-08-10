import { expect, test } from "@playwright/test";
import { REVIEWED_ADDITIONS } from "../src/lib/reviewedAdditions";

test("the v96 reviewed portfolio contains the eight zero-setup candidates", () => {
  const ids = new Set(REVIEWED_ADDITIONS.map((addition) => addition.id));
  for (const id of [
    "omniroute",
    "open-notebook",
    "book-to-skill",
    "strix",
    "open-seo",
    "open-generative-ai",
    "i-have-adhd",
    "no-ai-slop",
  ]) {
    expect(ids.has(id)).toBe(true);
  }
});

test("new v96 runtimes are cataloged without client-cloud detection", () => {
  const ids = new Set([
    "omniroute",
    "open-notebook",
    "book-to-skill",
    "strix",
    "open-seo",
    "open-generative-ai",
    "i-have-adhd",
    "no-ai-slop",
  ]);
  for (const addition of REVIEWED_ADDITIONS.filter((item) => ids.has(item.id))) {
    expect(addition.sourceUrl).toMatch(/^https:\/\/github\.com\//);
    expect(addition.detectedId).toBeUndefined();
    expect(addition.boundary.length).toBeGreaterThan(40);
  }
});
