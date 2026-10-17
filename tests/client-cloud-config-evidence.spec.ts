import { expect, test } from "@playwright/test";
import { evaluateClientCloudConfigEvidence, validClientCloudConfigEvidence } from "../scripts/lib/client-cloud-config-evidence.mjs";
import { evaluateClientStorageObjectInventory } from "../scripts/lib/client-storage-object-inventory.mjs";

const digest = `sha256:${"a".repeat(64)}`;
const expected = {
  project: "agentos-mvp", region: "europe-west1", service: "agentos-internal-beta",
  bucket: "agentos-mvp-veloce-internal-beta", namespace: "internal-beta",
  supabaseProjectRef: "ppmoqjtmjtfxadsnejqc",
  revision: "agentos-internal-beta-00035-test", imageDigest: digest,
  retentionDays: 28, recoveryDays: 7,
};
const origin = "https://agentos-internal-beta-vbimnfseva-ew.a.run.app";

function objectInventory() {
  const checkedAt = new Date().toISOString();
  const expiry = new Date(Date.parse(checkedAt) + 28 * 86_400_000).toISOString();
  const sample = { startedAt: checkedAt, completedAt: checkedAt, complete: true, rows: [{
    id: "00000000-0000-4000-8000-000000000001", tenant_slug: expected.namespace, object_key: `${expected.namespace}/artifact.bin`,
    status: "ready", byte_size: 3, content_type: "application/octet-stream", created_at: checkedAt, retention_expires_at: expiry,
  }] };
  const report = evaluateClientStorageObjectInventory({
    schemaVersion: 1,
    bucket: expected.bucket,
    prefix: `${expected.namespace}/`,
    checkedAt,
    listingStartedAt: checkedAt, listingCompletedAt: checkedAt,
    artifactInventory: { schemaVersion: 1, projectRef: expected.supabaseProjectRef, namespace: expected.namespace, before: sample, after: structuredClone(sample) },
    liveListingComplete: true,
    softDeletedListingComplete: true,
    liveObjects: [{ name: `${expected.namespace}/artifact.bin`, generation: "1", size: "3", contentType: "application/octet-stream", timeCreated: checkedAt, customTime: checkedAt,
      metadata: { "agentos-retention-clock": "expiry-minus-bucket-days-v1", "agentos-retention-expires-at": new Date(Date.parse(checkedAt) + 28 * 86_400_000).toISOString() },
      eventBasedHold: false, temporaryHold: false }],
    softDeletedObjects: [],
    source: {
      collector: "verify-client-storage-object-inventory-v1",
      project: expected.project,
      account: null,
      liveListingMode: "all_versions",
      softDeletedListingMode: "soft_deleted_exhaustive",
      liveListingSha256: "a".repeat(64),
      softDeletedListingSha256: "b".repeat(64),
    },
  }, { project: expected.project, bucket: expected.bucket, namespace: expected.namespace, supabaseProjectRef: expected.supabaseProjectRef, retentionDays: 28, recoveryDays: 7 });
  return { ...report, account: null };
}

function snapshots() {
  const service = {
    metadata: { name: expected.service, generation: 35 },
    status: {
      latestCreatedRevisionName: expected.revision, latestReadyRevisionName: expected.revision,
      observedGeneration: 35, traffic: [{ revisionName: expected.revision, percent: 100 }], url: origin,
    },
    spec: { template: { spec: { containers: [{
      image: `example.invalid/client-runtime@${digest}`,
      env: [
        { name: "CLIENT_SLUG", value: expected.namespace },
        { name: "CLIENT_RUNTIME_ENFORCE_AUTH", value: "1" },
        { name: "CLIENT_PROVIDER_CALLS_ENABLED", value: "0" },
        { name: "CLIENT_RETENTION_DAYS", value: "28" },
        { name: "CLIENT_ALLOWED_ROUTES", value: "/,/memory,/notebook" },
        { name: "CLIENT_ALLOWED_API_ROUTES", value: "/api/client-runtime/source-import,/api/client-runtime/source-import/upload,/api/client-runtime/build-identity" },
        { name: "CLIENT_ENABLED_CAPABILITIES", value: "tenant-data,artifacts" },
        { name: "CLIENT_MODEL_PRICING_JSON", value: '{"model-b":{"input":2},"model-a":{"input":1}}' },
        { name: "CLIENT_STORAGE_BUCKET", value: expected.bucket },
        { name: "CLIENT_STORAGE_NAMESPACE", value: expected.namespace },
        { name: "SUPABASE_URL", value: `https://${expected.supabaseProjectRef}.supabase.co` },
        { name: "CLIENT_WORKER_TOKEN", valueFrom: { secretKeyRef: { name: "reviewed-worker-token" } } },
        { name: "SUPABASE_ANON_KEY", value: "PRIVATE_TEST_VALUE" },
      ],
    }] } } },
  };
  const bucket = {
    name: expected.bucket,
    cors: [{ origin: [origin], method: ["GET", "PUT"], responseHeader: ["Content-Type", "ETag"] }],
    lifecycle: { rule: [
      { action: { type: "Delete" }, condition: { age: 28, matchesPrefix: [`${expected.namespace}/`] } },
      { action: { type: "Delete" }, condition: { daysSinceCustomTime: 28, matchesPrefix: [`${expected.namespace}/`] } },
    ] },
    softDeletePolicy: { retentionDurationSeconds: 604800 },
    versioning: { enabled: false },
    defaultEventBasedHold: false,
  };
  return { service, bucket };
}

test("cloud receipt binds live service, bucket, origin, and deployment without leaking env values", () => {
  const { service, bucket } = snapshots();
  const receipt = evaluateClientCloudConfigEvidence(service, bucket, expected, "2026-10-09T22:00:00Z", objectInventory());
  expect(receipt).toMatchObject({ schemaVersion: 4, passed: true, failures: [], retentionDays: 28, recoveryDays: 7, origin, revision: expected.revision, imageDigest: digest });
  expect(validClientCloudConfigEvidence({ ...receipt, schemaVersion: 3 }, null, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(false);
  expect(receipt.runtimeConfigDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(validClientCloudConfigEvidence({ ...receipt, schemaVersion: 2 }, null, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(false);
  expect(validClientCloudConfigEvidence({ ...receipt, retentionClock: undefined }, null, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(false);
  expect(validClientCloudConfigEvidence(receipt, receipt, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(true);
  expect(validClientCloudConfigEvidence({ ...receipt, runtimeConfigDigest: "invalid" }, null, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(false);
  expect(validClientCloudConfigEvidence({ ...receipt, recoveryDays: 14 }, null, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(false);
  expect(validClientCloudConfigEvidence({ ...receipt, retentionDays: undefined }, null, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(false);
  service.spec.template.spec.containers[0].env.find((entry) => entry.name === "CLIENT_MODEL_PRICING_JSON")!.value = '{ "model-a": { "input": 1 }, "model-b": { "input": 2 } }';
  const reordered = evaluateClientCloudConfigEvidence(service, bucket, expected, "2026-10-09T22:00:01Z", objectInventory());
  expect(reordered.runtimeConfigDigest).toBe(receipt.runtimeConfigDigest);
  expect(validClientCloudConfigEvidence(receipt, null, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef }, { requireCurrent: true })).toBe(false);
  expect(JSON.stringify(receipt)).not.toContain("PRIVATE_TEST_VALUE");
  expect(validClientCloudConfigEvidence(receipt, receipt, { cloudRunRevision: "different-revision", imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(false);
  expect(validClientCloudConfigEvidence(receipt, receipt, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: "different-project-ref" })).toBe(false);
});

test("cloud receipt rejects a changed bucket, wrong runtime bucket, and snapshot drift", () => {
  const { service, bucket } = snapshots();
  const inventory = objectInventory();
  const original = evaluateClientCloudConfigEvidence(service, bucket, expected, "2026-10-09T22:00:00Z", inventory);
  bucket.lifecycle.rule[0].condition.age = 1;
  service.spec.template.spec.containers[0].env.find((entry) => entry.name === "CLIENT_RETENTION_DAYS")!.value = "21";
  const changed = evaluateClientCloudConfigEvidence(service, bucket, expected, "2026-10-09T22:01:00Z", inventory);
  expect(changed.failures).toContain("exact_retention_delete_rule_missing");
  expect(changed.runtimeConfigDigest).not.toBe(original.runtimeConfigDigest);
  expect(validClientCloudConfigEvidence(original, changed, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(false);
  service.spec.template.spec.containers[0].env.find((entry) => entry.name === "CLIENT_RETENTION_DAYS")!.value = "28";
  service.spec.template.spec.containers[0].env.find((entry) => entry.name === "CLIENT_STORAGE_BUCKET")!.value = "other-bucket";
  const wrongBucket = evaluateClientCloudConfigEvidence(service, bucket, expected, "2026-10-09T22:02:00Z", inventory);
  expect(wrongBucket.failures).toContain("runtime_storage_bucket_mismatch");
  service.spec.template.spec.containers[0].env.find((entry) => entry.name === "SUPABASE_URL")!.value = "https://different-project-ref.supabase.co";
  const wrongProject = evaluateClientCloudConfigEvidence(service, bucket, expected, "2026-10-09T22:03:00Z", inventory);
  expect(wrongProject.failures).toContain("runtime_supabase_project_mismatch");
});

test("cloud receipt requires a fresh inventory bound to the exact target", () => {
  const { service, bucket } = snapshots();
  const missing = evaluateClientCloudConfigEvidence(service, bucket, expected, new Date().toISOString());
  expect(missing.failures).toContain("storage_object_inventory_missing_or_invalid");
  const inventory = objectInventory();
  const mismatched = evaluateClientCloudConfigEvidence(service, bucket, { ...expected, bucket: "different-bucket" }, new Date().toISOString(), inventory);
  expect(mismatched.failures).toContain("storage_object_inventory_missing_or_invalid");
  const wrongDatabase = evaluateClientCloudConfigEvidence(service, bucket, { ...expected, supabaseProjectRef: "abcdefghijklmnopqrst" }, new Date().toISOString(), inventory);
  expect(wrongDatabase.failures).toContain("storage_object_inventory_missing_or_invalid");
  const receipt = evaluateClientCloudConfigEvidence(service, bucket, expected, new Date().toISOString(), inventory);
  expect(validClientCloudConfigEvidence(receipt, { ...receipt, artifactSnapshotSha256: "f".repeat(64) }, {
    cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef,
  })).toBe(false);
});

test("cloud receipt rejects an object inventory with a different recovery policy", () => {
  const { service, bucket } = snapshots();
  const changedInventory = { ...objectInventory(), recoveryDays: 14 };
  const receipt = evaluateClientCloudConfigEvidence(service, bucket, expected, new Date().toISOString(), changedInventory);
  expect(receipt.passed).toBe(false);
  expect(receipt.failures).toContain("storage_object_inventory_missing_or_invalid");
});

test("cloud receipt accepts gcloud integer-string durations without accepting shorter active retention", () => {
  const { service, bucket } = snapshots();
  Object.assign(bucket.softDeletePolicy, { retentionDurationSeconds: "604800" });
  Object.assign(bucket, { retentionPolicy: { retentionPeriod: "0" } });
  const receipt = evaluateClientCloudConfigEvidence(service, bucket, expected, new Date().toISOString(), objectInventory());
  expect(receipt).toMatchObject({ passed: true, failures: [] });
  bucket.lifecycle.rule[0].condition.age = 14;
  const shorter = evaluateClientCloudConfigEvidence(service, bucket, expected, new Date().toISOString(), objectInventory());
  expect(shorter.passed).toBe(false);
  expect(shorter.failures).toContain("exact_retention_delete_rule_missing");
  expect(shorter.failures).not.toContain("recovery_window_not_seven_days");
});
