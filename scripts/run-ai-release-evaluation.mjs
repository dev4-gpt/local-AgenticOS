#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { offlineTestEnvironment } from "./lib/offline-test-environment.mjs";
import { WORKING_TREE_FINGERPRINT_SCHEMA, workingTreeFingerprintSha256 } from "./lib/working-tree-fingerprint.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(root, "evaluations/ai-release-local-v1.json");
const outputFlag = process.argv.indexOf("--out");
if (outputFlag >= 0 && (!process.argv[outputFlag + 1] || process.argv[outputFlag + 1].startsWith("--"))) throw new Error("--out requires a file path");
const outputPath = resolve(root, outputFlag >= 0 ? process.argv[outputFlag + 1] : "tmp/ai-release-local-v1-report.json");
const startedAt = new Date().toISOString();
function saveReport(report) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, outputPath);
}

// Invalidate an old pass even if fixture/configuration validation stops this run.
saveReport({ schemaVersion: 2, suite: "ai-release-local-v1", startedAt, checkedAt: startedAt,
  runnerStatus: "incomplete", localGatePassed: false, productionReady: false });
const before = captureIdentity();
const unitConfigSha256 = createHash("sha256").update(readFileSync(join(root, "playwright.unit.config.ts"))).digest("hex");
const playwrightVersion = readPlaywrightVersion();
const runnerConfiguration = { workers: 1, retries: 0, reporter: "json", timeoutMs: 600000, environment: "allowlisted-offline-v1" };
const fixtureBytes = readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBytes.toString("utf8"));
if (fixture.schemaVersion !== 1 || fixture.suite !== "ai-release-local-v1" || !Array.isArray(fixture.cases) || !fixture.cases.length) throw new Error("AI evaluation fixture is invalid");
const ids = new Set();
const targets = new Set();
for (const item of fixture.cases) {
  if (!item || typeof item.id !== "string" || typeof item.behavior !== "string" || typeof item.failureLabel !== "string" || typeof item.evidenceScope !== "string"
    || !/^[a-z0-9-]+$/.test(item.id) || !/^[a-z0-9_]+$/.test(item.failureLabel)
    || !/^[a-z0-9-]+\.spec\.ts$/.test(item.spec) || typeof item.title !== "string" || !item.title.trim()) throw new Error("AI evaluation case is invalid");
  const target = `${item.spec}:${item.title}`;
  if (ids.has(item.id) || targets.has(target)) throw new Error("AI evaluation fixture has duplicate cases");
  ids.add(item.id);
  targets.add(target);
}

const uniqueSpecs = [...new Set(fixture.cases.map((item) => `tests/${item.spec}`))];
// This suite is offline. Do not pass production credentials (including new
// provider or billing keys) into a child test process by default.
const env = offlineTestEnvironment(process.env, root);
const run = spawnSync(process.execPath, [join(root, "node_modules/playwright/cli.js"), "test", ...uniqueSpecs, "--config=playwright.unit.config.ts", "--reporter=json", "--workers=1", "--retries=0"], {
  cwd: root, env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: runnerConfiguration.timeoutMs,
});
let playwright = null;
try { playwright = JSON.parse(run.stdout); } catch { /* A failed runner is an evaluation failure, never a passing receipt. */ }
const results = new Map();
function collect(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      const key = `${spec.file}:${spec.title}`;
      const attempts = (spec.tests ?? []).flatMap((entry) => entry.results ?? []);
      const passed = spec.tests?.length === 1 && spec.tests[0].expectedStatus === "passed" && spec.tests[0].status === "expected"
        && attempts.length === 1 && attempts[0].status === "passed" && attempts[0].retry === 0;
      const row = { passed: Boolean(passed), testDurationMs: attempts.length === 1 && Number.isSafeInteger(attempts[0].duration) ? attempts[0].duration : null };
      results.set(key, results.has(key) ? { passed: false, testDurationMs: null } : row);
    }
    collect(suite.suites);
  }
}
collect(playwright?.suites);
const cases = fixture.cases.map((item) => {
  const result = results.get(`${item.spec}:${item.title}`);
  return { id: item.id, behavior: item.behavior, failureLabel: item.failureLabel, evidenceScope: item.evidenceScope,
    spec: item.spec, title: item.title, status: result?.passed ? "passed" : "failed", testDurationMs: result?.testDurationMs ?? null };
});
const after = captureIdentity();
const playwrightVersionAfter = readPlaywrightVersion();
const nodeEngineSupported = /^v(?:22|23|24|25)\./.test(process.version);
const candidateIdentityAvailable = /^[0-9a-f]{40}$/i.test(before.sourceCommit ?? "") && /^[0-9a-f]{64}$/.test(before.candidateFingerprint ?? "");
const stableCandidate = before.sourceCommit === after.sourceCommit && before.candidateFingerprint === after.candidateFingerprint;
const failures = [];
if (!nodeEngineSupported) failures.push("node_runtime_unsupported");
if (!candidateIdentityAvailable) failures.push("candidate_identity_unavailable");
if (!stableCandidate) failures.push("candidate_changed_during_run");
if (!/^\d+\.\d+\.\d+$/.test(playwrightVersion ?? "") || playwrightVersion !== playwrightVersionAfter) failures.push("playwright_runtime_changed_or_invalid");
if (run.status !== 0) failures.push("runner_failed");
if (!Array.isArray(playwright?.errors) || playwright.errors.length !== 0) failures.push("runner_errors_or_report_invalid");
if (playwright?.stats?.unexpected !== 0 || playwright?.stats?.skipped !== 0 || playwright?.stats?.flaky !== 0) failures.push("runner_statistics_incomplete");
if (!cases.every((item) => item.status === "passed")) failures.push("case_failures");
const allPassed = failures.length === 0;
const report = {
  schemaVersion: 2, suite: fixture.suite, mode: fixture.mode, startedAt, checkedAt: new Date().toISOString(),
  runnerStatus: allPassed ? "passed" : "failed", failures,
  fixtureSha256: createHash("sha256").update(fixtureBytes).digest("hex"),
  unitConfigSha256, runnerConfiguration, playwrightVersion, playwrightVersionAfter,
  sourceCommit: before.sourceCommit, sourceCommitAfter: after.sourceCommit,
  candidateFingerprintSchema: WORKING_TREE_FINGERPRINT_SCHEMA,
  candidateFingerprintSha256: before.candidateFingerprint, candidateFingerprintAfterSha256: after.candidateFingerprint,
  workingTreeClean: before.workingTreeClean, workingTreeCleanAfter: after.workingTreeClean,
  nodeVersion: process.version, nodeEngineSupported, runnerExitCode: run.status,
  metrics: { cases: cases.length, passed: cases.filter((item) => item.status === "passed").length, failed: cases.filter((item) => item.status !== "passed").length,
    deterministicPassRate: cases.filter((item) => item.status === "passed").length / cases.length,
    modelSamples: 0, modelLatencyMs: null, modelTokens: null, providerCostMicros: null },
  localGatePassed: allPassed,
  productionReady: false,
  limitations: ["Selected local tests do not establish hosted behavior, model quality, stochastic reliability, or a complete customer journey.", "The lifecycle settlement case uses a local harness; hosted ledger reconciliation requires separate staging evidence.", "No LLM or Zep request is part of this evaluation."],
  cases,
};
saveReport(report);
console.log(`AI local evaluation: ${report.metrics.passed}/${report.metrics.cases} cases passed; local gate ${allPassed ? "passed" : "failed"}; production ready false.`);
console.log(`Report: ${outputPath}`);
if (!allPassed) {
  console.error(`Evaluation failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}

function captureIdentity() {
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  let candidateFingerprint = null;
  try { candidateFingerprint = workingTreeFingerprintSha256(root); } catch { /* Unavailable identity cannot pass. */ }
  return { sourceCommit: commit.status === 0 ? commit.stdout.trim() : null, candidateFingerprint,
    workingTreeClean: dirty.status === 0 && dirty.stdout.trim() === "" };
}

function readPlaywrightVersion() {
  try { return JSON.parse(readFileSync(join(root, "node_modules/playwright/package.json"), "utf8")).version ?? null; }
  catch { return null; }
}
