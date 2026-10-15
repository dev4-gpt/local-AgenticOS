export function evaluateClientStorageConfig(bucket, expected) {
  const failures = [];
  const prefix = `${expected.namespace}/`;
  if (bucket?.name !== expected.bucket) failures.push("bucket_identity_mismatch");

  const cors = Array.isArray(bucket?.cors_config) ? bucket.cors_config : [];
  if (cors.some((rule) => rule?.origin?.includes("*"))) failures.push("cors_wildcard_origin");

  const rules = Array.isArray(bucket?.lifecycle_config?.rule) ? bucket.lifecycle_config.rule : [];
  let exactDeleteRule = false;
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
    if (exact) exactDeleteRule = true;
    else failures.push("overlapping_delete_rule_unreviewed");
  }
  if (!exactDeleteRule) failures.push("exact_retention_delete_rule_missing");
  if (bucket?.versioning_enabled === true || bucket?.versioning?.enabled === true) failures.push("bucket_versioning_extends_retention");
  const recoverySeconds = expected.recoveryDays * 24 * 60 * 60;
  if (!Number.isSafeInteger(expected.recoveryDays) || expected.recoveryDays !== 7
      || bucket?.soft_delete_policy?.retentionDurationSeconds !== recoverySeconds) {
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
    failures: [...new Set(failures)],
  };
}
