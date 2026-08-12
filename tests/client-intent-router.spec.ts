import { expect, test } from "@playwright/test";
import { buildIntentClassifierPrompt, intentEvidence, parseClientIntentClassification, resolveClientIntent } from "../src/lib/clientIntentRouter";
import { clientReadyPlaybooks, NATIVE_CLIENT_PLAYBOOKS } from "../src/lib/clientPlaybooks";

const ready = clientReadyPlaybooks(["text-agents", "research", "knowledge", "orchestration", "quality"]);

test("deterministic intent resolution selects a single approved playbook", () => {
  const result = resolveClientIntent({ request: "Please research competitor pricing and cite the sources", surface: "chat", enabledCapabilities: ["research"], availablePlaybooks: ready });
  expect(result.deterministic).toBe(true);
  expect(result.candidates[0]?.playbook.id).toBe("research-citation");
  expect(result.clarificationQuestion).toBeNull();
});

test("ambiguous requests produce one focused clarification", () => {
  const result = resolveClientIntent({ request: "Help me with this", surface: "chat", enabledCapabilities: ["text-agents", "research", "quality"], availablePlaybooks: ready });
  expect(result.deterministic).toBe(false);
  expect(result.clarificationQuestion).toContain("research");
});

test("classifier output is strict, registry-bound, and confidence-gated", () => {
  const prompt = buildIntentClassifierPrompt("make a plan", "chat", [{ playbook: NATIVE_CLIENT_PLAYBOOKS.find((item) => item.id === "workflow-planning")!, score: 2, matchedIntents: ["plan"] }]);
  expect(prompt).toContain("playbookId");
  expect(parseClientIntentClassification('{"playbookId":"workflow-planning","confidence":0.91,"reason":"planning request"}', ready).ok).toBe(true);
  expect(parseClientIntentClassification('{"playbookId":"gated-security","confidence":0.99,"reason":"unsafe"}', ready).ok).toBe(false);
  expect(parseClientIntentClassification('{"playbookId":"workflow-planning","confidence":0.4,"reason":"uncertain"}', ready).ok).toBe(false);
});

test("intent evidence is redacted to a hash and bounded metadata", () => {
  const evidence = intentEvidence({ request: "private internal request", surface: "chat", candidateCount: 2, classifierUsed: true, confidence: 0.84 });
  expect(evidence.requestHash).toHaveLength(64);
  expect(JSON.stringify(evidence)).not.toContain("private internal request");
  expect(evidence.requestChars).toBe(24);
});

test("ready playbooks exclude gated capabilities by construction", () => {
  expect(ready.every((playbook) => !playbook.eligibleCapabilities.includes("security-assessment"))).toBe(true);
});
