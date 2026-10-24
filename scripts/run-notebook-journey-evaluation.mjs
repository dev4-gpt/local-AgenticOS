#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNotebookJourneyReceipt, collectNotebookJourneyResults, notebookJourneyBrowserChannel } from "./lib/notebook-journey-evidence.mjs";
import { offlineTestEnvironment } from "./lib/offline-test-environment.mjs";
import { workingTreeFingerprintSha256 } from "./lib/working-tree-fingerprint.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "tmp/customer-journey/local-browser-receipt.json");
const startedAt = new Date().toISOString();
const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
if (commit.status !== 0) throw new Error("journey_source_commit_unavailable");
const sourceCommit = commit.stdout.trim();
const candidateFingerprint = workingTreeFingerprintSha256(root);
const testPort = process.env.CLIENT_RUNTIME_TEST_PORT || "3941";
const browserChannel = notebookJourneyBrowserChannel(process.env.PLAYWRIGHT_BROWSER_CHANNEL);
const base = { sourceCommit, candidateFingerprint, startedAt, testPort, browserChannel };
function save(receipt) {
  mkdirSync(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, output);
}

// Invalidate any older pass before building or launching a browser.
save(buildNotebookJourneyReceipt({ ...base, checkedAt: startedAt, scenarios: [] }));
const env = { ...offlineTestEnvironment(process.env, root), CLIENT_RUNTIME_TEST_PORT: testPort };
if (browserChannel !== "bundled-chromium") env.PLAYWRIGHT_BROWSER_CHANNEL = browserChannel;
if (process.env.PLAYWRIGHT_BROWSERS_PATH) env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH;
const run = spawnSync(process.execPath, [join(root, "node_modules/playwright/cli.js"), "test",
  "--config=playwright.notebook-journey.config.ts", "--reporter=json", "--workers=1", "--retries=0"], {
  cwd: root, env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000,
});
let report = null;
try { report = JSON.parse(run.stdout); } catch { /* A runner/build failure cannot yield passing evidence. */ }
if (report) {
  const reportFile = join(dirname(output), "local-browser-playwright-report.json");
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  chmodSync(reportFile, 0o600);
}
const collected = collectNotebookJourneyResults(report);
const runtime = collected.browserVersion ? {
  browserName: "chromium", browserVersion: collected.browserVersion,
  playwrightVersion: JSON.parse(readFileSync(join(root, "node_modules/playwright/package.json"), "utf8")).version,
  nodeVersion: process.version, platform: process.platform, arch: process.arch,
} : null;
let candidateFingerprintAfter = null;
try { candidateFingerprintAfter = workingTreeFingerprintSha256(root); } catch { /* Missing identity fails closed. */ }
const commitAfter = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
const receipt = buildNotebookJourneyReceipt({
  ...base, sourceCommitAfter: commitAfter.status === 0 ? commitAfter.stdout.trim() : null,
  candidateFingerprintAfter, checkedAt: new Date().toISOString(), scenarios: collected.scenarios, runtime,
  runnerStatus: run.status === 0 && collected.passed ? "passed" : "failed",
});
save(receipt);
console.log(`Notebook local journey: ${receipt.scenarios.filter((item) => item.status === "passed").length}/${receipt.expectedScenarios.length} scenarios passed; receipt ${receipt.result}; hosted acceptance unverified.`);
console.log(`Report: ${output}`);
if (receipt.result !== "passed") {
  // Keep unbounded build/runner diagnostics out of the evidence receipt.
  console.error((run.stderr || "").slice(-4000));
  for (const item of receipt.scenarios) if (item.status !== "passed") console.error(`${item.id}: ${item.status}`);
  process.exitCode = 1;
}
