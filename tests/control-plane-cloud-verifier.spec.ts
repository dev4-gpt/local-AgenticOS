import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

test("cloud verifier protects the private adapter boundary", () => {
  const verifier = readFileSync(resolve(root, "scripts/verify-control-plane-cloud.mjs"), "utf8");

  expect(verifier).toContain('publicEnv.GCP_PROVISIONER_URL === expectedProvisionUrl');
  expect(verifier).toContain('publicEnv.GCP_PROVISIONER_AUDIENCE === audience');
  expect(verifier).toContain('GCP_PROVISIONER_ID_TOKEN_SOURCE === "metadata"');
  expect(verifier).toContain('run.googleapis.com/custom-audiences');
  expect(verifier).toContain('run.googleapis.com/invoker-iam-disabled');
  expect(verifier).toContain('adapterEnv.GCP_PROVISIONER_ALLOW_APPLY === "0"');
  expect(verifier).toContain('imageOf(adapterConfig).includes("@sha256:")');
  expect(verifier).toContain('membersForRole(adapterIam, "roles/run.invoker")');
  expect(verifier).toContain('"allUsers", "allAuthenticatedUsers"');
  expect(verifier).toContain('/api/internal/control-plane/provisioner-health');
  expect(verifier).not.toContain('/api/onboarding/provision-result');
});
