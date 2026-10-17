import { createHash } from "node:crypto";
import { evaluateClientRuntimeConfig } from "./client-runtime-config-check.mjs";
import { evaluateClientStorageConfig } from "./client-storage-config-check.mjs";
import { validClientStorageObjectInventoryReport } from "./client-storage-object-inventory.mjs";
import { CLIENT_RUNTIME_CONFIG_KEYS, clientRuntimeConfigDigest } from "../../src/lib/clientRuntimeConfigDigest.mjs";
import { CLIENT_STORAGE_RETENTION_CLOCK } from "../../src/lib/clientStorageRetentionClock.mjs";
import { CLIENT_STORAGE_ARTIFACT_CROSSWALK } from "./client-storage-artifact-inventory.mjs";

const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateClientCloudConfigEvidence(serviceSnapshot, bucketSnapshot, expected, checkedAt, objectInventory) {
  const origin = serviceSnapshot?.status?.url;
  const runtime = evaluateClientRuntimeConfig(serviceSnapshot, {
    service: expected.service,
    revision: expected.revision,
    digest: expected.imageDigest?.replace(/^sha256:/, ""),
    tenant: expected.namespace,
    retentionDays: expected.retentionDays ?? 28,
  });
  const storage = evaluateClientStorageConfig(bucketSnapshot, {
    bucket: expected.bucket,
    namespace: expected.namespace,
    origin,
    retentionDays: expected.retentionDays ?? 28,
    recoveryDays: expected.recoveryDays ?? 7,
  });
  const env = serviceSnapshot?.spec?.template?.spec?.containers?.[0]?.env;
  const variable = (name) => Array.isArray(env) ? env.find((entry) => entry?.name === name)?.value : null;
  const runtimeConfigDigest = clientRuntimeConfigDigest(Object.fromEntries(CLIENT_RUNTIME_CONFIG_KEYS.map((key) => [key, variable(key)])));
  const supabaseProjectRef = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(variable("SUPABASE_URL") ?? "")?.[1] ?? null;
  const inventoryExpected = {
    project: expected.project, bucket: expected.bucket, namespace: expected.namespace,
    account: expected.account ?? null, retentionDays: expected.retentionDays ?? 28,
    recoveryDays: expected.recoveryDays ?? 7,
    supabaseProjectRef: expected.supabaseProjectRef,
  };
  const inventoryValid = validClientStorageObjectInventoryReport(objectInventory, inventoryExpected);
  const failures = [...runtime.failures, ...storage.failures];
  if (!inventoryValid) failures.push("storage_object_inventory_missing_or_invalid");
  if (variable("CLIENT_STORAGE_BUCKET") !== expected.bucket) failures.push("runtime_storage_bucket_mismatch");
  if (variable("CLIENT_STORAGE_NAMESPACE") !== expected.namespace) failures.push("runtime_storage_namespace_mismatch");
  if (typeof origin !== "string" || !/^https:\/\/[^/]+$/.test(origin)) failures.push("runtime_origin_invalid");
  if (supabaseProjectRef !== expected.supabaseProjectRef) failures.push("runtime_supabase_project_mismatch");

  const serviceConfig = {
    metadata: { name: serviceSnapshot?.metadata?.name, generation: serviceSnapshot?.metadata?.generation },
    status: {
      latestCreatedRevisionName: serviceSnapshot?.status?.latestCreatedRevisionName,
      latestReadyRevisionName: serviceSnapshot?.status?.latestReadyRevisionName,
      observedGeneration: serviceSnapshot?.status?.observedGeneration,
      traffic: serviceSnapshot?.status?.traffic,
      url: origin,
    },
    container: serviceSnapshot?.spec?.template?.spec?.containers?.[0],
  };
  const bucketConfig = {
    name: bucketSnapshot?.name,
    cors: bucketSnapshot?.cors ?? bucketSnapshot?.cors_config,
    lifecycle: bucketSnapshot?.lifecycle ?? bucketSnapshot?.lifecycle_config,
    softDeletePolicy: bucketSnapshot?.softDeletePolicy ?? bucketSnapshot?.soft_delete_policy,
    versioning: bucketSnapshot?.versioning ?? (bucketSnapshot?.versioning_enabled === true ? { enabled: true } : undefined),
    defaultEventBasedHold: bucketSnapshot?.defaultEventBasedHold ?? bucketSnapshot?.default_event_based_hold,
    retentionPolicy: bucketSnapshot?.retentionPolicy ?? bucketSnapshot?.retention_policy,
  };
  return {
    schemaVersion: 4,
    retentionClock: CLIENT_STORAGE_RETENTION_CLOCK,
    checkedAt,
    project: expected.project,
    region: expected.region,
    service: expected.service,
    bucket: expected.bucket,
    namespace: expected.namespace,
    retentionDays: expected.retentionDays ?? 28,
    recoveryDays: expected.recoveryDays ?? 7,
    supabaseProjectRef,
    origin: typeof origin === "string" ? origin : null,
    revision: expected.revision,
    imageDigest: expected.imageDigest,
    runtimeConfigDigest,
    objectInventorySha256: inventoryValid ? objectInventory.objectInventorySha256 : null,
    artifactCrosswalk: inventoryValid ? objectInventory.artifactCrosswalk : null,
    artifactSnapshotSha256: inventoryValid ? objectInventory.artifactSnapshotSha256 : null,
    artifactRows: inventoryValid ? objectInventory.artifactRows : null,
    objectInventoryAccount: inventoryValid ? objectInventory.account : null,
    objectInventoryCheckedAt: inventoryValid ? objectInventory.checkedAt : null,
    liveObjectVersions: inventoryValid ? objectInventory.liveObjectVersions : null,
    softDeletedObjectVersions: inventoryValid ? objectInventory.softDeletedObjectVersions : null,
    liveListingSha256: inventoryValid ? objectInventory.liveListingSha256 : null,
    softDeletedListingSha256: inventoryValid ? objectInventory.softDeletedListingSha256 : null,
    serviceConfigSha256: sha256(serviceConfig),
    bucketConfigSha256: sha256(bucketConfig),
    passed: failures.length === 0,
    failures: [...new Set(failures)],
  };
}

export function validClientCloudConfigEvidence(record, current, deployment, { requireCurrent = false } = {}) {
  return /^[a-z0-9]{20}$/.test(deployment?.supabaseProjectRef ?? "")
    && record?.schemaVersion === 4 && record.retentionClock === CLIENT_STORAGE_RETENTION_CLOCK
    && record.artifactCrosswalk === CLIENT_STORAGE_ARTIFACT_CROSSWALK
    && /^[0-9a-f]{64}$/.test(record.artifactSnapshotSha256 ?? "")
    && Number.isSafeInteger(record.artifactRows) && record.artifactRows >= 0 && record.artifactRows <= 50_000
    && record.passed === true && Array.isArray(record.failures) && record.failures.length === 0
    && record.retentionDays === 28 && record.recoveryDays === 7
    && (!requireCurrent || (current !== null && current !== undefined))
    && Number.isFinite(Date.parse(record.checkedAt))
    && record.revision === deployment?.cloudRunRevision && record.imageDigest === deployment?.imageDigest
    && record.supabaseProjectRef === deployment?.supabaseProjectRef
    && /^[0-9a-f]{64}$/.test(record.runtimeConfigDigest ?? "")
    && /^[0-9a-f]{64}$/.test(record.serviceConfigSha256 ?? "")
    && /^[0-9a-f]{64}$/.test(record.bucketConfigSha256 ?? "")
    && /^[0-9a-f]{64}$/.test(record.objectInventorySha256 ?? "")
    && (record.objectInventoryAccount === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.objectInventoryAccount ?? ""))
    && Number.isFinite(Date.parse(record.objectInventoryCheckedAt ?? ""))
    && Number.isSafeInteger(record.liveObjectVersions) && record.liveObjectVersions >= 0
    && Number.isSafeInteger(record.softDeletedObjectVersions) && record.softDeletedObjectVersions >= 0
    && /^[0-9a-f]{64}$/.test(record.liveListingSha256 ?? "")
    && /^[0-9a-f]{64}$/.test(record.softDeletedListingSha256 ?? "")
    && (!current || (current.schemaVersion === 4 && current.retentionClock === CLIENT_STORAGE_RETENTION_CLOCK
      && current.passed === true && current.failures.length === 0
      && ["project", "region", "service", "bucket", "namespace", "retentionDays", "recoveryDays", "supabaseProjectRef", "origin", "revision", "imageDigest", "runtimeConfigDigest", "serviceConfigSha256", "bucketConfigSha256", "objectInventorySha256", "artifactCrosswalk", "artifactSnapshotSha256", "artifactRows", "objectInventoryAccount", "liveObjectVersions", "softDeletedObjectVersions", "liveListingSha256", "softDeletedListingSha256"]
        .every((key) => current[key] === record[key])));
}
