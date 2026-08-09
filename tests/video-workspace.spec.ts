import { expect, test } from "@playwright/test";
import {
  VIDEO_GATES,
  VIDEO_LENGTHS,
  VIDEO_SCRIPT_PRESETS,
  VIDEO_STORYBOARD_PRESETS,
  VIDEO_TABS,
  videoLength,
  videoScriptGoal,
  videoStoryboardGoal,
  videoTitle,
} from "../src/lib/clientVideoWorkspace";
import { isClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";
import { isStudioSurface } from "../src/lib/clientStudioSurfaces";
import { deepSurface } from "../src/lib/clientDeepSurfaces";
import type { ClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";

test("video has exactly one hosted implementation", () => {
  expect(isClientWorkspaceSurface("video")).toBe(true);
  expect(isStudioSurface("video" as ClientWorkspaceSurface)).toBe(false);
  expect(deepSurface("video")).toBeNull();
});

test("the local studio's shape survives: make, plan, and a body of work", () => {
  // Local keeps render history and avatar history. Dropping the library was the
  // difference between a correct surface and the same product.
  expect(VIDEO_TABS.map((tab) => tab.key)).toEqual(["script", "storyboard", "library"]);
});

test("the two lanes ask for genuinely different work", () => {
  const script = videoScriptGoal({ subject: "s", direction: "Write the script.", length: "standard" });
  const board = videoStoryboardGoal({ subject: "s", direction: "Break it into shots." });
  expect(script).toContain("words a person will say out loud");
  expect(board).toContain("Plan only what the available footage");
  expect(script).not.toBe(board);
});

test("length changes the instruction rather than only the label", () => {
  const directions = VIDEO_LENGTHS.map((item) => item.direction);
  expect(new Set(directions).size).toBe(VIDEO_LENGTHS.length);
  expect(videoScriptGoal({ subject: "s", direction: "d", length: "short" })).toContain("30 seconds");
  expect(videoScriptGoal({ subject: "s", direction: "d", length: "long" })).toContain("two minutes");
  expect(videoLength("nonsense")).toBe("standard");
});

test("neither lane may invent material it was not given", () => {
  const script = videoScriptGoal({ subject: "s", direction: "d", length: "standard" });
  expect(script).toContain("Do not invent statistics");
  expect(script).toContain("Do not describe footage you were not told exists");
  const board = videoStoryboardGoal({ subject: "s", direction: "d" });
  expect(board).toContain("Do not assume access to stock libraries");
});

test("supplied material is labelled as supplied", () => {
  const script = videoScriptGoal({ subject: "s", direction: "d", length: "standard", source: "interview transcript" });
  expect(script).toContain("you did not retrieve this");
  expect(script).toContain("interview transcript");
});

test("goals stay inside the executions route's limit", () => {
  const huge = "x".repeat(40_000);
  expect(videoScriptGoal({ subject: "s", direction: "d", length: "standard", source: huge }).length).toBeLessThanOrEqual(10_000);
  expect(videoStoryboardGoal({ subject: "s", direction: "d", source: huge }).length).toBeLessThanOrEqual(10_000);
});

test("the gates name the actual provider rather than saying it is unavailable", () => {
  const detail = VIDEO_GATES.map((gate) => gate.detail).join(" ");
  // Naming HeyGen and Hyperframes tells a client what to approve; "unavailable"
  // tells them nothing.
  expect(detail).toContain("HeyGen");
  expect(detail).toContain("Hyperframes");
  expect(detail).toContain("No provider is contacted");
  expect(detail).toContain("not enabled for this tenant");
});

test("presets carry real direction and titles name the lane", () => {
  for (const preset of [...VIDEO_SCRIPT_PRESETS, ...VIDEO_STORYBOARD_PRESETS]) {
    expect(preset.direction.length).toBeGreaterThan(40);
  }
  expect(videoTitle({ tab: "script", subject: "Launch film" })).toBe("Script · Launch film");
  expect(videoTitle({ tab: "storyboard", subject: "Launch film" })).toBe("Storyboard · Launch film");
});
