import { expect, test } from "@playwright/test";
import {
  RADAR_FORMATS,
  RADAR_PUBLISH_NOTICE,
  RADAR_SIGNAL_PRESETS,
  RADAR_SWEEP_NOTICE,
  RADAR_TABS,
  radarDraftGoal,
  radarFormat,
  radarSignalTitle,
} from "../src/lib/clientRadarWorkspace";
import { isClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";
import { isStudioSurface } from "../src/lib/clientStudioSurfaces";
import { deepSurface } from "../src/lib/clientDeepSurfaces";
import type { ClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";

test("radar has exactly one hosted implementation", () => {
  expect(isClientWorkspaceSurface("radar")).toBe(true);
  // It used to live on the shared studio screen, then the shared multi-mode
  // config. Both must stay clear or the route has competing definitions.
  expect(isStudioSurface("radar" as ClientWorkspaceSurface)).toBe(false);
  expect(deepSurface("radar")).toBeNull();
});

test("the local structure is preserved: signals and published", () => {
  expect(RADAR_TABS.map((tab) => tab.key)).toEqual(["signals", "published"]);
});

test("the draft goal carries the signal the client brought", () => {
  const goal = radarDraftGoal({
    headline: "A competitor shipped annual billing",
    whyNow: "It resets what buyers expect",
    angle: "Say what it changes and what it does not",
    format: "thread",
  });
  expect(goal).toContain("A competitor shipped annual billing");
  expect(goal).toContain("It resets what buyers expect");
  expect(goal).toContain("Say what it changes and what it does not");
  expect(goal).toContain("one idea per post");
});

test("the run is told it did not find the signal and has not read the source", () => {
  // The local sweep reads the actual post; this one never does, so the draft
  // must not quote it or attribute figures to it.
  const goal = radarDraftGoal({ headline: "h", whyNow: "", angle: "", format: "post" });
  expect(goal).toContain("You did not find it");
  expect(goal).toContain("do not quote it");
});

test("optional fields are omitted rather than sent empty", () => {
  const goal = radarDraftGoal({ headline: "h", whyNow: "", angle: "", format: "post" });
  expect(goal).not.toContain("Why it matters now:");
  expect(goal).not.toContain("The angle to take:");
});

test("the goal stays inside the executions route's limit", () => {
  const goal = radarDraftGoal({ headline: "x".repeat(9_000), whyNow: "y".repeat(9_000), angle: "z".repeat(9_000), format: "essay" });
  expect(goal.length).toBeLessThanOrEqual(10_000);
});

test("each format is a genuinely different instruction", () => {
  const directions = RADAR_FORMATS.map((item) => item.direction);
  expect(new Set(directions).size).toBe(RADAR_FORMATS.length);
  for (const item of RADAR_FORMATS) expect(item.direction.length).toBeGreaterThan(40);
  expect(radarFormat("nonsense")).toBe("post");
});

test("presets fill every field rather than just a label", () => {
  for (const preset of RADAR_SIGNAL_PRESETS) {
    expect(preset.headline.length).toBeGreaterThan(10);
    expect(preset.whyNow.length).toBeGreaterThan(20);
    expect(preset.angle.length).toBeGreaterThan(20);
  }
});

test("the blocked sweep names what it needs and what it does not do", () => {
  // The local sweep needs the operator's own xAI account and Obsidian vault.
  expect(RADAR_SWEEP_NOTICE).toContain("Grok");
  expect(RADAR_SWEEP_NOTICE).toContain("Obsidian");
  expect(RADAR_SWEEP_NOTICE).toContain("nothing on this surface searches, crawls, or reads a feed");
  expect(RADAR_PUBLISH_NOTICE).toContain("No destination is contacted");
});

test("titles stay bounded and name the format", () => {
  expect(radarSignalTitle({ headline: "Annual billing shipped", format: "thread" })).toBe("Thread · Annual billing shipped");
  expect(radarSignalTitle({ headline: "x".repeat(400), format: "post" }).length).toBeLessThan(130);
});
