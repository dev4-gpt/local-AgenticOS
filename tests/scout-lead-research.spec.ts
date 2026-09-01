import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

test("Scout remains a disabled, manual-only research candidate", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, "infrastructure/scout/scout-lead-research.manifest.example.json"), "utf8"));

  expect(manifest.state).toBe("disabled");
  expect(manifest.source).toMatchObject({
    repository: "https://github.com/kiryano/Scout",
    license: "MIT",
    candidateCommit: null,
    reviewedCommit: null,
    review: { decision: "blocked" },
  });
  expect(manifest.deployment).toMatchObject({
    runtime: "external-manual-only",
    separateProject: true,
    publicIngress: false,
    directVeloceRuntimeConnection: false,
  });
  expect(manifest.dataBoundary).toMatchObject({
    rawLeadImportEnabled: false,
    rawProfileStorageEnabled: false,
    emailOrPhoneStorageEnabled: false,
    browserCookieUseEnabled: false,
    proxyUseEnabled: false,
    automaticOutreachEnabled: false,
  });
  expect(manifest.openreplyHandoff).toEqual({
    enabled: false,
    mode: "manual-aggregate-only",
    requiresCampaignApproval: true,
    allowsRawLeadData: false,
  });
});

test("the Scout lead-research verifier fails closed", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-scout-lead-research.mjs"], { cwd: root, encoding: "utf8" });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  expect(JSON.parse(result.stdout).ok).toBe(true);
});
