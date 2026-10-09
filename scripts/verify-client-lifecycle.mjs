#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = new URL("..", import.meta.url).pathname;
const lifecycle = await readFile(join(root, "scripts/client-lifecycle.mjs"), "utf8");
const provisioner = await readFile(join(root, "scripts/provision-gcp-client.mjs"), "utf8");
const artifactRoute = await readFile(join(root, "src/app/api/client-runtime/artifacts/[id]/route.ts"), "utf8");
const lifecycleSql = await readFile(join(root, "product-experience/supabase-client-runtime-lifecycle.sql"), "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(lifecycle.includes("schemaVersion: 3"), "lifecycle exports must use the current credential-safe schema version");
expect(lifecycle.includes("const exportColumns = Object.freeze"), "lifecycle exports must use an explicit column allowlist");
expect(!lifecycle.includes("select=*"), "lifecycle exports must never use select=*");
expect(lifecycle.includes("client_tenants: \"slug,name,status,retention_days,created_at,updated_at\""), "tenant exports must exclude worker_token_hash");
expect(lifecycle.includes("worker_token_hash"), "lifecycle verifier must reject worker token hashes if supplied by an old snapshot");
expect(lifecycle.includes("pickExportColumns(table, row)"), "restore must use the same approved column boundary as export");
expect(lifecycle.includes("secretLikeValue") && lifecycle.includes("assertSnapshotSafe"), "lifecycle must reject secret-like values in metadata backups");
expect(lifecycle.includes("confirm-restore") && lifecycle.includes("confirm-offboard"), "destructive lifecycle actions must require explicit confirmation");
expect(lifecycle.includes("--delete-queue") && lifecycle.includes("--destroy-secrets"), "offboarding must require queue and secret deletion consent");
expect(lifecycle.includes("--notification-channel") && lifecycle.includes("--delete-notification-channel") && lifecycle.includes("Refusing to delete a notification channel that is not owned by this client"), "offboarding must explicitly and safely delete the client notification channel");
expect(lifecycle.includes("deleteRuntimeAlerts") && lifecycle.includes("listSecretNames"), "offboarding must remove client alert and secret resources");
expect(provisioner.includes("storageLifecycleFile") && provisioner.includes("matchesPrefix: [`${slug}/`]") && provisioner.includes('action: { type: "Delete" }'), "GCP provisioner must apply tenant-prefixed Cloud Storage retention");
expect(provisioner.includes("normalizeRetentionDays") && provisioner.includes("retentionDays"), "GCP provisioner must derive storage retention from the validated manifest");
expect(artifactRoute.includes("deleteClientStorageObject") && artifactRoute.includes('clientRpc("delete_client_runtime_artifact"'), "artifact deletion must remove the tenant object before metadata");
expect(lifecycleSql.includes("delete_client_runtime_artifact") && lifecycleSql.includes("grant execute on function public.delete_client_runtime_artifact(text, uuid)"), "artifact deletion must use an authenticated, tenant-scoped RPC");

const tempDir = await mkdtemp(join(tmpdir(), "veloce-client-lifecycle-"));
const safeSnapshot = join(tempDir, "safe.json");
const hashSnapshot = join(tempDir, "hash.json");
const secretSnapshot = join(tempDir, "secret.json");
const hermesSnapshot = join(tempDir, "hermes.json");
const pagedSnapshot = join(tempDir, "paged.json");
const baseSnapshot = { schemaVersion: 2, slug: "test-client", exportedAt: new Date().toISOString(), tables: { client_tenants: [{ slug: "test-client", name: "Test Client", status: "active", retention_days: 30 }] } };
await writeFile(safeSnapshot, JSON.stringify(baseSnapshot), { mode: 0o600 });
await writeFile(hashSnapshot, JSON.stringify({ ...baseSnapshot, tables: { client_tenants: [{ ...baseSnapshot.tables.client_tenants[0], worker_token_hash: "deadbeef" }] } }), { mode: 0o600 });
await writeFile(secretSnapshot, JSON.stringify({ ...baseSnapshot, tables: { client_runtime_requests: [{ tenant_slug: "test-client", details: "api_key=sk-test-secret-value" }] } }), { mode: 0o600 });
const hermesTables = [
  "client_hermes_content_factory_runs",
  "client_hermes_content_factory_stage_outputs",
  "client_hermes_content_factory_citations",
  "client_hermes_content_factory_quality_reports",
  "client_hermes_content_factory_approvals",
  "client_hermes_content_factory_deliveries",
];
await writeFile(hermesSnapshot, JSON.stringify({
  ...baseSnapshot,
  tables: {
    ...baseSnapshot.tables,
    ...Object.fromEntries(hermesTables.map((table) => [table, [{ id: table, tenant_slug: "test-client", run_id: "test-run" }]])),
  },
}), { mode: 0o600 });
await writeFile(pagedSnapshot, JSON.stringify({
  ...baseSnapshot,
  tables: {
    ...baseSnapshot.tables,
    client_runtime_audit_events: Array.from({ length: 501 }, (_, index) => ({ id: `event-${index}`, tenant_slug: "test-client", event_type: "restore.test" })),
  },
}), { mode: 0o600 });

function runLifecycle(args, preload, extraEnv = {}) {
  return spawnSync(process.execPath, [...(preload ? ["--import", join(root, "scripts/fixtures/client-lifecycle-fetch.mjs")] : []), join(root, "scripts/client-lifecycle.mjs"), ...args], {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only-placeholder", ...extraEnv },
  });
}

const safeRun = runLifecycle(["--mode", "restore", "--slug", "test-client", "--input", safeSnapshot]);
expect(safeRun.status === 0 && safeRun.stdout.includes("Dry run restore"), "safe lifecycle snapshot must pass a non-mutating restore drill");
const hashRun = runLifecycle(["--mode", "restore", "--slug", "test-client", "--input", hashSnapshot]);
expect(hashRun.status !== 0 && `${hashRun.stdout}\n${hashRun.stderr}`.includes("worker_token_hash"), "restore must reject snapshots containing a worker token verifier");
const secretRun = runLifecycle(["--mode", "restore", "--slug", "test-client", "--input", secretSnapshot]);
expect(secretRun.status !== 0 && `${secretRun.stdout}\n${secretRun.stderr}`.includes("secret-like"), "restore must reject secret-like snapshot values");
const confirmationRun = runLifecycle(["--mode", "restore", "--slug", "test-client", "--input", safeSnapshot, "--apply"]);
expect(confirmationRun.status !== 0 && `${confirmationRun.stdout}\n${confirmationRun.stderr}`.includes("confirm-restore"), "restore apply must require explicit confirmation before any network call");
const hermesRun = runLifecycle(["--mode", "restore", "--slug", "test-client", "--input", hermesSnapshot, "--apply", "--confirm-restore"], true);
const restoredTables = [...hermesRun.stdout.matchAll(/^MOCK_RESTORE_TABLE:(.+)$/gm)].map((match) => match[1]);
expect(hermesRun.status === 0, `mocked Hermes restore must succeed: ${hermesRun.stderr}`);
expect(JSON.stringify(restoredTables) === JSON.stringify(["client_tenants", ...hermesTables].map((table) => `${table}:1`)), "restore must insert all exported Hermes tables after the tenant and run parent");
const pagedRun = runLifecycle(["--mode", "restore", "--slug", "test-client", "--input", pagedSnapshot, "--apply", "--confirm-restore"], true);
const pagedTables = [...pagedRun.stdout.matchAll(/^MOCK_RESTORE_TABLE:(.+)$/gm)].map((match) => match[1]);
expect(pagedRun.status === 0, `mocked 501-row restore must succeed: ${pagedRun.stderr}`);
expect(JSON.stringify(pagedTables) === JSON.stringify(["client_tenants:1", "client_runtime_audit_events:500", "client_runtime_audit_events:1"]), "restore must split large tenant tables into bounded requests without dropping rows");
const offboardChannelRun = runLifecycle(["--mode", "offboard", "--slug", "test-client", "--bucket", "test-client-bucket", "--project", "test-project", "--apply", "--confirm-offboard", "--destroy-secrets", "--delete-queue"]);
expect(offboardChannelRun.status !== 0 && `${offboardChannelRun.stdout}\n${offboardChannelRun.stderr}`.includes("delete-notification-channel"), "offboard apply must require explicit notification-channel deletion consent");
const manifestPath = join(tempDir, "test-client-manifest.json");
const manifestBytes = JSON.stringify({ clientSlug: "test-client", gcp: { projectId: "test-project", storageBucket: "test-client-bucket" }, storage: { namespace: "test-client" } });
await writeFile(manifestPath, manifestBytes, { mode: 0o600 });
const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
const offboardArgs = ["--mode", "offboard", "--slug", "test-client", "--bucket", "test-client-bucket", "--project", "test-project", "--config", manifestPath, "--manifest-sha256", manifestSha256, "--out", join(tempDir, "pre-offboard.json"), "--apply", "--confirm-offboard", "--destroy-secrets", "--delete-queue", "--no-notification-channel"];
const alteredManifestRun = runLifecycle(offboardArgs.map((arg) => arg === manifestSha256 ? "0".repeat(64) : arg), true, { LIFECYCLE_MOCK_FINANCIAL: "inventory" });
expect(alteredManifestRun.status !== 0 && `${alteredManifestRun.stdout}\n${alteredManifestRun.stderr}`.includes("reviewed manifest SHA-256"), "offboard apply must bind to the reviewed manifest bytes");
const wrongBucketRun = runLifecycle(offboardArgs.map((arg) => arg === "test-client-bucket" ? "another-bucket" : arg), true, { LIFECYCLE_MOCK_FINANCIAL: "inventory" });
expect(wrongBucketRun.status !== 0 && `${wrongBucketRun.stdout}\n${wrongBucketRun.stderr}`.includes("does not match the reviewed tenant manifest"), "offboard apply must not redirect cleanup to another bucket");
const sharedBucketRun = runLifecycle([...offboardArgs, "--delete-bucket"], true, { LIFECYCLE_MOCK_FINANCIAL: "inventory" });
expect(sharedBucketRun.status !== 0 && `${sharedBucketRun.stdout}\n${sharedBucketRun.stderr}`.includes("canonical tenant-dedicated bucket"), "offboard apply must not delete a custom or shared bucket");
const financialRun = runLifecycle(offboardArgs, true, { LIFECYCLE_MOCK_FINANCIAL: "history" });
expect(financialRun.status !== 0 && `${financialRun.stdout}\n${financialRun.stderr}`.includes("financial history requiring reviewed retention"), "offboard must reject unarchived managed-credit history before changing tenant or cloud state");
const balanceRun = runLifecycle(offboardArgs, true, { LIFECYCLE_MOCK_FINANCIAL: "balance" });
expect(balanceRun.status !== 0 && `${balanceRun.stdout}\n${balanceRun.stderr}`.includes("nonzero or unverified credit balance"), "offboard must reject a remaining managed-credit balance");
const financialErrorRun = runLifecycle(offboardArgs, true, { LIFECYCLE_MOCK_FINANCIAL: "error" });
expect(financialErrorRun.status !== 0 && `${financialErrorRun.stdout}\n${financialErrorRun.stderr}`.includes("Cannot verify financial history"), "offboard must fail closed when managed-credit history cannot be read");
const missingTenantRun = runLifecycle(offboardArgs, true, { LIFECYCLE_MOCK_FINANCIAL: "missing" });
expect(missingTenantRun.status !== 0 && `${missingTenantRun.stdout}\n${missingTenantRun.stderr}`.includes("Client tenant not found"), "offboard must stop before cloud cleanup when the requested tenant is absent");
await rm(tempDir, { recursive: true, force: true });

if (failures.length) {
  console.error("Client lifecycle verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Client lifecycle verification passed.");
