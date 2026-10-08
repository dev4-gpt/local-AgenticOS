import { expect, test } from "@playwright/test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureBuyerPilotEvidence, validBuyerPilotEvidence } from "../scripts/lib/buyer-pilot-evidence.mjs";

test("release buyer receipt is replayed and bound to the audited run inputs", () => {
  const root = mkdtempSync(join(tmpdir(), "buyer-ledger-evidence-"));
  try {
    const simulationDir = join(root, "sim_abcd1234");
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "evaluations"));
    mkdirSync(join(simulationDir, "twitter"), { recursive: true });
    const checks = Object.fromEntries([
      "runIdentity", "personaCoverage", "profileWorkflowCoverage", "profileAgentMapping",
      "postAgentMapping", "initialPostAttribution", "actionTelemetry",
      "completionTelemetry", "buyerActivity", "buyerContentReview",
    ].map((name) => [name, true]));
    const audit = {
      simulationId: "sim_abcd1234", pilotEvidencePassed: true,
      technicalEvidencePassed: true, marketValidation: false, runnerStatus: "completed",
      expectedPersonas: 2, generatedProfiles: 2, configuredAgents: 2,
      dynamicPosts: 1, reviewedDynamicPosts: 1, configuredRounds: 1, reportedRound: 1,
      actionLogRows: 2, tracedPosts: 2, completionEvents: 1, checks,
      futureUnsafeField: "must not enter the ledger",
    };
    const script = join(root, "scripts/audit-mirofish-buyer-run.py");
    writeFileSync(script, `print(${JSON.stringify(JSON.stringify(audit))})\n`);
    writeFileSync(join(root, "evaluations/mirofish-buyer-micro-v1.json"), "{}\n");
    for (const name of [
      "simulation_config.json", "run_state.json", "twitter_profiles.csv",
      "twitter_simulation.db", "buyer_review.json", "twitter/actions.jsonl",
    ]) writeFileSync(join(simulationDir, name), `fixture:${name}\n`);
    const commit = "a".repeat(40);
    const receipt = captureBuyerPilotEvidence({ root, simulationDir, sourceCommit: commit });
    expect(receipt).not.toBeNull();
    expect(receipt?.audit).not.toHaveProperty("futureUnsafeField");
    expect(validBuyerPilotEvidence(receipt, commit, root)).toBe(true);
    expect(validBuyerPilotEvidence({ ...receipt, sourceCommit: "b".repeat(40) }, commit, root)).toBe(false);
    expect(validBuyerPilotEvidence({ ...receipt, audit: { ...audit, checks: { ...checks, buyerContentReview: false } } }, commit, root)).toBe(false);
    writeFileSync(script, "raise SystemExit(1)\n");
    expect(validBuyerPilotEvidence(receipt, commit, root)).toBe(false);
    expect(captureBuyerPilotEvidence({ root, simulationDir, sourceCommit: commit })).toBeNull();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
