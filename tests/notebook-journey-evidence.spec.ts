import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildNotebookJourneyReceipt, collectNotebookJourneyResults, notebookJourneyBrowserChannel, NOTEBOOK_JOURNEY_SCENARIOS, validNotebookJourneyReceipt } from "../scripts/lib/notebook-journey-evidence.mjs";

const candidate = {
  sourceCommit: "a".repeat(40), candidateFingerprint: "b".repeat(64),
  sourceCommitAfter: "a".repeat(40), candidateFingerprintAfter: "b".repeat(64), runnerStatus: "passed",
  startedAt: "2026-10-16T00:00:00.000Z", checkedAt: "2026-10-16T00:01:00.000Z",
  runtime: { browserName: "chromium", browserVersion: "150.0.0.1", playwrightVersion: "1.62.1", nodeVersion: "v24.18.0", platform: "darwin", arch: "arm64" },
};

test("journey receipt passes only when every expected scenario passed", () => {
  const scenarios = NOTEBOOK_JOURNEY_SCENARIOS.map((id) => ({ id, status: "passed", durationMs: 10 }));
  const receipt = buildNotebookJourneyReceipt({ ...candidate, scenarios });
  expect(receipt.result).toBe("passed");
  expect(receipt.startedAt).toBe(candidate.startedAt);
  expect(receipt.checkedAt).toBe(candidate.checkedAt);
  expect(receipt.candidateFingerprintSha256).toBe(candidate.candidateFingerprint);
  expect(receipt.testConfigFingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(receipt.testConfig.providerCalls).toBe("fixture-only-no-external-provider-request");
  expect(receipt.testConfig.browserChannel).toBe("bundled-chromium");
  expect(receipt.runtime).toEqual(candidate.runtime);
});

test("journey receipts bind browser configuration and reject missing or altered runtime evidence", () => {
  const scenarios = NOTEBOOK_JOURNEY_SCENARIOS.map((id) => ({ id, status: "passed", durationMs: 10 }));
  const receipt = buildNotebookJourneyReceipt({ ...candidate, browserChannel: "chrome", scenarios });
  expect(validNotebookJourneyReceipt(receipt, candidate.sourceCommit, candidate.candidateFingerprint)).toBe(true);
  for (const altered of [
    { ...receipt, schemaVersion: 1 },
    { ...receipt, runtime: null },
    { ...receipt, runtime: { ...receipt.runtime, browserVersion: "151.0.0.1" } },
    { ...receipt, testConfig: { ...receipt.testConfig, browserChannel: "msedge" } },
    { ...receipt, sourceCommitAfter: "f".repeat(40) },
    { ...receipt, candidateFingerprintAfterSha256: "f".repeat(64) },
    { ...receipt, runnerStatus: "failed" },
    { ...receipt, checkedAt: "2026-10-15T00:00:00.000Z" },
  ]) expect(validNotebookJourneyReceipt(altered, candidate.sourceCommit, candidate.candidateFingerprint)).toBe(false);
  expect(buildNotebookJourneyReceipt({ ...candidate, runtime: null, scenarios }).result).toBe("incomplete");
  expect(buildNotebookJourneyReceipt({ ...candidate, runtime: { ...candidate.runtime, nodeVersion: "v26.0.0" }, scenarios }).result).toBe("incomplete");
  expect(buildNotebookJourneyReceipt({ ...candidate, candidateFingerprintAfter: "f".repeat(64), scenarios }).result).toBe("failed");
  expect(buildNotebookJourneyReceipt({ ...candidate, sourceCommitAfter: "f".repeat(40), scenarios }).result).toBe("failed");
  expect(buildNotebookJourneyReceipt({ ...candidate, runnerStatus: "failed", scenarios }).result).toBe("failed");
  expect(notebookJourneyBrowserChannel(undefined)).toBe("bundled-chromium");
  expect(() => notebookJourneyBrowserChannel("firefox")).toThrow("journey_browser_channel_invalid");
  expect(() => buildNotebookJourneyReceipt({ ...candidate, testPort: "80", scenarios })).toThrow("journey_test_port_invalid");
});

function runReport() {
  return {
    errors: [], stats: { expected: NOTEBOOK_JOURNEY_SCENARIOS.length, unexpected: 0, skipped: 0, flaky: 0 },
    suites: [{ specs: NOTEBOOK_JOURNEY_SCENARIOS.map((id) => ({
      title: `browser plus real handlers: ${id}`, file: "client-notebook-handler-browser.spec.ts",
      tests: [{ expectedStatus: "passed", status: "expected", results: [{ status: "passed", retry: 0, duration: 10,
        annotations: [{ type: "notebook-browser-version", description: "150.0.0.1" }] }] }],
    })) }],
  };
}

test("run-level collection aggregates every worker and fails for partial or ambiguous runs", () => {
  const complete = runReport();
  expect(collectNotebookJourneyResults(complete)).toMatchObject({ passed: true, browserVersion: "150.0.0.1" });
  expect(collectNotebookJourneyResults(null).passed).toBe(false);
  const missing = runReport();
  missing.suites[0].specs.pop();
  expect(collectNotebookJourneyResults(missing).scenarios.at(-1)?.status).toBe("notRun");
  const duplicate = runReport();
  duplicate.suites.push({ specs: [duplicate.suites[0].specs[0]] });
  expect(collectNotebookJourneyResults(duplicate).passed).toBe(false);
  const failed = runReport();
  failed.suites[0].specs[0].tests[0].results[0].status = "failed";
  expect(collectNotebookJourneyResults(failed).scenarios.filter((item: { status: string }) => item.status === "passed")).toHaveLength(NOTEBOOK_JOURNEY_SCENARIOS.length - 1);
  const retried = runReport();
  retried.suites[0].specs[0].tests[0].results.push({ ...retried.suites[0].specs[0].tests[0].results[0], retry: 1 });
  expect(collectNotebookJourneyResults(retried).passed).toBe(false);
  const mixed = runReport();
  mixed.suites[0].specs[0].tests[0].results[0].annotations[0].description = "151.0.0.1";
  expect(collectNotebookJourneyResults(mixed)).toMatchObject({ passed: false, browserVersion: null });
  const wrongTest = runReport();
  wrongTest.suites[0].specs[0].file = "another-test.spec.ts";
  expect(collectNotebookJourneyResults(wrongTest).passed).toBe(false);
  const noRuntime = runReport();
  noRuntime.suites[0].specs[0].tests[0].results[0].annotations = [];
  expect(collectNotebookJourneyResults(noRuntime).passed).toBe(false);
  const runnerFailure = runReport();
  runnerFailure.stats.unexpected = 1;
  expect(collectNotebookJourneyResults(runnerFailure).passed).toBe(false);
});

test("evaluation CLI replaces an old pass on runner failure and rejects candidate drift", () => {
  const root = mkdtempSync(join(tmpdir(), "agentos-notebook-evaluation-"));
  try {
    mkdirSync(join(root, "scripts/lib"), { recursive: true });
    mkdirSync(join(root, "node_modules/playwright"), { recursive: true });
    for (const file of ["run-notebook-journey-evaluation.mjs", "lib/notebook-journey-evidence.mjs", "lib/offline-test-environment.mjs", "lib/working-tree-fingerprint.mjs"]) {
      copyFileSync(join(process.cwd(), "scripts", file), join(root, "scripts", file));
    }
    writeFileSync(join(root, ".gitignore"), "node_modules/\ntmp/\n");
    writeFileSync(join(root, "sentinel.txt"), "baseline\n");
    const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: root, LANG: "C.UTF-8", CI: "1",
      PLAYWRIGHT_BROWSER_CHANNEL: "chrome", CLIENT_RUNTIME_TEST_PORT: "3942", SECRET_NOT_ALLOWED: "must-not-reach-test-child", CLIENT_PROVIDER_CALLS_ENABLED: "1" };
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    };
    git(["init", "--quiet"]);
    git(["add", "."]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Fixture baseline"]);
    writeFileSync(join(root, "node_modules/playwright/package.json"), JSON.stringify({ version: "1.62.1" }));
    writeFileSync(join(root, "node_modules/playwright/cli.js"), `
      const fs = require('node:fs');
      const receipt = JSON.parse(fs.readFileSync('tmp/customer-journey/local-browser-receipt.json', 'utf8'));
      if (receipt.result !== 'incomplete' || process.env.SECRET_NOT_ALLOWED || process.env.CLIENT_PROVIDER_CALLS_ENABLED
        || process.env.PLAYWRIGHT_BROWSER_CHANNEL !== 'chrome' || process.env.CLIENT_RUNTIME_TEST_PORT !== '3942') process.exit(3);
      const fixture = JSON.parse(fs.readFileSync('node_modules/playwright/fixture.json', 'utf8'));
      if (fixture.mutate) fs.writeFileSync('sentinel.txt', 'changed during run');
      process.stdout.write(fixture.malformed ? 'not JSON' : JSON.stringify(fixture.report));
      process.exitCode = fixture.exitCode;
    `);
    const output = join(root, "tmp/customer-journey/local-browser-receipt.json");
    const run = (fixture: object) => {
      writeFileSync(join(root, "node_modules/playwright/fixture.json"), JSON.stringify(fixture));
      const result = spawnSync(process.execPath, ["scripts/run-notebook-journey-evaluation.mjs"], { cwd: root, env, encoding: "utf8" });
      return { result, receipt: JSON.parse(readFileSync(output, "utf8")) };
    };
    const pass = run({ report: runReport(), exitCode: 0 });
    expect(pass.result.status, pass.result.stderr).toBe(0);
    expect(validNotebookJourneyReceipt(pass.receipt, pass.receipt.sourceCommit, pass.receipt.candidateFingerprintSha256)).toBe(true);
    expect(pass.receipt.testConfig).toMatchObject({ browserChannel: "chrome", testPort: "3942" });
    expect(statSync(output).mode & 0o777).toBe(0o600);
    const failedReport = runReport();
    failedReport.suites[0].specs[0].tests[0].results[0].status = "failed";
    failedReport.stats = { expected: NOTEBOOK_JOURNEY_SCENARIOS.length - 1, unexpected: 1, skipped: 0, flaky: 0 };
    const failed = run({ report: failedReport, exitCode: 1 });
    expect(failed.result.status).toBe(1);
    expect(failed.receipt.result).toBe("failed");
    expect(failed.receipt.scenarios).toHaveLength(NOTEBOOK_JOURNEY_SCENARIOS.length);
    expect(failed.receipt.scenarios[0].status).toBe("failed");
    const malformed = run({ malformed: true, exitCode: 1 });
    expect(malformed.result.status).toBe(1);
    expect(malformed.receipt.result).toBe("failed");
    expect(malformed.receipt.scenarios.every((item: { status: string }) => item.status === "notRun")).toBe(true);
    const changed = run({ report: runReport(), exitCode: 0, mutate: true });
    expect(changed.result.status).toBe(1);
    expect(changed.receipt.result).toBe("failed");
    expect(changed.receipt.candidateFingerprintSha256).not.toBe(changed.receipt.candidateFingerprintAfterSha256);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("journey receipt fails closed for missing, failed, or duplicate scenarios", () => {
  const pass = NOTEBOOK_JOURNEY_SCENARIOS.map((id) => ({ id, status: "passed", durationMs: 10 }));
  expect(buildNotebookJourneyReceipt({ ...candidate, scenarios: pass.slice(0, -1) }).result).toBe("incomplete");
  expect(buildNotebookJourneyReceipt({ ...candidate, scenarios: pass.map((item, index) => index === 1 ? { ...item, status: "failed" } : item) }).result).toBe("failed");
  expect(buildNotebookJourneyReceipt({ ...candidate, scenarios: [...pass.slice(0, -1), pass[0]] }).result).toBe("incomplete");
  expect(() => buildNotebookJourneyReceipt({ ...candidate, candidateFingerprint: "not-a-fingerprint", scenarios: pass })).toThrow("journey_candidate_fingerprint_invalid");
});

test("journey receipt validates its recorded loopback port independent of verifier environment", () => {
  const receipt = buildNotebookJourneyReceipt({
    ...candidate, testPort: "3942",
    scenarios: NOTEBOOK_JOURNEY_SCENARIOS.map((id) => ({ id, status: "passed", durationMs: 10 })),
  });
  expect(validNotebookJourneyReceipt(receipt, candidate.sourceCommit, candidate.candidateFingerprint)).toBe(true);
  expect(validNotebookJourneyReceipt({ ...receipt, testConfig: { ...receipt.testConfig, testPort: "9222" } }, candidate.sourceCommit, candidate.candidateFingerprint)).toBe(false);
  expect(validNotebookJourneyReceipt({ ...receipt, testConfig: { ...receipt.testConfig, testPort: "abc" } }, candidate.sourceCommit, candidate.candidateFingerprint)).toBe(false);
});
