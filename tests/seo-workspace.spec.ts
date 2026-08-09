import { expect, test } from "@playwright/test";
import {
  SEO_ARTICLE_PRESETS,
  SEO_PLAN_PRESETS,
  SEO_PUBLISH_NOTICE,
  SEO_RESEARCH_NOTICE,
  SEO_TABS,
  seoArticleGoal,
  seoPlanGoal,
  seoSlug,
} from "../src/lib/clientSeoWorkspace";
import { isClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";

test("the surface queues a lane the runner accepts", () => {
  expect(isClientWorkspaceSurface("seo")).toBe(true);
});

test("every tab is distinct and none is the local machine-bound one", () => {
  const keys = SEO_TABS.map((tab) => tab.key);
  expect(new Set(keys).size).toBe(keys.length);
  // Local research shells out to the operator's own Search Console token and
  // deploy spawns the netlify CLI. Neither may appear as a working control.
  expect(keys).not.toContain("research");
  expect(keys).not.toContain("deploy");
});

test("both goals forbid claiming retrieval the runtime never performs", () => {
  const plan = seoPlanGoal({ query: "latam market entry", direction: "Plan it." });
  expect(plan).toContain("Do not claim to have checked live rankings");
  const article = seoArticleGoal({ query: "latam market entry", direction: "Write it." });
  expect(article).toContain("Do not invent statistics");
});

test("supplied material is labelled as supplied, never as retrieved", () => {
  const plan = seoPlanGoal({ query: "q", direction: "d", data: "position 4 for the head term" });
  expect(plan).toContain("you did not retrieve this");
  expect(plan).toContain("position 4 for the head term");

  const article = seoArticleGoal({ query: "q", direction: "d", source: "interview transcript here" });
  expect(article).toContain("you did not retrieve this");
  expect(article).toContain("interview transcript here");
});

test("goals stay inside the executions route's limit even with large pasted material", () => {
  const huge = "x".repeat(40_000);
  expect(seoPlanGoal({ query: "q", direction: "d", data: huge }).length).toBeLessThanOrEqual(10_000);
  expect(seoArticleGoal({ query: "q", direction: "d", source: huge }).length).toBeLessThanOrEqual(10_000);
});

test("the blocked capabilities are named rather than implied", () => {
  // Each notice must say what is missing and that nothing here reaches it.
  expect(SEO_RESEARCH_NOTICE).toContain("Search Console");
  expect(SEO_RESEARCH_NOTICE).toContain("Nothing on this surface reaches Search Console");
  expect(SEO_PUBLISH_NOTICE).toContain("does not deploy");
  expect(SEO_PUBLISH_NOTICE).toContain("no destination is contacted");
});

test("presets carry real direction rather than a bare label", () => {
  for (const preset of [...SEO_PLAN_PRESETS, ...SEO_ARTICLE_PRESETS]) {
    expect(preset.label.length).toBeGreaterThan(0);
    expect(preset.direction.length).toBeGreaterThan(40);
  }
  const directions = [...SEO_PLAN_PRESETS, ...SEO_ARTICLE_PRESETS].map((preset) => preset.direction);
  expect(new Set(directions).size).toBe(directions.length);
});

test("slugs stay filename-safe and bounded", () => {
  expect(seoSlug("  LatAm Market Entry: a B2B SaaS guide!  ")).toBe("latam-market-entry-a-b2b-saas-guide");
  expect(seoSlug("x".repeat(200)).length).toBeLessThanOrEqual(80);
});
