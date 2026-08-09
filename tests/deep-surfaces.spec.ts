import { expect, test } from "@playwright/test";
import { DEEP_SURFACES, deepGoal, deepMode, deepSurface } from "../src/lib/clientDeepSurfaces";
import { isClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";

const KEYS = Object.keys(DEEP_SURFACES);

test("covers the multi-mode surfaces this batch was meant to reach", () => {
  // radar moved to its own surface so it could keep the local structure
  // (signals/published) and the oracle orb.
  expect(KEYS.sort()).toEqual(["leads", "video"]);
});

test("every surface queues a lane the runner accepts", () => {
  for (const key of KEYS) expect(isClientWorkspaceSurface(DEEP_SURFACES[key].surface), key).toBe(true);
});

test("each surface has its own identity rather than shared filler", () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const key of KEYS) {
    const config = DEEP_SURFACES[key];
    expect(config.description.length, key).toBeGreaterThan(60);
    expect(config.modes.length, `${key} needs more than one mode`).toBeGreaterThanOrEqual(2);
    titles.add(config.title);
    descriptions.add(config.description);
  }
  expect(titles.size).toBe(KEYS.length);
  expect(descriptions.size).toBe(KEYS.length);
});

test("every mode is a distinct kind of work with its own input", () => {
  for (const key of KEYS) {
    const config = DEEP_SURFACES[key];
    const labels = config.modes.map((mode) => mode.label);
    const actions = config.modes.map((mode) => mode.action);
    const subjects = config.modes.map((mode) => mode.subjectLabel);
    expect(new Set(labels).size, `${key} mode labels`).toBe(labels.length);
    expect(new Set(actions).size, `${key} mode actions`).toBe(actions.length);
    // If every mode asked for the same input it would be one screen wearing hats.
    expect(new Set(subjects).size, `${key} subject labels`).toBe(subjects.length);
    for (const mode of config.modes) {
      expect(mode.presets.length, `${key}/${mode.key} presets`).toBeGreaterThanOrEqual(3);
      for (const preset of mode.presets) expect(preset.direction.length, `${key}/${mode.key}/${preset.label}`).toBeGreaterThan(40);
    }
  }
});

test("every surface names its blocked capabilities and says what it does not do", () => {
  for (const key of KEYS) {
    const config = DEEP_SURFACES[key];
    expect(config.gates.length, `${key} gates`).toBeGreaterThanOrEqual(2);
    for (const gate of config.gates) {
      expect(gate.title.length).toBeGreaterThan(0);
      expect(gate.detail.length).toBeGreaterThan(80);
      // A gate that does not say what is NOT happening is just marketing.
      expect(gate.detail.toLowerCase()).toMatch(/\b(no|not|does not|nothing)\b/);
    }
  }
});

test("goals forbid claiming retrieval, and label pasted material as supplied", () => {
  const config = deepSurface("leads")!;
  const mode = deepMode(config, "outreach");
  const goal = deepGoal({ mode, subject: "VP Marketing at a Series B", direction: "Write a cold email.", source: "They just hired three AEs." });
  expect(goal).toContain("you did not retrieve this");
  expect(goal).toContain("They just hired three AEs.");
  expect(goal).toContain("Do not claim to have visited a site");
});

test("goals stay inside the executions route's limit with large pasted material", () => {
  const config = deepSurface("video")!;
  const goal = deepGoal({ mode: deepMode(config, "script"), subject: "s", direction: "d", source: "x".repeat(40_000) });
  expect(goal.length).toBeLessThanOrEqual(10_000);
});

test("an unknown surface or mode resolves rather than producing a broken screen", () => {
  expect(deepSurface("not-a-surface")).toBeNull();
  const config = deepSurface("video")!;
  expect(deepMode(config, "nonsense").key).toBe(config.modes[0].key);
});
