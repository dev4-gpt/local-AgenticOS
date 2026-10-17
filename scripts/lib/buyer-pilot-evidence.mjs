import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REQUIRED_ARTIFACTS = [
  "simulation_config.json", "run_state.json", "twitter_profiles.csv",
  "twitter_simulation.db", "buyer_review.json", "profile-preparation.json",
];
const REQUIRED_CHECKS = [
  "runIdentity", "personaCoverage", "profileWorkflowCoverage", "profileAgentMapping",
  "postAgentMapping", "initialPostAttribution", "dynamicPostNovelty", "dynamicPostPersonaIdentity", "actionTelemetry",
  "completionTelemetry", "buyerActivity", "buyerContentReview",
];
const MAX_ARTIFACT_BYTES = 50_000_000;
const APPROVED_COHORT_FILES = [
  "mirofish-buyer-micro-v1.json",
  "mirofish-buyer-micro-v2.json",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function approvedCohort(root, expectedHash, expectedFile = null) {
  if (expectedFile && !APPROVED_COHORT_FILES.includes(expectedFile)) return null;
  for (const file of APPROVED_COHORT_FILES) {
    if (expectedFile && file !== expectedFile) continue;
    try {
      const path = resolve(root, "evaluations", file);
      const bytes = readFileSync(path);
      if (sha256(bytes) === expectedHash) return { file, path, bytes };
    } catch {
      continue;
    }
  }
  return null;
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
  if (!receipt || receipt.schemaVersion !== 2 || receipt.sourceCommit !== expectedCommit
    || !/^[0-9a-f]{40}$/.test(expectedCommit ?? "")
    || !Number.isFinite(Date.parse(receipt.capturedAt))
    || !/^sim_[0-9a-z]{4,}$/.test(receipt.simulationId ?? "")) return false;
  const auditor = readFileSync(resolve(root, "scripts/audit-mirofish-buyer-run.py"));
  const productBrief = readFileSync(resolve(root, "docs/mirofish-buyer-pilot-seed.md"));
  const cohort = approvedCohort(root, receipt.cohortSha256, receipt.cohortFile ?? null);
  if (!cohort || receipt.auditorSha256 !== sha256(auditor)) return false;
  const hashes = receipt.artifactSha256;
  if (!hashes || typeof hashes !== "object" || Array.isArray(hashes)
    || REQUIRED_ARTIFACTS.some((name) => !/^[0-9a-f]{64}$/.test(hashes[name] ?? ""))
    || !["twitter/actions.jsonl", "actions.jsonl"].some((name) => /^[0-9a-f]{64}$/.test(hashes[name] ?? ""))
    || Object.values(hashes).some((hash) => !/^[0-9a-f]{64}$/.test(hash))) return false;
  const preparation = receipt.profilePreparation;
  if (preparation?.schemaVersion !== 2 || preparation.preparation !== "canonical-buyer-scenarios-v2"
    || !/^[0-9a-f]{64}$/.test(preparation.sourceSha256 ?? "")
    || preparation.reviewedSha256 !== hashes["twitter_profiles.csv"]
    || preparation.cohortSha256 !== sha256(cohort.bytes)
    || preparation.productBriefSha256 !== sha256(productBrief)
    || preparation.providerCalls !== 0) return false;
  const audit = receipt.audit;
  return audit?.simulationId === receipt.simulationId
    && audit.pilotEvidencePassed === true && audit.technicalEvidencePassed === true
    && audit.marketValidation === false && audit.runnerStatus === "completed"
    && Number.isSafeInteger(audit.expectedPersonas) && audit.expectedPersonas >= 2
    && audit.generatedProfiles === audit.expectedPersonas
    && preparation.profileCount === audit.expectedPersonas
    && audit.configuredAgents === audit.expectedPersonas
    && Number.isSafeInteger(audit.dynamicPosts) && audit.dynamicPosts > 0
    && audit.reviewedDynamicPosts === audit.dynamicPosts
    && audit.approvedDynamicPosts === audit.dynamicPosts
    && Number.isSafeInteger(audit.configuredRounds) && audit.configuredRounds > 0
    && audit.reportedRound === audit.configuredRounds
    && Number.isSafeInteger(audit.actionLogRows) && audit.actionLogRows > 0
    && Number.isSafeInteger(audit.tracedPosts) && audit.tracedPosts > 0
    && audit.tracedPosts <= audit.actionLogRows && audit.completionEvents === 1
    && audit.checks && Object.values(audit.checks).every((value) => value === true)
    && REQUIRED_CHECKS.every((name) => audit.checks?.[name] === true);
}

export function validBuyerPilotCostEvidence(receipt, expectedCommit) {
  const evidence = receipt?.providerCostEvidence;
  const authorization = evidence?.authorization;
  const approvalTime = Date.parse(authorization?.approvedAt);
  const runStart = Date.parse(evidence?.runStartedAt);
  const runEnd = Date.parse(evidence?.runCompletedAt);
  const reviewTime = Date.parse(evidence?.reviewedAt);
  if (!evidence || evidence.schemaVersion !== 2 || evidence.status !== "verified"
    || evidence.simulationId !== receipt.simulationId
    || evidence.sourceCommit !== expectedCommit || receipt.sourceCommit !== expectedCommit
    || evidence.currency !== "USD"
    || !Number.isFinite(evidence.approvedMaximumUsd) || evidence.approvedMaximumUsd < 0
    || !Number.isFinite(evidence.actualCostUsd) || evidence.actualCostUsd < 0
    || evidence.actualCostUsd > evidence.approvedMaximumUsd
    || !/^[0-9a-f]{64}$/.test(evidence.billingEvidenceSha256 ?? "")
    || !/^[0-9a-f]{64}$/.test(evidence.receiptSha256 ?? "")
    || !/^[0-9a-f]{64}$/.test(evidence.authorizationEvidenceSha256 ?? "")
    || evidence.costAuthorizationEvidenceSha256 !== evidence.authorizationEvidenceSha256
    || !authorization || authorization.schemaVersion !== 1 || authorization.status !== "approved"
    || authorization.simulationId !== receipt.simulationId || authorization.sourceCommit !== expectedCommit
    || typeof authorization.approvedBy !== "string" || !authorization.approvedBy.trim()
    || typeof authorization.purpose !== "string" || !authorization.purpose.trim()
    || typeof authorization.stopCondition !== "string" || !authorization.stopCondition.trim()
    || !Number.isFinite(authorization.maximumUsd) || authorization.maximumUsd < 0
    || authorization.maximumUsd !== evidence.approvedMaximumUsd
    || !Array.isArray(authorization.providers) || authorization.providers.length === 0
    || authorization.providers.some((provider) => typeof provider !== "string" || !provider.trim())
    || new Set(authorization.providers).size !== authorization.providers.length
    || !Number.isFinite(approvalTime) || !Number.isFinite(runStart) || !Number.isFinite(runEnd)
    || !Number.isFinite(reviewTime) || approvalTime >= runStart || runStart > runEnd || runEnd > reviewTime
    || typeof evidence.reviewedBy !== "string" || !evidence.reviewedBy.trim()
    || !Array.isArray(evidence.providerCosts) || evidence.providerCosts.length === 0) return false;
  const providers = new Set();
  let total = 0;
  for (const row of evidence.providerCosts) {
    if (typeof row?.provider !== "string" || !row.provider.trim() || providers.has(row.provider)
      || !authorization.providers.includes(row.provider)
      || !Number.isFinite(row.costUsd) || row.costUsd < 0) return false;
    providers.add(row.provider);
    total += row.costUsd;
  }
  return Number.isFinite(total) && Math.abs(total - evidence.actualCostUsd) < 0.000001;
}

function providerCostEvidence(simulationId, sourceCommit, authorizationFile, costFile) {
  if (!authorizationFile || !costFile) return { schemaVersion: 2, status: "unverified", simulationId, sourceCommit };
  try {
    const authorizationBytes = readFileSync(resolve(authorizationFile));
    const costBytes = readFileSync(resolve(costFile));
    const authorization = JSON.parse(authorizationBytes.toString("utf8"));
    const evidence = JSON.parse(costBytes.toString("utf8"));
    return {
      schemaVersion: evidence.schemaVersion, status: "verified",
      simulationId: evidence.simulationId, sourceCommit: evidence.sourceCommit,
      currency: evidence.currency, approvedMaximumUsd: evidence.approvedMaximumUsd,
      actualCostUsd: evidence.actualCostUsd, billingEvidenceSha256: evidence.billingEvidenceSha256,
      receiptSha256: sha256(costBytes), authorizationEvidenceSha256: sha256(authorizationBytes),
      costAuthorizationEvidenceSha256: evidence.authorizationEvidenceSha256,
      authorization: {
        schemaVersion: authorization.schemaVersion, status: authorization.status,
        simulationId: authorization.simulationId, sourceCommit: authorization.sourceCommit,
        approvedBy: authorization.approvedBy, approvedAt: authorization.approvedAt,
        purpose: authorization.purpose,
        providers: Array.isArray(authorization.providers) ? [...authorization.providers] : authorization.providers,
        maximumUsd: authorization.maximumUsd, stopCondition: authorization.stopCondition,
      },
      runStartedAt: evidence.runStartedAt, runCompletedAt: evidence.runCompletedAt,
      reviewedAt: evidence.reviewedAt, reviewedBy: evidence.reviewedBy,
      providerCosts: Array.isArray(evidence.providerCosts)
        ? evidence.providerCosts.map(({ provider, costUsd }) => ({ provider, costUsd })) : evidence.providerCosts,
    };
  } catch {
    return { schemaVersion: 2, status: "unverified", simulationId, sourceCommit };
  }
}

export function captureBuyerPilotEvidence({ root, simulationDir, sourceCommit, authorizationEvidenceFile = null, costEvidenceFile = null }) {
  try {
    const directory = resolve(simulationDir);
    const before = artifactHashes(directory);
    if (!before) return null;
    const script = resolve(root, "scripts/audit-mirofish-buyer-run.py");
    const profileBytes = readFileSync(join(directory, "twitter_profiles.csv"));
    const preparation = JSON.parse(readFileSync(join(directory, "profile-preparation.json"), "utf8"));
    const cohort = approvedCohort(root, preparation?.cohortSha256);
    if (!cohort) return null;
    const productBrief = resolve(root, "docs/mirofish-buyer-pilot-seed.md");
    if (preparation?.schemaVersion !== 2 || preparation.preparation !== "canonical-buyer-scenarios-v2"
      || !/^[a-zA-Z0-9._-]+\.csv$/.test(preparation.file ?? "")
      || !/^[0-9a-f]{64}$/.test(preparation.sourceSha256 ?? "")
      || preparation.reviewedSha256 !== sha256(profileBytes)
      || preparation.cohortSha256 !== sha256(cohort.bytes)
      || preparation.productBriefSha256 !== sha256(readFileSync(productBrief))
      || !Number.isSafeInteger(preparation.profileCount) || preparation.profileCount < 2
      || preparation.providerCalls !== 0) return null;
    const env = { PATH: process.env.PATH || "/usr/bin:/bin", PYTHONIOENCODING: "utf-8" };
    const run = spawnSync("python3", [script, "--simulation-dir", directory, "--cohort", cohort.path], {
      cwd: root, encoding: "utf8", timeout: 30_000, maxBuffer: 1_000_000, env,
    });
    if (run.status !== 0) return null;
    const raw = JSON.parse(run.stdout);
    const audit = {
      simulationId: raw.simulationId, expectedPersonas: raw.expectedPersonas,
      generatedProfiles: raw.generatedProfiles, configuredAgents: raw.configuredAgents,
      dynamicPosts: raw.dynamicPosts, reviewedDynamicPosts: raw.reviewedDynamicPosts,
      approvedDynamicPosts: raw.approvedDynamicPosts,
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
      schemaVersion: 2, sourceCommit, capturedAt: new Date().toISOString(),
      simulationId: audit.simulationId,
      providerCostEvidence: providerCostEvidence(audit.simulationId, sourceCommit, authorizationEvidenceFile, costEvidenceFile),
      auditorSha256: sha256(readFileSync(script)), cohortFile: cohort.file,
      cohortSha256: sha256(cohort.bytes),
      profilePreparation: {
        schemaVersion: preparation.schemaVersion, preparation: preparation.preparation,
        sourceSha256: preparation.sourceSha256, reviewedSha256: preparation.reviewedSha256,
        cohortSha256: preparation.cohortSha256, productBriefSha256: preparation.productBriefSha256,
        profileCount: preparation.profileCount, providerCalls: preparation.providerCalls,
      },
      artifactSha256: after, audit,
    };
    return validBuyerPilotEvidence(receipt, sourceCommit, root) ? receipt : null;
  } catch {
    return null;
  }
}
