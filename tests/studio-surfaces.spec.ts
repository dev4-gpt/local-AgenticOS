import { expect, test } from "@playwright/test";
import { STUDIO_SURFACES, isStudioSurface, studioGoal, studioSurface } from "../src/lib/clientStudioSurfaces";
import { isClientWorkspaceSurface, type ClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";

const SURFACES = Object.keys(STUDIO_SURFACES) as ClientWorkspaceSurface[];

test("covers every Create, Govern, and Deliver route the batch was meant to reach", () => {
  const expected = [
    "create", "opendesign", "web-studio", "flow-lab", "video", "studio", "openmontage", "music", "games", "thumbnails",
    "seo", "seo-guide", "guide", "integrations",
    "deliver", "leads", "radar",
  ];
  for (const surface of expected) expect(isStudioSurface(surface as ClientWorkspaceSurface), `${surface} missing`).toBe(true);
  expect(SURFACES).toHaveLength(expected.length);
});

test("every configured key is a real workspace surface the runner accepts", () => {
  // A typo here would queue a job the worker rejects as an invalid surface.
  for (const surface of SURFACES) expect(isClientWorkspaceSurface(surface), `${surface} is not a runner surface`).toBe(true);
});

test("each surface has its own identity rather than shared filler", () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const surface of SURFACES) {
    const config = studioSurface(surface)!;
    expect(config.title.length, `${surface} title`).toBeGreaterThan(0);
    expect(config.description.length, `${surface} description`).toBeGreaterThan(40);
    expect(config.presets.length, `${surface} presets`).toBeGreaterThanOrEqual(3);
    expect(config.fields.some((field) => field.key === "title"), `${surface} needs a title field`).toBe(true);
    expect(config.fields.some((field) => field.key === "goal"), `${surface} needs a goal field`).toBe(true);
    titles.add(config.title);
    descriptions.add(config.description);
  }
  // The whole point of the batch is that these stopped being interchangeable.
  expect(titles.size).toBe(SURFACES.length);
  expect(descriptions.size).toBe(SURFACES.length);
});

test("presets carry a usable title and goal, not just a label", () => {
  for (const surface of SURFACES) {
    for (const preset of studioSurface(surface)!.presets) {
      expect(preset.title.length, `${surface}/${preset.label} title`).toBeGreaterThan(0);
      expect(preset.goal.length, `${surface}/${preset.label} goal`).toBeGreaterThan(30);
    }
  }
});

test("surfaces whose capability is not active say so", () => {
  // These four cannot produce their real output yet; each must explain why
  // rather than implying the asset was made.
  for (const surface of ["video", "music", "thumbnails", "openmontage"] as ClientWorkspaceSurface[]) {
    expect(studioSurface(surface)!.pendingCapability, `${surface} must state its blocked prerequisite`).toBeTruthy();
  }
  // A surface that fully works should not carry a caveat.
  expect(studioSurface("web-studio")!.pendingCapability).toBeUndefined();
  expect(studioSurface("opendesign")!.pendingCapability).toBeUndefined();
});

test("preview surfaces are the ones that genuinely render something", () => {
  for (const surface of ["opendesign", "web-studio", "games"] as ClientWorkspaceSurface[]) {
    expect(studioSurface(surface)!.artifactIntent).toBe("preview");
  }
  // A brief surface must not claim a preview it cannot produce.
  for (const surface of ["video", "leads", "deliver", "guide"] as ClientWorkspaceSurface[]) {
    expect(studioSurface(surface)!.artifactIntent).toBe("brief");
  }
});

test("a reference URL is passed as context, never as an instruction to fetch it", () => {
  const goal = studioGoal({ goal: "Plan the SEO work", reference: "https://example.com" });
  expect(goal).toContain("https://example.com");
  expect(goal).toContain("do not claim to have visited it");
  // Nothing on this surface crawls; the research adapter does, separately.
  expect(goal).not.toMatch(/fetch|crawl|visit the/i);
});

test("the goal stays bounded and works without a reference", () => {
  expect(studioGoal({ goal: "x".repeat(20_000) }).length).toBeLessThanOrEqual(10_000);
  expect(studioGoal({ goal: "  Plain goal  " })).toBe("Plain goal");
  expect(studioGoal({ goal: "Plain goal", reference: "   " })).toBe("Plain goal");
});

test("an unconfigured surface resolves to null rather than a broken screen", () => {
  expect(studioSurface("paperclip" as ClientWorkspaceSurface)).toBeNull();
  expect(isStudioSurface("room" as ClientWorkspaceSurface)).toBe(false);
});
