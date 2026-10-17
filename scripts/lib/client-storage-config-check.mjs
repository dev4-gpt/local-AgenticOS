import { CLIENT_STORAGE_RETENTION_CLOCK } from "../../src/lib/clientStorageRetentionClock.mjs";

export function evaluateClientStorageConfig(bucket, expected) {
  const failures = [];
  if (!Number.isSafeInteger(expected.retentionDays) || expected.retentionDays < 1 || expected.retentionDays > 28) failures.push("retention_policy_invalid");
  const prefix = `${expected.namespace}/`;
  if (bucket?.name !== expected.bucket) failures.push("bucket_identity_mismatch");

  const corsValue = bucket?.cors ?? bucket?.cors_config;
  const cors = Array.isArray(corsValue) ? corsValue : [];
  if (cors.some((rule) => rule?.origin?.includes("*"))) failures.push("cors_wildcard_origin");

  const lifecycle = bucket?.lifecycle ?? bucket?.lifecycle_config;
  const rules = Array.isArray(lifecycle?.rule) ? lifecycle.rule : [];
  let exactDeleteRule = false;
  let exactDeadlineRule = false;
  for (const rule of rules) {
    if (rule?.action?.type !== "Delete") continue;
    const condition = rule.condition;
    const prefixes = condition?.matchesPrefix;
    const overlaps = !Array.isArray(prefixes) || prefixes.length === 0
      || prefixes.some((value) => typeof value === "string" && (prefix.startsWith(value) || value.startsWith(prefix)));
    if (!overlaps) continue;
    const exact = condition?.age === expected.retentionDays
      && Array.isArray(prefixes) && prefixes.length === 1 && prefixes[0] === prefix
      && Object.keys(condition).every((key) => key === "age" || key === "matchesPrefix");
    const deadline = condition?.daysSinceCustomTime === expected.retentionDays
      && Array.isArray(prefixes) && prefixes.length === 1 && prefixes[0] === prefix
      && Object.keys(condition).every((key) => key === "daysSinceCustomTime" || key === "matchesPrefix");
    if (exact) exactDeleteRule = true;
    else if (deadline) exactDeadlineRule = true;
    else failures.push("overlapping_delete_rule_unreviewed");
  }
  if (!exactDeleteRule) failures.push("exact_retention_delete_rule_missing");
  if (!exactDeadlineRule) failures.push("original_deadline_delete_rule_missing");
  const versioning = bucket?.versioning;
  if (bucket?.versioning_enabled === true || versioning?.enabled === true) failures.push("bucket_versioning_extends_retention");
  if (bucket?.defaultEventBasedHold === true || bucket?.default_event_based_hold === true) {
    failures.push("default_event_based_hold_enabled");
  }
  const retentionPolicy = bucket?.retentionPolicy ?? bucket?.retention_policy;
  const retentionPeriod = retentionPolicy?.retentionPeriod ?? retentionPolicy?.retention_period;
  if (retentionPeriod !== undefined && retentionPeriod !== null
      && (storageDurationSeconds(retentionPeriod) === null
        || storageDurationSeconds(retentionPeriod) > expected.retentionDays * 24 * 60 * 60)) {
    failures.push("bucket_retention_exceeds_active_window");
  }
  if (storageDurationSeconds(retentionPeriod) > 0) failures.push("bucket_retention_blocks_original_deadlines");
  if (retentionPolicy !== undefined && retentionPolicy !== null && typeof retentionPolicy !== "object") {
    failures.push("bucket_retention_policy_invalid");
  }
  const recoverySeconds = expected.recoveryDays * 24 * 60 * 60;
  const softDeletePolicy = bucket?.softDeletePolicy ?? bucket?.soft_delete_policy;
  if (!Number.isSafeInteger(expected.recoveryDays) || expected.recoveryDays !== 7
      || storageDurationSeconds(softDeletePolicy?.retentionDurationSeconds) !== recoverySeconds) {
    failures.push("recovery_window_not_seven_days");
  }

  return {
    ok: failures.length === 0,
    bucket: expected.bucket,
    origin: expected.origin,
    namespace: expected.namespace,
    retentionDays: expected.retentionDays,
    recoveryDays: expected.recoveryDays,
    maximumRecoverableDays: expected.retentionDays + expected.recoveryDays,
    retentionClock: CLIENT_STORAGE_RETENTION_CLOCK,
    evidenceScope: "configuration_only_not_deletion_or_recovery_behavior",
    failures: [...new Set(failures)],
  };
}

function storageDurationSeconds(value) {
  // Cloud Storage int64 fields may arrive as decimal strings from gcloud.
  if (typeof value !== "number" && (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value))) return null;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null;
}
