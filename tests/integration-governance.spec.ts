import { expect, test } from "@playwright/test";
import { governedIntegrations, governedIntegrationsMentioned, governedPipelineGuardrails } from "../src/lib/integrationGovernance";
import { pipelineShapePrompt } from "../src/lib/clientPipelineAdapter";

test("the governed registry exposes native traits and keeps external candidates disabled", () => {
  const entries = governedIntegrations();
  expect(entries.map((entry) => entry.id)).toEqual(["ponytail", "headroom", "openreply", "voxcpm", "scout"]);
  expect(entries.find((entry) => entry.id === "ponytail")?.state).toBe("native-enabled");
  expect(entries.find((entry) => entry.id === "headroom")?.state).toBe("native-enabled");
  for (const id of ["openreply", "voxcpm", "scout"]) expect(entries.find((entry) => entry.id === id)?.state).toBe("disabled");
  for (const entry of entries) expect(entry.placements).toEqual(expect.arrayContaining(["pipeline", "infrastructure", "stack", "backend"]));
});

test("pipeline planning adds constraints for named governed integrations without enabling them", () => {
  expect(governedIntegrationsMentioned("Plan Scout and OpenReply").map((entry) => entry.id)).toEqual(["openreply", "scout"]);
  const guardrails = governedPipelineGuardrails("Connect OpenReply to an Instagram pilot");
  expect(guardrails).toContain("OpenReply Instagram pilot is disabled");
  expect(guardrails).toContain("do not activate");
  const prompt = pipelineShapePrompt({ title: "OpenReply campaign", idea: "Plan a human-reviewed OpenReply Instagram pilot" });
  expect(prompt).toContain("Governed integration constraints");
  expect(prompt).toContain("OpenReply Instagram pilot is disabled");
  expect(prompt).toContain("do not activate");
});
