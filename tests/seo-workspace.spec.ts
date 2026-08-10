import { expect, test } from "@playwright/test";
import {
  AEO_CRAWLERS,
  SEO_ARTICLE_PRESETS,
  SEO_NOTICES,
  SEO_RESEARCH_PRESETS,
  SEO_RESEARCH_RESULT_LIMIT,
  SEO_TABS,
  seoArticleGoal,
  seoArticleTitle,
  seoComparisonGoal,
  seoResearchTitle,
} from "../src/lib/clientSeoWorkspace";
import { isClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";
import { isStudioSurface } from "../src/lib/clientStudioSurfaces";
import { deepSurface } from "../src/lib/clientDeepSurfaces";
import type { ClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";

test("seo has exactly one hosted implementation", () => {
  expect(isClientWorkspaceSurface("seo")).toBe(true);
  expect(isStudioSurface("seo" as ClientWorkspaceSurface)).toBe(false);
  expect(deepSurface("seo")).toBeNull();
});

test("the local information architecture is preserved exactly", () => {
  // Eight tabs, in the local order, with the local labels. An earlier hosted
  // version collapsed these into four and lost the structure even where the
  // capability was portable.
  expect(SEO_TABS.map((tab) => tab.key)).toEqual([
    "research", "aeo", "openseo", "generate", "deploy", "history", "transcripts", "skill",
  ]);
  expect(SEO_TABS.map((tab) => tab.label)).toEqual([
    "Research", "AEO", "OpenSEO", "Generate", "Deploy", "History", "Transcripts", "Skill",
  ]);
});

test("the comparison carries the strategy, the question and every source", () => {
  const goal = seoComparisonGoal({
    question: "How do competitors position this?",
    ourStrategy: "We lead with LatAm expertise.",
    sources: [
      { url: "https://competitor.com/a", title: "Their approach", description: "They lead on price.", markdown: "Full page text." },
      { url: "https://other.com/b", title: "Another", description: "They lead on speed." },
    ],
  });
  expect(goal).toContain("How do competitors position this?");
  expect(goal).toContain("We lead with LatAm expertise.");
  expect(goal).toContain("https://competitor.com/a");
  expect(goal).toContain("https://other.com/b");
  expect(goal).toContain("Full page text.");
});

test("a source whose page was not retrieved is marked, never described", () => {
  // The whole value of the comparison is attributability. Implying we read a
  // page we only saw a snippet of would undermine every claim in the output.
  const goal = seoComparisonGoal({
    question: "q", ourStrategy: "s",
    sources: [{ url: "https://competitor.com/a", title: "T", description: "Snippet only." }],
  });
  expect(goal).toContain("Page content was not retrieved");
  expect(goal).toContain("Do not describe page content that was not retrieved");
});

test("the comparison must attribute claims and admit what the sources do not settle", () => {
  const goal = seoComparisonGoal({ question: "q", ourStrategy: "s", sources: [] });
  expect(goal).toContain("Attribute every claim about a source to that source by number and URL");
  expect(goal).toContain("say so rather than filling the gap");
  expect(goal).toContain("Do not invent competitors, figures, or quotes");
  expect(goal).toContain("No sources were returned.");
});

test("goals stay inside the executions route's limit", () => {
  const sources = Array.from({ length: 10 }, (_, index) => ({
    url: `https://competitor${index}.com/a`, title: "T", description: "D", markdown: "x".repeat(9_000),
  }));
  expect(seoComparisonGoal({ question: "q", ourStrategy: "s", sources }).length).toBeLessThanOrEqual(10_000);
  expect(seoArticleGoal({ query: "q", direction: "d", source: "y".repeat(40_000) }).length).toBeLessThanOrEqual(10_000);
});

test("the article lane still refuses to invent sources", () => {
  const goal = seoArticleGoal({ query: "latam market entry", direction: "Write a guide." });
  expect(goal).toContain("Do not invent statistics");
  expect(goal).toContain("Write for a reader, not for a keyword");
});

test("the research pilot stays bounded", () => {
  // Each result costs, and three is enough to see whether a strategy has a gap
  // without turning a check into a crawl.
  expect(SEO_RESEARCH_RESULT_LIMIT).toBe(3);
});

test("the gated tabs say what is missing and that nothing is reached", () => {
  expect(SEO_NOTICES.research).toContain("Search Console");
  expect(SEO_NOTICES.research).toContain("off by default");
  expect(SEO_NOTICES.openseo).toContain("your own OpenSEO account");
  expect(SEO_NOTICES.deploy).toContain("nothing here contacts a destination");
  expect(SEO_NOTICES.transcripts).toContain("this tenant's own records");
});

test("the AEO check reports the crawlers that actually matter", () => {
  const agents = AEO_CRAWLERS.map((crawler) => crawler.agent);
  for (const agent of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
    expect(agents, `${agent} should be reported`).toContain(agent);
  }
  expect(new Set(agents).size).toBe(agents.length);
});

test("presets carry real content and titles stay bounded", () => {
  for (const preset of SEO_RESEARCH_PRESETS) expect(preset.question.length).toBeGreaterThan(20);
  for (const preset of SEO_ARTICLE_PRESETS) expect(preset.direction.length).toBeGreaterThan(40);
  expect(seoResearchTitle("x".repeat(400)).length).toBeLessThan(130);
  expect(seoArticleTitle("latam market entry")).toBe("Article · latam market entry");
});
