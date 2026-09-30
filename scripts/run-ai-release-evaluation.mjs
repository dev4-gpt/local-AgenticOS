#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(root, "evaluations/ai-release-local-v1.json");
const outputFlag = process.argv.indexOf("--out");
if (outputFlag >= 0 && (!process.argv[outputFlag + 1] || process.argv[outputFlag + 1].startsWith("--"))) throw new Error("--out requires a file path");
const outputPath = resolve(root, outputFlag >= 0 ? process.argv[outputFlag + 1] : "tmp/ai-release-local-v1-report.json");
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
const env = { ...process.env };
for (const name of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "ZEP_API_KEY", "LLM_API_KEY", "BRAVE_API_KEY", "FIRECRAWL_API_KEY"]) delete env[name];
const run = spawnSync(process.execPath, [join(root, "node_modules/playwright/cli.js"), "test", ...uniqueSpecs, "--config=playwright.unit.config.ts", "--reporter=json", "--workers=1"], {
  cwd: root, env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
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
const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
const nodeEngineSupported = /^v(?:22|23|24|25)\./.test(process.version);
const allPassed = nodeEngineSupported && run.status === 0 && playwright?.stats?.unexpected === 0 && playwright?.stats?.skipped === 0 && playwright?.stats?.flaky === 0 && cases.every((item) => item.status === "passed");
const report = {
  schemaVersion: 1, suite: fixture.suite, mode: fixture.mode, checkedAt: new Date().toISOString(),
  fixtureSha256: createHash("sha256").update(fixtureBytes).digest("hex"),
  sourceCommit: commit.status === 0 ? commit.stdout.trim() : null,
  workingTreeClean: dirty.status === 0 && dirty.stdout.trim() === "",
  nodeVersion: process.version, nodeEngineSupported, runnerExitCode: run.status,
  metrics: { cases: cases.length, passed: cases.filter((item) => item.status === "passed").length, failed: cases.filter((item) => item.status !== "passed").length,
    deterministicPassRate: cases.filter((item) => item.status === "passed").length / cases.length,
    modelSamples: 0, modelLatencyMs: null, modelTokens: null, providerCostMicros: null },
  localGatePassed: allPassed,
  productionReady: false,
  limitations: ["Selected local tests do not establish hosted behavior, model quality, stochastic reliability, or a complete customer journey.", "The lifecycle settlement case uses a local harness; hosted ledger reconciliation requires separate staging evidence.", "No LLM or Zep request is part of this evaluation."],
  cases,
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(`AI local evaluation: ${report.metrics.passed}/${report.metrics.cases} cases passed; local gate ${allPassed ? "passed" : "failed"}; production ready false.`);
console.log(`Report: ${outputPath}`);
if (!allPassed) process.exitCode = 1;
