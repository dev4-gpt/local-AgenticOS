import { expect, test } from "@playwright/test";
import { evaluateClientCloudConfigEvidence, validClientCloudConfigEvidence } from "../scripts/lib/client-cloud-config-evidence.mjs";

const digest = `sha256:${"a".repeat(64)}`;
const expected = {
  project: "agentos-mvp", region: "europe-west1", service: "agentos-internal-beta",
  bucket: "agentos-mvp-veloce-internal-beta", namespace: "internal-beta",
  supabaseProjectRef: "ppmoqjtmjtfxadsnejqc",
  revision: "agentos-internal-beta-00035-test", imageDigest: digest,
};
const origin = "https://agentos-internal-beta-vbimnfseva-ew.a.run.app";

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
        { name: "CLIENT_RETENTION_DAYS", value: "45" },
        { name: "CLIENT_ALLOWED_ROUTES", value: "/,/memory,/notebook" },
        { name: "CLIENT_ALLOWED_API_ROUTES", value: "/api/client-runtime/source-import,/api/client-runtime/build-identity" },
        { name: "CLIENT_ENABLED_CAPABILITIES", value: "tenant-data,artifacts" },
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
    cors_config: [{ origin: [origin], method: ["GET", "PUT"], responseHeader: ["Content-Type", "ETag"] }],
    lifecycle_config: { rule: [{ action: { type: "Delete" }, condition: { age: 45, matchesPrefix: [`${expected.namespace}/`] } }] },
    soft_delete_policy: { retentionDurationSeconds: 0 },
  };
  return { service, bucket };
}

test("cloud receipt binds live service, bucket, origin, and deployment without leaking env values", () => {
  const { service, bucket } = snapshots();
  const receipt = evaluateClientCloudConfigEvidence(service, bucket, expected, "2026-10-09T22:00:00Z");
  expect(receipt).toMatchObject({ passed: true, failures: [], origin, revision: expected.revision, imageDigest: digest });
  expect(validClientCloudConfigEvidence(receipt, receipt, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(true);
  expect(validClientCloudConfigEvidence(receipt, null, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef }, { requireCurrent: true })).toBe(false);
  expect(JSON.stringify(receipt)).not.toContain("PRIVATE_TEST_VALUE");
  expect(validClientCloudConfigEvidence(receipt, receipt, { cloudRunRevision: "different-revision", imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(false);
  expect(validClientCloudConfigEvidence(receipt, receipt, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: "different-project-ref" })).toBe(false);
});

test("cloud receipt rejects a changed bucket, wrong runtime bucket, and snapshot drift", () => {
  const { service, bucket } = snapshots();
  const original = evaluateClientCloudConfigEvidence(service, bucket, expected, "2026-10-09T22:00:00Z");
  bucket.lifecycle_config.rule[0].condition.age = 1;
  const changed = evaluateClientCloudConfigEvidence(service, bucket, expected, "2026-10-09T22:01:00Z");
  expect(changed.failures).toContain("exact_retention_delete_rule_missing");
  expect(validClientCloudConfigEvidence(original, changed, { cloudRunRevision: expected.revision, imageDigest: digest, supabaseProjectRef: expected.supabaseProjectRef })).toBe(false);
  service.spec.template.spec.containers[0].env.find((entry) => entry.name === "CLIENT_STORAGE_BUCKET")!.value = "other-bucket";
  const wrongBucket = evaluateClientCloudConfigEvidence(service, bucket, expected, "2026-10-09T22:02:00Z");
  expect(wrongBucket.failures).toContain("runtime_storage_bucket_mismatch");
  service.spec.template.spec.containers[0].env.find((entry) => entry.name === "SUPABASE_URL")!.value = "https://different-project-ref.supabase.co";
  const wrongProject = evaluateClientCloudConfigEvidence(service, bucket, expected, "2026-10-09T22:03:00Z");
  expect(wrongProject.failures).toContain("runtime_supabase_project_mismatch");
});
