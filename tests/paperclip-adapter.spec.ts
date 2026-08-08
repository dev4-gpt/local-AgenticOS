import { expect, test } from "@playwright/test";
import {
  normalizePaperclipAgent,
  normalizePaperclipIssue,
  paperclipBuilds,
  paperclipCostRows,
  paperclipDefaultPrefix,
  paperclipOrgChart,
  paperclipRunPrompt,
  paperclipSchemaMissing,
  paperclipStats,
  paperclipUrlKey,
  sortPaperclipAgents,
  type PaperclipAgent,
  type PaperclipCompany,
  type PaperclipIssue,
  type PaperclipProject,
  type PaperclipRun,
} from "../src/lib/clientPaperclipAdapter";

const COMPANY: PaperclipCompany = {
  name: "Veloce Cloud Test",
  description: "",
  issuePrefix: "VEL",
  issueCounter: 4,
  brandColor: "#d4a574",
  budgetMicros: 1_000_000,
  status: "active",
};

function agent(overrides: Partial<PaperclipAgent> & { id: string; name: string }): PaperclipAgent {
  return {
    role: "", title: "", icon: "", status: "idle", reportsTo: null, provider: "", model: "",
    budgetMicros: 0, lastHeartbeatAt: null, urlKey: overrides.id, ...overrides,
  };
}

function issue(overrides: Partial<PaperclipIssue> & { id: string }): PaperclipIssue {
  return {
    identifier: "VEL-1", issueNumber: 1, title: "Build", description: "", status: "backlog",
    priority: "medium", projectId: null, assigneeAgentId: null, labels: [], executionState: null,
    executionJobId: null, buildArtifactId: null, buildPreviewHtml: null, startedAt: null,
    completedAt: null, createdAt: "2026-08-08T10:00:00.000Z", updatedAt: "2026-08-08T10:00:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<PaperclipRun> & { id: string }): PaperclipRun {
  return {
    issueId: null, agentId: null, jobId: null, status: "succeeded", provider: "openrouter",
    model: "test-model", summary: "", errorCode: null, costMicros: 0, startedAt: null,
    finishedAt: "2026-08-08T11:00:00.000Z", createdAt: "2026-08-08T11:00:00.000Z", ...overrides,
  };
}

test("normalizes unknown enum values to safe defaults instead of trusting the row", () => {
  const normalized = normalizePaperclipIssue({ id: "a", status: "wat", priority: "urgent", execution_state: "exploded", labels: ["ok", 7] });
  expect(normalized.status).toBe("backlog");
  expect(normalized.priority).toBe("medium");
  expect(normalized.executionState).toBeNull();
  expect(normalized.labels).toEqual(["ok"]);
});

test("normalizes an agent row and falls back title to role", () => {
  const normalized = normalizePaperclipAgent({ id: "a", name: "Ada", role: "CTO", budget_monthly_micros: "2500" });
  expect(normalized.title).toBe("CTO");
  expect(normalized.budgetMicros).toBe(2500);
  expect(normalized.status).toBe("idle");
});

test("derives a stable identifier prefix from the tenant slug", () => {
  expect(paperclipDefaultPrefix("veloce-cloud-test")).toBe("VEL");
  expect(paperclipDefaultPrefix("x")).toBe("PCL");
  expect(paperclipUrlKey("Launch Site!", "fallback")).toBe("launch-site");
  expect(paperclipUrlKey("!!!", "fallback")).toBe("fallback");
});

test("orders the roster by org rank then name", () => {
  const sorted = sortPaperclipAgents([
    agent({ id: "3", name: "Zoe", role: "Engineer" }),
    agent({ id: "1", name: "Ada", role: "CEO" }),
    agent({ id: "2", name: "Bo", role: "CTO" }),
  ]);
  expect(sorted.map((entry) => entry.name)).toEqual(["Ada", "Bo", "Zoe"]);
});

test("builds a reporting tree and never drops an agent to a broken or cyclic manager", () => {
  const chart = paperclipOrgChart([
    agent({ id: "ceo", name: "Ada", role: "CEO" }),
    agent({ id: "cto", name: "Bo", role: "CTO", reportsTo: "ceo" }),
    agent({ id: "eng", name: "Cy", role: "Engineer", reportsTo: "cto" }),
    agent({ id: "orphan", name: "Dee", reportsTo: "missing-manager" }),
  ]);
  const roots = chart.map((node) => node.agent.name);
  expect(roots).toContain("Ada");
  expect(roots).toContain("Dee");
  expect(chart.find((node) => node.agent.id === "ceo")?.reports[0]?.agent.name).toBe("Bo");

  const cyclic = paperclipOrgChart([
    agent({ id: "a", name: "A", reportsTo: "b" }),
    agent({ id: "b", name: "B", reportsTo: "a" }),
  ]);
  expect(cyclic.length).toBeGreaterThan(0);
  expect(countNodes(cyclic)).toBe(2);
});

test("a board with no settled runs reports full success rather than zero", () => {
  const stats = paperclipStats({ agents: [], issues: [], runs: [], company: COMPANY });
  expect(stats.successRate).toBe(100);
  expect(stats.runs24h).toBe(0);
});

test("counts only the last 24 hours of runs and sums settled cost across all of them", () => {
  const now = Date.parse("2026-08-08T12:00:00.000Z");
  const stats = paperclipStats({
    agents: [agent({ id: "a", name: "Ada" }), agent({ id: "b", name: "Bo", status: "paused" })],
    issues: [issue({ id: "1", status: "done", buildArtifactId: "art-1" }), issue({ id: "2" })],
    runs: [
      run({ id: "r1", costMicros: 500, finishedAt: "2026-08-08T11:00:00.000Z" }),
      run({ id: "r2", status: "failed", costMicros: 100, finishedAt: "2026-08-08T09:00:00.000Z" }),
      run({ id: "r3", costMicros: 900, finishedAt: "2026-08-01T09:00:00.000Z" }),
    ],
    company: COMPANY,
    now,
  });
  expect(stats.runs24h).toBe(2);
  expect(stats.succeeded).toBe(1);
  expect(stats.failed).toBe(1);
  expect(stats.successRate).toBe(50);
  expect(stats.onlineAgents).toBe(1);
  expect(stats.builds).toBe(1);
  expect(stats.doneIssues).toBe(1);
  expect(stats.spentMicros).toBe(1500);
});

test("the gallery only shows issues with a committed artifact, newest first", () => {
  const projects: PaperclipProject[] = [{ id: "p1", name: "Launch", urlKey: "launch", description: "", color: "#d4a574", icon: "", status: "active", targetDate: null, createdAt: "" }];
  const builds = paperclipBuilds({
    issues: [
      issue({ id: "1", identifier: "VEL-1", buildArtifactId: "art-old", completedAt: "2026-08-01T00:00:00.000Z" }),
      issue({ id: "2", identifier: "VEL-2" }),
      issue({ id: "3", identifier: "VEL-3", buildArtifactId: "art-new", completedAt: "2026-08-07T00:00:00.000Z", assigneeAgentId: "a", projectId: "p1" }),
    ],
    agents: [agent({ id: "a", name: "Ada", icon: "🛠" })],
    projects,
  });
  expect(builds.map((build) => build.identifier)).toEqual(["VEL-3", "VEL-1"]);
  expect(builds[0].agent).toBe("Ada");
  expect(builds[0].project).toBe("Launch");
});

test("cost rows attribute spend to the agent that ran it", () => {
  const rows = paperclipCostRows(
    [agent({ id: "a", name: "Ada", budgetMicros: 1000 }), agent({ id: "b", name: "Bo" })],
    [run({ id: "r1", agentId: "a", costMicros: 400 }), run({ id: "r2", agentId: "a", costMicros: 200 }), run({ id: "r3", agentId: null, costMicros: 999 })],
  );
  const ada = rows.find((row) => row.name === "Ada");
  expect(ada?.spentMicros).toBe(600);
  expect(ada?.runs).toBe(2);
  expect(rows.find((row) => row.name === "Bo")?.spentMicros).toBe(0);
});

test("the run prompt carries the agent persona and issue identity and never a local path", () => {
  const prompt = paperclipRunPrompt({
    company: COMPANY,
    issue: { identifier: "VEL-7", title: "Ship a pricing page", description: "Three tiers.", priority: "high" },
    agent: agent({ id: "a", name: "Ada", role: "CTO", title: "Chief Technology Officer" }),
    project: "Launch",
  });
  expect(prompt).toContain("Ada");
  expect(prompt).toContain("Chief Technology Officer");
  expect(prompt).toContain("VEL-7");
  expect(prompt).toContain("Project: Launch");
  expect(prompt).toContain("```html");
  expect(prompt).not.toMatch(/localhost|127\.0\.0\.1|:3100/);
  expect(prompt.length).toBeLessThanOrEqual(20_000);
});

test("detects an unapplied migration from the PostgREST response", () => {
  expect(paperclipSchemaMissing(404)).toBe(true);
  expect(paperclipSchemaMissing(400, { code: "PGRST205", message: "Could not find the table" })).toBe(true);
  expect(paperclipSchemaMissing(401)).toBe(false);
  expect(paperclipSchemaMissing(400, { message: "invalid input syntax" })).toBe(false);
});

function countNodes(nodes: Array<{ reports: Array<unknown> }>): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.reports as Array<{ reports: Array<unknown> }>), 0);
}
