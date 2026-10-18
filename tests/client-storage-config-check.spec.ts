import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { evaluateClientStorageConfig } from "../scripts/lib/client-storage-config-check.mjs";

const expected = {
  bucket: "agentos-mvp-veloce-internal-beta",
  namespace: "internal-beta",
  origin: "https://agentos-internal-beta-vbimnfseva-ew.a.run.app",
  retentionDays: 28,
  recoveryDays: 7,
};

function snapshot() {
  return {
    name: expected.bucket,
    cors_config: [{ origin: [expected.origin], method: ["GET", "PUT", "OPTIONS"], responseHeader: ["Content-Type", "ETag"] }],
    lifecycle_config: { rule: [
      { action: { type: "Delete" }, condition: { age: 28, matchesPrefix: ["internal-beta/"] } },
      { action: { type: "Delete" }, condition: { daysSinceCustomTime: 28, matchesPrefix: ["internal-beta/"] } },
    ] },
    soft_delete_policy: { retentionDurationSeconds: 604800 },
  };
}

test("storage preflight accepts 28-day active storage plus seven-day recovery", () => {
  const result = evaluateClientStorageConfig(snapshot(), expected);
  expect(result).toMatchObject({ ok: true, maximumRecoverableDays: 35, failures: [] });
  const cli = spawnSync(process.execPath, ["scripts/verify-client-storage-config.mjs",
    "--bucket", expected.bucket, "--namespace", expected.namespace, "--expected-origin", expected.origin,
  ], { input: JSON.stringify(snapshot()), encoding: "utf8" });
  expect(cli.status).toBe(0);
  expect(JSON.parse(cli.stdout)).toMatchObject({ ok: true, maximumRecoverableDays: 35, failures: [] });
});

test("storage preflight accepts integer-string durations from live gcloud metadata", () => {
  const bucket = snapshot();
  Object.assign(bucket.soft_delete_policy, { retentionDurationSeconds: "604800" });
  Object.assign(bucket, { retention_policy: { retention_period: "0" } });
  expect(evaluateClientStorageConfig(bucket, expected)).toMatchObject({ ok: true, failures: [] });

  const cli = spawnSync(process.execPath, ["scripts/verify-client-storage-config.mjs",
    "--bucket", expected.bucket, "--namespace", expected.namespace, "--expected-origin", expected.origin,
  ], { input: JSON.stringify(bucket), encoding: "utf8" });
  expect(cli.status).toBe(0);
  expect(JSON.parse(cli.stdout)).toMatchObject({ ok: true, failures: [] });

  bucket.lifecycle_config.rule[0].condition.age = 14;
  const earlyDeletion = evaluateClientStorageConfig(bucket, expected);
  expect(earlyDeletion.ok).toBe(false);
  expect(earlyDeletion.failures).toContain("exact_retention_delete_rule_missing");
  expect(earlyDeletion.failures).not.toContain("recovery_window_not_seven_days");
});

test("storage preflight rejects malformed, unsafe and wrong duration values", () => {
  for (const value of ["604800.0", "6.048e5", " 604800 ", "+604800", "0604800", "604800s",
    "9007199254740993", "", null, true, {}, -604800, 604800.5, "1209600"]) {
    const bucket = snapshot();
    Object.assign(bucket.soft_delete_policy, { retentionDurationSeconds: value });
    expect(evaluateClientStorageConfig(bucket, expected).failures, String(value))
      .toContain("recovery_window_not_seven_days");
  }
  for (const value of ["2419200.0", "2.4192e6", " 2419200 ", "+2419200", "02419200", "2419200s",
    "9007199254740993", "", true, {}, -1, 2419200.5, "2505600"]) {
    const bucket = snapshot();
    Object.assign(bucket, { retentionPolicy: { retentionPeriod: value } });
    expect(evaluateClientStorageConfig(bucket, expected).failures, String(value))
      .toContain("bucket_retention_exceeds_active_window");
  }
});

test("storage preflight checks exact retention and soft-delete policy, not direct-client CORS", () => {
  const bucket = snapshot();
  bucket.cors_config[0].origin = ["https://agentos-internal-beta-1028728465669.europe-west1.run.app"];
  bucket.lifecycle_config.rule[0].condition.age = 1;
  bucket.soft_delete_policy.retentionDurationSeconds = 604800;
  const result = evaluateClientStorageConfig(bucket, expected);
  expect(result.failures).toEqual(expect.arrayContaining([
    "overlapping_delete_rule_unreviewed", "exact_retention_delete_rule_missing",
  ]));
  expect(result.failures).not.toContain("recovery_window_not_seven_days");
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

test("storage preflight accepts the documented Cloud Storage JSON field names", () => {
  const normalized = snapshot();
  const bucket = {
    name: normalized.name,
    cors: normalized.cors_config,
    lifecycle: normalized.lifecycle_config,
    softDeletePolicy: normalized.soft_delete_policy,
    versioning: { enabled: false },
    defaultEventBasedHold: false,
  };
  expect(evaluateClientStorageConfig(bucket, expected)).toMatchObject({ ok: true, failures: [] });
});

test("storage preflight rejects defaults that can retain objects beyond the approved window", () => {
  const held = snapshot();
  held.defaultEventBasedHold = true;
  expect(evaluateClientStorageConfig(held, expected).failures).toContain("default_event_based_hold_enabled");

  const retained = snapshot();
  retained.retentionPolicy = { retentionPeriod: 29 * 24 * 60 * 60, isLocked: true };
  expect(evaluateClientStorageConfig(retained, expected).failures).toContain("bucket_retention_exceeds_active_window");

  const withinWindow = snapshot();
  withinWindow.retentionPolicy = { retentionPeriod: 28 * 24 * 60 * 60, isLocked: false };
  expect(evaluateClientStorageConfig(withinWindow, expected).failures).toContain("bucket_retention_blocks_original_deadlines");
});
