import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REQUIRED_ARTIFACTS = [
  "simulation_config.json", "run_state.json", "twitter_profiles.csv",
  "twitter_simulation.db", "buyer_review.json",
];
const REQUIRED_CHECKS = [
  "runIdentity", "personaCoverage", "profileWorkflowCoverage", "profileAgentMapping",
  "postAgentMapping", "initialPostAttribution", "actionTelemetry",
  "completionTelemetry", "buyerActivity", "buyerContentReview",
];
const MAX_ARTIFACT_BYTES = 50_000_000;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function artifactHashes(directory) {
  const names = [...REQUIRED_ARTIFACTS];
  for (const name of ["twitter/actions.jsonl", "actions.jsonl", "simulation.log"]) {
    if (existsSync(join(directory, name))) names.push(name);
  }
  if (!names.some((name) => name.endsWith("actions.jsonl"))) return null;
  const hashes = {};
  for (const name of names) {
    const file = join(directory, name);
    const size = statSync(file).size;
    if (size > MAX_ARTIFACT_BYTES) return null;
    hashes[name] = sha256(readFileSync(file));
  }
  return hashes;
}

export function validBuyerPilotEvidence(receipt, expectedCommit, root) {
  if (!receipt || receipt.schemaVersion !== 1 || receipt.sourceCommit !== expectedCommit
    || !/^[0-9a-f]{40}$/.test(expectedCommit ?? "")
    || !Number.isFinite(Date.parse(receipt.capturedAt))
    || !/^sim_[0-9a-z]{4,}$/.test(receipt.simulationId ?? "")) return false;
  const auditor = readFileSync(resolve(root, "scripts/audit-mirofish-buyer-run.py"));
  const cohort = readFileSync(resolve(root, "evaluations/mirofish-buyer-micro-v1.json"));
  if (receipt.auditorSha256 !== sha256(auditor) || receipt.cohortSha256 !== sha256(cohort)) return false;
  const hashes = receipt.artifactSha256;
  if (!hashes || typeof hashes !== "object" || Array.isArray(hashes)
    || REQUIRED_ARTIFACTS.some((name) => !/^[0-9a-f]{64}$/.test(hashes[name] ?? ""))
    || !["twitter/actions.jsonl", "actions.jsonl"].some((name) => /^[0-9a-f]{64}$/.test(hashes[name] ?? ""))
    || Object.values(hashes).some((hash) => !/^[0-9a-f]{64}$/.test(hash))) return false;
  const audit = receipt.audit;
  return audit?.simulationId === receipt.simulationId
    && audit.pilotEvidencePassed === true && audit.technicalEvidencePassed === true
    && audit.marketValidation === false && audit.runnerStatus === "completed"
    && Number.isSafeInteger(audit.expectedPersonas) && audit.expectedPersonas >= 2
    && audit.generatedProfiles === audit.expectedPersonas
    && audit.configuredAgents === audit.expectedPersonas
    && Number.isSafeInteger(audit.dynamicPosts) && audit.dynamicPosts > 0
    && audit.reviewedDynamicPosts === audit.dynamicPosts
    && Number.isSafeInteger(audit.configuredRounds) && audit.configuredRounds > 0
    && audit.reportedRound === audit.configuredRounds
    && Number.isSafeInteger(audit.actionLogRows) && audit.actionLogRows > 0
    && audit.tracedPosts === audit.actionLogRows && audit.completionEvents === 1
    && audit.checks && Object.values(audit.checks).every((value) => value === true)
    && REQUIRED_CHECKS.every((name) => audit.checks?.[name] === true);
}

export function captureBuyerPilotEvidence({ root, simulationDir, sourceCommit }) {
  try {
    const directory = resolve(simulationDir);
    const before = artifactHashes(directory);
    if (!before) return null;
    const script = resolve(root, "scripts/audit-mirofish-buyer-run.py");
    const cohort = resolve(root, "evaluations/mirofish-buyer-micro-v1.json");
    const env = { PATH: process.env.PATH || "/usr/bin:/bin", PYTHONIOENCODING: "utf-8" };
    const run = spawnSync("python3", [script, "--simulation-dir", directory, "--cohort", cohort], {
      cwd: root, encoding: "utf8", timeout: 30_000, maxBuffer: 1_000_000, env,
    });
    if (run.status !== 0) return null;
    const raw = JSON.parse(run.stdout);
    const audit = {
      simulationId: raw.simulationId, expectedPersonas: raw.expectedPersonas,
      generatedProfiles: raw.generatedProfiles, configuredAgents: raw.configuredAgents,
      dynamicPosts: raw.dynamicPosts, reviewedDynamicPosts: raw.reviewedDynamicPosts,
      actionLogRows: raw.actionLogRows, tracedPosts: raw.tracedPosts,
      completionEvents: raw.completionEvents, configuredRounds: raw.configuredRounds,
      reportedRound: raw.reportedRound, runnerStatus: raw.runnerStatus,
      technicalEvidencePassed: raw.technicalEvidencePassed,
      pilotEvidencePassed: raw.pilotEvidencePassed, marketValidation: raw.marketValidation,
      checks: Object.fromEntries(REQUIRED_CHECKS.map((name) => [name, raw.checks?.[name]])),
    };
    const after = artifactHashes(directory);
    if (JSON.stringify(before) !== JSON.stringify(after)) return null;
    const receipt = {
      schemaVersion: 1, sourceCommit, capturedAt: new Date().toISOString(),
      simulationId: audit.simulationId,
      auditorSha256: sha256(readFileSync(script)), cohortSha256: sha256(readFileSync(cohort)),
      artifactSha256: after, audit,
    };
    return validBuyerPilotEvidence(receipt, sourceCommit, root) ? receipt : null;
  } catch {
    return null;
  }
}
