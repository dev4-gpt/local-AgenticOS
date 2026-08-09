import { expect, test } from "@playwright/test";
import {
  normalizePipelineItem, parsePipelineShape, pipelineBuildPrompt, pipelineCanBuild, pipelineCanShape,
  pipelineColumnItems, pipelineCounts, pipelineSchemaMissing, pipelineShapePrompt, pipelineSlugify,
  pipelineStageAfterShaping, pipelineStatusLabel, pipelineUniqueSlug, type PipelineItem,
} from "../src/lib/clientPipelineAdapter";

function item(overrides: Partial<PipelineItem> & { id: string }): PipelineItem {
  return {
    slug: "idea", title: "Idea", stage: "inbox", route: null, confidence: null, tags: [],
    idea: "raw", classification: null, plan: null, tasks: null, pinned: false,
    buildArtifactId: null, buildPreviewHtml: null, executionState: null, executionJobId: null,
    executionError: null, decidedAt: null, createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z", ...overrides,
  };
}

test("shaping always hands off to the human gate, never past it", () => {
  expect(pipelineStageAfterShaping()).toBe("review");
});

test("a job may shape from capture but never approve", () => {
  expect(pipelineCanShape(item({ id: "1", stage: "inbox" }))).toBe(true);
  expect(pipelineCanShape(item({ id: "2", stage: "shaping" }))).toBe(true);
  // Nothing may re-shape an item sitting at the gate or beyond.
  expect(pipelineCanShape(item({ id: "3", stage: "review" }))).toBe(false);
  expect(pipelineCanShape(item({ id: "4", stage: "building" }))).toBe(false);
  // A run already in flight blocks a second dispatch.
  expect(pipelineCanShape(item({ id: "5", stage: "inbox", executionState: "running" }))).toBe(false);
});

test("build is only available after approval moved the item to Execute", () => {
  expect(pipelineCanBuild(item({ id: "1", stage: "review" }))).toBe(false);
  expect(pipelineCanBuild(item({ id: "2", stage: "building" }))).toBe(true);
  expect(pipelineCanBuild(item({ id: "3", stage: "building", executionState: "queued" }))).toBe(false);
});

test("parses a well-formed shaping response", () => {
  const parsed = parsePipelineShape('```json\n{"route":"project","title":"Ship pricing","confidence":0.82,"tags":["pricing","web"],"classification":"A multi-step build.","plan":"- step one\\n- step two","tasks":"- [ ] one\\n- [ ] two"}\n```');
  expect(parsed?.route).toBe("project");
  expect(parsed?.confidence).toBeCloseTo(0.82);
  expect(parsed?.tags).toEqual(["pricing", "web"]);
});

test("rejects a shaping response rather than writing a half-filled item", () => {
  // Unknown route.
  expect(parsePipelineShape('```json\n{"route":"banana","classification":"c","plan":"p","tasks":"t"}\n```')).toBeNull();
  // Missing plan.
  expect(parsePipelineShape('```json\n{"route":"idea","classification":"c","tasks":"t"}\n```')).toBeNull();
  // Not JSON at all — the failure mode we actually saw in the wild.
  expect(parsePipelineShape("Sure! Here is my classification: this is a project.")).toBeNull();
});

test("clamps a nonsense confidence into range and defaults a missing one", () => {
  const high = parsePipelineShape('```json\n{"route":"action","confidence":9,"classification":"c","plan":"p","tasks":"t"}\n```');
  expect(high?.confidence).toBe(1);
  const missing = parsePipelineShape('```json\n{"route":"action","classification":"c","plan":"p","tasks":"t"}\n```');
  expect(missing?.confidence).toBe(0.5);
});

test("slugs stay unique per tenant", () => {
  expect(pipelineSlugify("Ship the Pricing Page!")).toBe("ship-the-pricing-page");
  expect(pipelineUniqueSlug("Ship it", [])).toBe("ship-it");
  expect(pipelineUniqueSlug("Ship it", ["ship-it"])).toBe("ship-it-2");
  expect(pipelineUniqueSlug("Ship it", ["ship-it", "ship-it-2"])).toBe("ship-it-3");
});

test("columns sort pinned first then newest", () => {
  const items = [
    item({ id: "a", stage: "inbox", title: "old", createdAt: "2026-08-01T00:00:00.000Z" }),
    item({ id: "b", stage: "inbox", title: "new", createdAt: "2026-08-08T00:00:00.000Z" }),
    item({ id: "c", stage: "inbox", title: "pinned old", pinned: true, createdAt: "2026-07-01T00:00:00.000Z" }),
    item({ id: "d", stage: "shipped", title: "elsewhere" }),
  ];
  expect(pipelineColumnItems(items, "inbox").map((entry) => entry.title)).toEqual(["pinned old", "new", "old"]);
  expect(pipelineCounts(items)).toEqual({ inbox: 3, shipped: 1 });
});

test("status labels report the real state", () => {
  expect(pipelineStatusLabel(item({ id: "1", stage: "review" }))).toContain("human gate");
  expect(pipelineStatusLabel(item({ id: "2", executionState: "failed", executionError: "budget_exceeded" }))).toContain("budget_exceeded");
  expect(pipelineStatusLabel(item({ id: "3", stage: "shipped", buildArtifactId: "a" }))).toContain("artifact");
  expect(pipelineStatusLabel(item({ id: "4", stage: "rejected" }))).toContain("Rejected");
});

test("prompts carry the item and ask for the right output, with no local paths", () => {
  const shape = pipelineShapePrompt({ idea: "Build a pricing page", title: "Pricing" });
  expect(shape).toContain("```json");
  expect(shape).toContain("Build a pricing page");
  const build = pipelineBuildPrompt(item({ id: "1", title: "Pricing", idea: "tiers", plan: "- a", tasks: "- [ ] b" }));
  expect(build).toContain("```html");
  expect(build).toContain("- [ ] b");
  for (const prompt of [shape, build]) {
    expect(prompt).not.toMatch(/localhost|127\.0\.0\.1|Obsidian|\/Users\//);
    expect(prompt.length).toBeLessThanOrEqual(20_000);
  }
});

test("normalizes unknown stages and routes to safe values", () => {
  const normalized = normalizePipelineItem({ id: "x", stage: "wat", route: "banana", confidence: "0.4", tags: ["a", 3], pinned: "yes" });
  expect(normalized.stage).toBe("inbox");
  expect(normalized.route).toBeNull();
  expect(normalized.confidence).toBeCloseTo(0.4);
  expect(normalized.tags).toEqual(["a"]);
  // Only a real boolean true pins an item.
  expect(normalized.pinned).toBe(false);
});

test("detects an unapplied pipeline migration", () => {
  expect(pipelineSchemaMissing(404)).toBe(true);
  expect(pipelineSchemaMissing(400, { code: "PGRST205", message: "client_pipeline_items" })).toBe(true);
  expect(pipelineSchemaMissing(401)).toBe(false);
});
