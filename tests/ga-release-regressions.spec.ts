import { expect, test } from "@playwright/test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

for (const flags of [["--strict"], []]) test(`publish refuses incomplete evidence before invoking cloud storage (${flags.length ? "explicit" : "implicit"} strict)`, () => {
  // PATH deliberately contains no gcloud: no cloud command is possible.
  const result = spawnSync(process.execPath, ["scripts/verify-production-readiness.mjs", ...flags, "--publish-ledger", "--allow-dirty", "--environment", "production"], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", STRIPE_MODE: "live" } });
  expect(result.status).toBe(1);
  const output = JSON.parse(result.stdout);
  expect(output.releaseReady).toBe(false);
  expect(output.failures).toContain("release_gate:migration_evidence_attached");
  expect(output.failures).toContain("release_gate:test_results_attached");
  expect(output.failures).toContain("release_gate:rollback_target");
  expect(output.failures.some((f: string) => f.includes("Failed to publish"))).toBe(false);
});

test("catalog CI verifier rejects missing provenance in the canonical and synced copies", () => {
  const dir = mkdtempSync(join(tmpdir(), "veloce-catalog-regression-"));
  try {
    mkdirSync(join(dir, "scripts")); mkdirSync(join(dir, "infrastructure")); mkdirSync(join(dir, "product-experience/src/data"), { recursive: true });
    writeFileSync(join(dir, "scripts/check.mjs"), readFileSync("scripts/verify-integration-catalog-contract.mjs"));
    const original = JSON.parse(readFileSync("infrastructure/integration-control-plane.manifest.json", "utf8"));
    for (const field of ["sbomReference", "provenanceReference"]) {
      for (const value of [null, "", " Pending:review"]) {
        const manifest = structuredClone(original);
        Object.assign(manifest.integrations[0], { state: "native-enabled", riskTier: "critical", sbomReference: "reference", provenanceReference: "reference", [field]: value });
        const raw = JSON.stringify(manifest);
        writeFileSync(join(dir, "infrastructure/integration-control-plane.manifest.json"), raw);
        writeFileSync(join(dir, "product-experience/src/data/integration-control-plane.manifest.json"), raw);
        const result = spawnSync(process.execPath, [join(dir, "scripts/check.mjs")], { encoding: "utf8" });
        expect(result.status).toBe(1); expect(result.stderr).toContain(`requires a non-pending ${field}`);
      }
    }
    // Both the policy gate and behavioral suite must be on the PR path.
    const ci = readFileSync(resolve(".github/workflows/security-release.yml"), "utf8");
    expect(ci).toContain("npm run verify:policy-gates"); expect(ci).toContain("npm run test:focused");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
