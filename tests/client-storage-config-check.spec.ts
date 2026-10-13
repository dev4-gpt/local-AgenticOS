import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { evaluateClientStorageConfig } from "../scripts/lib/client-storage-config-check.mjs";

const expected = {
  bucket: "agentos-mvp-veloce-internal-beta",
  namespace: "internal-beta",
  origin: "https://agentos-internal-beta-vbimnfseva-ew.a.run.app",
  retentionDays: 45,
};

function snapshot() {
  return {
    name: expected.bucket,
    cors_config: [{ origin: [expected.origin], method: ["GET", "PUT", "OPTIONS"], responseHeader: ["Content-Type", "ETag"] }],
    lifecycle_config: { rule: [{ action: { type: "Delete" }, condition: { age: 45, matchesPrefix: ["internal-beta/"] } }] },
    soft_delete_policy: { retentionDurationSeconds: 0 },
  };
}

test("storage preflight accepts same-origin proxy storage and 45-day object policy", () => {
  const result = evaluateClientStorageConfig(snapshot(), expected);
  expect(result).toMatchObject({ ok: true, failures: [] });
  const cli = spawnSync(process.execPath, ["scripts/verify-client-storage-config.mjs",
    "--bucket", expected.bucket, "--namespace", expected.namespace, "--expected-origin", expected.origin,
  ], { input: JSON.stringify(snapshot()), encoding: "utf8" });
  expect(cli.status).toBe(0);
  expect(JSON.parse(cli.stdout)).toMatchObject({ ok: true, failures: [] });
});

test("storage preflight checks exact retention and soft-delete policy, not direct-client CORS", () => {
  const bucket = snapshot();
  bucket.cors_config[0].origin = ["https://agentos-internal-beta-1028728465669.europe-west1.run.app"];
  bucket.lifecycle_config.rule[0].condition.age = 1;
  bucket.soft_delete_policy.retentionDurationSeconds = 604800;
  const result = evaluateClientStorageConfig(bucket, expected);
  expect(result.failures).toEqual(expect.arrayContaining([
    "overlapping_delete_rule_unreviewed",
    "exact_retention_delete_rule_missing", "soft_delete_extends_retention",
  ]));
  expect(result.failures).not.toContain("runtime_origin_not_allowed");
});

test("storage preflight rejects wildcard CORS, broad early deletion, and versioning", () => {
  const bucket = snapshot();
  bucket.cors_config[0].method = ["GET"];
  bucket.cors_config[0].responseHeader = ["ETag"];
  bucket.cors_config.push({ origin: ["*"], method: ["GET", "PUT"], responseHeader: ["Content-Type", "ETag"] });
  bucket.lifecycle_config.rule.push({ action: { type: "Delete" }, condition: { age: 7 } });
  Object.assign(bucket, { versioning_enabled: true });
  const result = evaluateClientStorageConfig(bucket, expected);
  expect(result.failures).toEqual(expect.arrayContaining([
    "cors_wildcard_origin",
    "overlapping_delete_rule_unreviewed", "bucket_versioning_extends_retention",
  ]));
});

test("storage preflight accepts no bucket CORS because browsers use the server proxy", () => {
  const bucket = snapshot();
  bucket.cors_config = [];
  const result = evaluateClientStorageConfig(bucket, expected);
  expect(result).toMatchObject({ ok: true, failures: [] });
});
