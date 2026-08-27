import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

test("OpenReply stays an isolated disabled connector with current routes", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, "infrastructure/openreply/openreply-pilot.manifest.example.json"), "utf8"));
  const campaign = JSON.parse(readFileSync(resolve(root, "client-blueprints/veloce-self-marketing.campaign.json"), "utf8"));
  const connector = campaign.deliveryConnectors.find((item: { id: string }) => item.id === "openreply-instagram");

  expect(manifest.state).toBe("disabled");
  expect(manifest.source.candidateCommit).toMatch(/^[0-9a-f]{40}$/);
  expect(manifest.source.reviewedCommit).toBeNull();
  expect(manifest.source.review.decision).toBe("blocked");
  expect(manifest.source.review.tests).toEqual({ result: "passed", count: 145 });
  expect(manifest.source.review.typecheck).toBe("passed");
  expect(manifest.source.review.productionAudit.critical).toBeGreaterThan(0);
  expect(manifest.source.review.productionAudit.high).toBeGreaterThan(0);
  expect(manifest.deployment.web.oauthCallbackPath).toBe("/api/instagram/callback");
  expect(manifest.deployment.web.webhookPath).toBe("/api/webhook");
  expect(manifest.deployment.web.healthPath).toBe("/api/health");
  expect(manifest.webhookFields).toEqual(["comments", "messages"]);
  expect(manifest.safety).toEqual({
    humanApprovalRequired: true,
    automaticPublishingEnabled: false,
    directVeloceRuntimeConnection: false,
    copySensitiveDataToVeloce: false,
  });
  expect(connector.state).toBe("disabled");
  expect(connector.approvalRequired).toBe(true);
});

test("the secret-free OpenReply blueprint verifier passes", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-openreply-pilot.mjs"], { cwd: root, encoding: "utf8" });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  expect(JSON.parse(result.stdout).ok).toBe(true);
});

test("strict OpenReply activation fails closed for the blocked upstream candidate", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-openreply-pilot.mjs", "--strict"], { cwd: root, encoding: "utf8" });
  expect(result.status).toBe(1);
  const output = JSON.parse(result.stdout);
  expect(output.ok).toBe(false);
  expect(output.failures).toContain("strict mode requires an approved upstream source review");
  expect(output.failures).toContain("strict mode requires a reviewed 40-character upstream commit");
});
