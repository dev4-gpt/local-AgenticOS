import { expect, test } from "@playwright/test";
import { DEEP_SURFACES, deepGoal, deepMode, deepSurface } from "../src/lib/clientDeepSurfaces";
import { isClientWorkspaceSurface } from "../src/lib/clientWorkspaceExecution";

const KEYS = Object.keys(DEEP_SURFACES);

test("covers the multi-mode surfaces this batch was meant to reach", () => {
  // radar moved to its own surface so it could keep the local structure
  // (signals/published) and the oracle orb.
  expect(KEYS.sort()).toEqual(["leads", "music", "openmontage", "studio", "thumbnails"]);
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
    expect(config.gates.length, `${key} gates`).toBeGreaterThanOrEqual(1);
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
  const config = deepSurface("leads")!;
  const goal = deepGoal({ mode: deepMode(config, "icp"), subject: "s", direction: "d", source: "x".repeat(40_000) });
  expect(goal.length).toBeLessThanOrEqual(10_000);
});

test("an unknown surface or mode resolves rather than producing a broken screen", () => {
  expect(deepSurface("not-a-surface")).toBeNull();
  const config = deepSurface("leads")!;
  expect(deepMode(config, "nonsense").key).toBe(config.modes[0].key);
});

test("media gates name the provider rather than saying generation is unavailable", () => {
  // "Unavailable" tells a client nothing; the provider name tells them what to
  // approve. These are the providers the local surfaces actually call.
  const named: Record<string, string[]> = {
    music: ["ElevenLabs", "Suno"],
    thumbnails: ["OpenAI", "sharp"],
    openmontage: ["ffmpeg"],
  };
  for (const [key, providers] of Object.entries(named)) {
    const detail = DEEP_SURFACES[key].gates.map((gate) => gate.detail).join(" ");
    for (const provider of providers) expect(detail, `${key} should name ${provider}`).toContain(provider);
  }
});

test("no media surface implies it produced a file", () => {
  for (const key of ["studio", "music", "openmontage", "thumbnails"]) {
    const detail = DEEP_SURFACES[key].gates.map((gate) => gate.detail).join(" ");
    expect(detail.toLowerCase(), `${key}`).toMatch(/no (provider is contacted|footage is processed)/);
    expect(detail.toLowerCase(), `${key}`).toMatch(/is produced here|no video file|no image file|no audio file|no asset file/);
  }
});

test("only surfaces with a real hosted provider offer generation", () => {
  // Assembly needs a render worker that does not exist hosted, so OpenMontage
  // must not grow a generate button just because its siblings have one.
  expect(DEEP_SURFACES.openmontage.generation).toBeUndefined();
  expect(DEEP_SURFACES.leads.generation).toBeUndefined();
  for (const key of ["studio", "music", "thumbnails"]) {
    expect(DEEP_SURFACES[key].generation, `${key} should offer generation`).toBeTruthy();
  }
});

test("each generation lane names a provider the media worker actually accepts", () => {
  // The worker rejects anything outside this set with provider_not_allowed.
  const accepted = new Set(["elevenlabs", "openai", "suno", "heygen"]);
  for (const key of Object.keys(DEEP_SURFACES)) {
    const generation = DEEP_SURFACES[key].generation;
    if (!generation) continue;
    expect(accepted.has(generation.provider), `${key} names ${generation.provider}`).toBe(true);
    expect(generation.capability).toBe("media");
  }
});

test("generation states its cost before the button is pressed", () => {
  // These providers are metered per run, and one render is a visible fraction
  // of a small monthly cap. A client should know that before clicking.
  for (const key of Object.keys(DEEP_SURFACES)) {
    const generation = DEEP_SURFACES[key].generation;
    if (!generation) continue;
    expect(generation.costHint.length, `${key} cost hint`).toBeGreaterThan(30);
    expect(generation.costHint, `${key} should quote a figure`).toMatch(/\$[0-9]/);
  }
});
