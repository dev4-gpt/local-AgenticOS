import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

type Receipt = {
  localGatePassed: boolean; runnerStatus: string; sourceCommit: string; sourceCommitAfter: string;
  candidateFingerprintSha256: string; candidateFingerprintAfterSha256: string;
  startedAt: string; checkedAt: string; unitConfigSha256: string;
};

function harness(check: (run: (mode?: string) => { result: ReturnType<typeof spawnSync>; receipt: Receipt }, root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "agentos-ai-evaluation-"));
  try {
    for (const dir of ["scripts/lib", "evaluations", "node_modules/playwright"]) mkdirSync(join(root, dir), { recursive: true });
    for (const file of ["run-ai-release-evaluation.mjs", "lib/offline-test-environment.mjs", "lib/working-tree-fingerprint.mjs"]) {
      copyFileSync(join(process.cwd(), "scripts", file), join(root, "scripts", file));
    }
    writeFileSync(join(root, ".gitignore"), "node_modules/\ntmp/\n");
    writeFileSync(join(root, "sentinel.txt"), "baseline\n");
    writeFileSync(join(root, "playwright.unit.config.ts"), "export default {};\n");
    writeFileSync(join(root, "evaluations/ai-release-local-v1.json"), JSON.stringify({
      schemaVersion: 1, suite: "ai-release-local-v1", mode: "deterministic-offline",
      cases: [{ id: "fixture-case", behavior: "fixture behavior", failureLabel: "fixture_failure",
        evidenceScope: "local-fixture", spec: "fixture.spec.ts", title: "fixture case" }],
    }));
    writeFileSync(join(root, "node_modules/playwright/package.json"), JSON.stringify({ version: "1.62.1" }));
    writeFileSync(join(root, "node_modules/playwright/cli.js"), `
      const fs = require('node:fs');
      const { spawnSync } = require('node:child_process');
      if (process.env.SECRET_NOT_ALLOWED || process.env.CLIENT_PROVIDER_CALLS_ENABLED) process.exit(3);
      if (!['--workers=1', '--retries=0', '--reporter=json'].every(flag => process.argv.includes(flag))) process.exit(6);
      const mode = fs.readFileSync('node_modules/playwright/mode.txt', 'utf8');
      if (mode === 'check-invalidation') {
        const initial = JSON.parse(fs.readFileSync('tmp/ai-release-local-v1-report.json', 'utf8'));
        if (initial.localGatePassed !== false || initial.runnerStatus !== 'incomplete') process.exit(4);
      }
      if (mode === 'mutate') fs.writeFileSync('sentinel.txt', 'changed during run');
      if (mode === 'untracked') fs.writeFileSync('new-source.txt', 'created during run');
      if (mode === 'commit') {
        fs.writeFileSync('sentinel.txt', 'new commit during run');
        spawnSync('git', ['add', 'sentinel.txt']);
        const commit = spawnSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'changed']);
        if (commit.status !== 0) process.exit(5);
      }
      if (mode === 'config') fs.writeFileSync('playwright.unit.config.ts', 'export default { retries: 1 };');
      if (mode === 'fixture') fs.appendFileSync('evaluations/ai-release-local-v1.json', ' ');
      if (mode === 'runtime') fs.writeFileSync('node_modules/playwright/package.json', JSON.stringify({ version: '1.62.2' }));
      const report = { errors: mode === 'runner-error' ? [{ message: 'global failure' }] : [],
        stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0 },
        suites: [{ specs: [{ file: 'fixture.spec.ts', title: 'fixture case',
          tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, duration: 1 }] }] }] }] };
      if (mode === 'retry') report.suites[0].specs[0].tests[0].results.push({ status: 'passed', retry: 1, duration: 1 });
      process.stdout.write(mode === 'malformed' ? 'not JSON' : JSON.stringify(report));
      process.exitCode = mode === 'failed' ? 1 : 0;
    `);
    const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: root, LANG: "C.UTF-8", CI: "1",
      SECRET_NOT_ALLOWED: "must-not-reach-test-child", CLIENT_PROVIDER_CALLS_ENABLED: "1" };
    for (const args of [["init", "--quiet"], ["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Fixture baseline"]]) {
      const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    }
    check((mode = "passed") => {
      writeFileSync(join(root, "node_modules/playwright/mode.txt"), mode);
      const result = spawnSync(process.execPath, ["scripts/run-ai-release-evaluation.mjs"], { cwd: root, env, encoding: "utf8" });
      return { result, receipt: JSON.parse(readFileSync(join(root, "tmp/ai-release-local-v1-report.json"), "utf8")) };
    }, root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("AI evaluator rejects a tracked source change during a passing runner", () => {
  harness((run) => {
    expect(run().result.status).toBe(0);
    const changed = run("mutate");
    expect(changed.result.status).toBe(1);
    expect(changed.receipt.localGatePassed).toBe(false);
    expect(changed.receipt.candidateFingerprintSha256).not.toBe(changed.receipt.candidateFingerprintAfterSha256);
  });
});

test("AI evaluator invalidates old passes before launch and malformed fixture validation", () => {
  harness((run, root) => {
    const passed = run();
    expect(passed.result.status).toBe(0);
    chmodSync(join(root, "tmp/ai-release-local-v1-report.json"), 0o644);
    expect(run("check-invalidation").result.status).toBe(0);
    expect(statSync(join(root, "tmp/ai-release-local-v1-report.json")).mode & 0o777).toBe(0o600);
    writeFileSync(join(root, "evaluations/ai-release-local-v1.json"), "not JSON");
    const invalid = run();
    expect(invalid.result.status).not.toBe(0);
    expect(invalid.receipt.localGatePassed).toBe(false);
    expect(invalid.receipt.runnerStatus).toBe("incomplete");
  });
});

test("AI evaluator records stable run identity and rejects failed, malformed, retried and global-error runners", () => {
  harness((run) => {
    const passed = run();
    expect(passed.result.status, String(passed.result.stderr)).toBe(0);
    expect(passed.receipt).toMatchObject({ schemaVersion: 2, runnerStatus: "passed", localGatePassed: true,
      sourceCommitAfter: passed.receipt.sourceCommit,
      candidateFingerprintAfterSha256: passed.receipt.candidateFingerprintSha256,
      workingTreeClean: true, workingTreeCleanAfter: true,
      playwrightVersion: "1.62.1", nodeVersion: process.version,
      runnerConfiguration: { workers: 1, retries: 0, reporter: "json", timeoutMs: 600000, environment: "allowlisted-offline-v1" } });
    expect(passed.receipt.unitConfigSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(passed.receipt.startedAt).toBeTruthy();
    expect(Date.parse(passed.receipt.startedAt)).toBeLessThanOrEqual(Date.parse(passed.receipt.checkedAt));
    for (const mode of ["failed", "malformed", "retry", "runner-error"]) {
      const failed = run(mode);
      expect(failed.result.status, mode).toBe(1);
      expect(failed.receipt.localGatePassed, mode).toBe(false);
      expect(failed.receipt.runnerStatus, mode).toBe("failed");
    }
  });
});

for (const mode of ["untracked", "commit", "config", "fixture", "runtime"]) {
  test(`AI evaluator rejects ${mode} drift during evaluation`, () => {
    harness((run) => {
      const changed = run(mode);
      expect(changed.result.status).toBe(1);
      expect(changed.receipt.localGatePassed).toBe(false);
      expect(changed.receipt.runnerStatus).toBe("failed");
      if (mode === "commit") expect(changed.receipt.sourceCommit).not.toBe(changed.receipt.sourceCommitAfter);
      else if (mode === "runtime") expect(changed.receipt).toMatchObject({ playwrightVersion: "1.62.1", playwrightVersionAfter: "1.62.2" });
      else expect(changed.receipt.candidateFingerprintSha256).not.toBe(changed.receipt.candidateFingerprintAfterSha256);
    });
  });
}
