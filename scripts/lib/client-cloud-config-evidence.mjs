import { createHash } from "node:crypto";
import { evaluateClientRuntimeConfig } from "./client-runtime-config-check.mjs";
import { evaluateClientStorageConfig } from "./client-storage-config-check.mjs";

const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function evaluateClientCloudConfigEvidence(serviceSnapshot, bucketSnapshot, expected, checkedAt) {
  const origin = serviceSnapshot?.status?.url;
  const runtime = evaluateClientRuntimeConfig(serviceSnapshot, {
    service: expected.service,
    revision: expected.revision,
    digest: expected.imageDigest?.replace(/^sha256:/, ""),
    tenant: expected.namespace,
  });
  const storage = evaluateClientStorageConfig(bucketSnapshot, {
    bucket: expected.bucket,
    namespace: expected.namespace,
    origin,
    retentionDays: 45,
  });
  const env = serviceSnapshot?.spec?.template?.spec?.containers?.[0]?.env;
  const variable = (name) => Array.isArray(env) ? env.find((entry) => entry?.name === name)?.value : null;
  const failures = [...runtime.failures, ...storage.failures];
  if (variable("CLIENT_STORAGE_BUCKET") !== expected.bucket) failures.push("runtime_storage_bucket_mismatch");
  if (variable("CLIENT_STORAGE_NAMESPACE") !== expected.namespace) failures.push("runtime_storage_namespace_mismatch");
  if (typeof origin !== "string" || !/^https:\/\/[^/]+$/.test(origin)) failures.push("runtime_origin_invalid");

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
    cors_config: bucketSnapshot?.cors_config,
    lifecycle_config: bucketSnapshot?.lifecycle_config,
    soft_delete_policy: bucketSnapshot?.soft_delete_policy,
    versioning_enabled: bucketSnapshot?.versioning_enabled,
    versioning: bucketSnapshot?.versioning,
  };
  return {
    schemaVersion: 1,
    checkedAt,
    project: expected.project,
    region: expected.region,
    service: expected.service,
    bucket: expected.bucket,
    namespace: expected.namespace,
    origin: typeof origin === "string" ? origin : null,
    revision: expected.revision,
    imageDigest: expected.imageDigest,
    serviceConfigSha256: sha256(serviceConfig),
    bucketConfigSha256: sha256(bucketConfig),
    passed: failures.length === 0,
    failures: [...new Set(failures)],
  };
}

export function validClientCloudConfigEvidence(record, current, deployment, { requireCurrent = false } = {}) {
  return record?.schemaVersion === 1 && record.passed === true && Array.isArray(record.failures) && record.failures.length === 0
    && (!requireCurrent || (current !== null && current !== undefined))
    && Number.isFinite(Date.parse(record.checkedAt))
    && record.revision === deployment?.cloudRunRevision && record.imageDigest === deployment?.imageDigest
    && /^[0-9a-f]{64}$/.test(record.serviceConfigSha256 ?? "")
    && /^[0-9a-f]{64}$/.test(record.bucketConfigSha256 ?? "")
    && (!current || (current.passed === true && current.failures.length === 0
      && ["project", "region", "service", "bucket", "namespace", "origin", "revision", "imageDigest", "serviceConfigSha256", "bucketConfigSha256"]
        .every((key) => current[key] === record[key])));
}
