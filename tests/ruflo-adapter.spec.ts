import { expect, test } from "@playwright/test";
import {
  RUFLO_MAX_AGENTS, RUFLO_PRESETS, normalizeRufloAgent, normalizeRufloSwarm, rufloAgentPrompt,
  rufloAgentTask, rufloProgress, rufloReportPrompt, rufloRoster, rufloSchemaMissing, rufloStatusLabel,
  type RufloSwarm,
} from "../src/lib/clientRufloAdapter";

function swarm(overrides: Partial<RufloSwarm> & { id: string }): RufloSwarm {
  return {
    objective: "o", topology: "hierarchical", preset: "seo", status: "queued", jobId: null,
    provider: null, model: null, agentCount: 12, completedCount: 0, failedCount: 0, report: null,
    reportArtifactId: null, costMicros: 0, errorCode: null,
    createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z", ...overrides,
  };
}

test("the SEO roster mirrors the local one and stays within the cap", () => {
  const roster = rufloRoster("seo");
  expect(roster).toHaveLength(12);
  expect(roster.length).toBeLessThanOrEqual(RUFLO_MAX_AGENTS);
  expect(roster.map((entry) => entry.name)).toContain("keyword-research");
  expect(roster.map((entry) => entry.name)).toContain("seo-qa-reviewer");
  // The local code had to remap agent types the CLI rejected; keep those.
  expect(roster.find((entry) => entry.name === "core-web-vitals")?.type).toBe("performance-engineer");
  expect(roster.every((entry) => entry.angle.length > 0)).toBe(true);
});

test("every roster name is unique, since the row is keyed on it", () => {
  for (const [key, preset] of Object.entries(RUFLO_PRESETS)) {
    const names = preset.roster.map((entry) => entry.name);
    expect(new Set(names).size, `${key} has duplicate agent names`).toBe(names.length);
  }
});

test("an unknown preset falls back rather than producing an empty swarm", () => {
  expect(rufloRoster("does-not-exist").length).toBeGreaterThan(0);
});

test("the agent task mirrors the local wording", () => {
  const task = rufloAgentTask({ type: "researcher", name: "keyword-research", angle: "x" }, "Rank for hosted agent platforms");
  expect(task).toBe("keyword research for: Rank for hosted agent platforms");
});

test("an agent prompt carries only its own angle and no local references", () => {
  const prompt = rufloAgentPrompt({
    entry: { type: "analyst", name: "competitor-analysis", angle: "who currently ranks and why" },
    objective: "Rank for hosted agent platforms",
  });
  expect(prompt).toContain("competitor analysis");
  expect(prompt).toContain("who currently ranks and why");
  expect(prompt).toContain("do not restate the whole plan");
  expect(prompt).not.toMatch(/localhost|ruflo CLI|\.claude-flow|Ollama/i);
  expect(prompt.length).toBeLessThanOrEqual(20_000);
});

test("the report prompt only carries findings and stays bounded", () => {
  const findings = Array.from({ length: 12 }, (_, index) => ({ name: `agent-${index}`, output: "x".repeat(3000) }));
  const prompt = rufloReportPrompt({ objective: "Rank higher", findings });
  expect(prompt).toContain("```html");
  expect(prompt).toContain("agent 0");
  expect(prompt.length).toBeLessThanOrEqual(20_000);
});

test("a swarm with no findings still produces a valid report prompt", () => {
  const prompt = rufloReportPrompt({ objective: "Rank higher", findings: [] });
  expect(prompt).toContain("Rank higher");
});

test("progress counts settled agents, including failures", () => {
  expect(rufloProgress(swarm({ id: "1", agentCount: 12, completedCount: 3, failedCount: 3 }))).toBe(50);
  expect(rufloProgress(swarm({ id: "2", agentCount: 0 }))).toBe(0);
  expect(rufloProgress(swarm({ id: "3", agentCount: 4, completedCount: 4 }))).toBe(100);
});

test("status labels admit partial failure rather than claiming a clean run", () => {
  expect(rufloStatusLabel(swarm({ id: "1", status: "running", agentCount: 12, completedCount: 5 }))).toBe("5/12 agents reported");
  expect(rufloStatusLabel(swarm({ id: "2", status: "completed", failedCount: 2, reportArtifactId: "a" }))).toContain("2 agents failing");
  expect(rufloStatusLabel(swarm({ id: "3", status: "completed", reportArtifactId: "a" }))).toBe("Completed");
  expect(rufloStatusLabel(swarm({ id: "4", status: "failed", errorCode: "budget_exceeded" }))).toContain("budget_exceeded");
});

test("a swarm whose coordinator report failed does not read as a clean run", () => {
  // Found by the controlled cloud failure drill: twelve agents reported, the
  // coordinator's output failed artifact validation, and the swarm still said
  // "Completed" with a null error code and no report to show for it.
  const noReport = swarm({ id: "5", status: "completed", completedCount: 12, reportArtifactId: null });
  expect(rufloStatusLabel(noReport)).toContain("coordinator report was not usable");
  expect(rufloStatusLabel(noReport)).not.toBe("Completed");

  // The agents' own work is still reported honestly alongside the caveat.
  expect(rufloStatusLabel(swarm({ id: "6", status: "completed", failedCount: 2, reportArtifactId: null }))).toContain("2 agents failing");
});

test("normalizers reject unknown enum values from the row", () => {
  const normalized = normalizeRufloSwarm({ id: "s", topology: "spiral", status: "vibing", agent_count: "12" });
  expect(normalized.topology).toBe("hierarchical");
  expect(normalized.status).toBe("queued");
  expect(normalized.agentCount).toBe(12);

  const agent = normalizeRufloAgent({ id: "a", status: "dreaming", position: "3", cost_micros: "40" });
  expect(agent.status).toBe("idle");
  expect(agent.position).toBe(3);
  expect(agent.costMicros).toBe(40);
});

test("detects an unapplied ruflo migration", () => {
  expect(rufloSchemaMissing(404)).toBe(true);
  expect(rufloSchemaMissing(400, { code: "PGRST205", message: "client_ruflo_swarms" })).toBe(true);
  expect(rufloSchemaMissing(401)).toBe(false);
});
