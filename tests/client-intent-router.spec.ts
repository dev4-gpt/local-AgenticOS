import { expect, test } from "@playwright/test";
import { buildIntentClassifierPrompt, intentEvidence, parseClientIntentClassification, resolveClientIntent } from "../src/lib/clientIntentRouter";
import { CLIENT_INTENT_SURFACES, clientReadyPlaybooks, NATIVE_CLIENT_PLAYBOOKS } from "../src/lib/clientPlaybooks";
import { missingRequiredTraits, resolveCapabilityTraits } from "../src/lib/capabilityTraits";
import { readFileSync } from "node:fs";

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

test("a playbook may not claim a guarantee the capability does not resolve", () => {
  // requiredTraits used to be recorded in the plan and compared against nothing,
  // so a playbook could declare citations or deletion-lineage and be dispatched
  // into a capability whose bundle never provided them.
  const providerBundle = resolveCapabilityTraits({ capability: "text-agents", provider: "anthropic", surface: "chat" });
  const research = NATIVE_CLIENT_PLAYBOOKS.find((item) => item.id === "research-citation")!;

  // research-citation demands source-policy/citations/confidence, which a plain
  // text-agents bundle does not carry.
  const unmet = missingRequiredTraits(providerBundle, research.requiredTraits);
  expect(unmet.length).toBeGreaterThan(0);
  expect(unmet).toContain("citations");

  // Its own capability resolves them, so it is runnable there.
  const researchBundle = resolveCapabilityTraits({ capability: "research", provider: "anthropic", surface: "chat" });
  expect(missingRequiredTraits(researchBundle, research.requiredTraits)).toEqual([]);
});

test("the worker fails closed on unmet traits rather than dispatching", () => {
  const worker = readFileSync("src/app/api/internal/client-runtime/jobs/route.ts", "utf8");
  expect(worker).toContain("missingRequiredTraits(selectedTraits, selected.requiredTraits)");
  // Must be checked before the risk-class branch, so an unmet playbook is not
  // offered as "ready" either.
  expect(worker.indexOf("unmetTraits.length > 0")).toBeLessThan(worker.indexOf('selected.riskClass !== "low"'));
});

test("loop is a real intake surface with playbooks behind it", () => {
  // loop is a permitted skill surface and loop-run is a known capability, but
  // ClientIntentSurface omitted it, so no request could reach the Loop lane.
  expect(CLIENT_INTENT_SURFACES).toContain("loop");
  const loopReady = clientReadyPlaybooks(["orchestration", "quality", "text-agents"], "loop");
  expect(loopReady.length).toBeGreaterThan(0);
  expect(loopReady.map((item) => item.id)).toContain("workflow-planning");
});

test("the intent route derives its surface guard from the single exported list", () => {
  // The guard was a hand-written Set duplicating the union: two places to
  // update, one to forget.
  const route = readFileSync("src/app/api/client-runtime/intent/route.ts", "utf8");
  expect(route).toContain("new Set<ClientIntentSurface>(CLIENT_INTENT_SURFACES)");
});
