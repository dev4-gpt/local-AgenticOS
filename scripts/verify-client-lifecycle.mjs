#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = new URL("..", import.meta.url).pathname;
const lifecycle = await readFile(join(root, "scripts/client-lifecycle.mjs"), "utf8");
const provisioner = await readFile(join(root, "scripts/provision-gcp-client.mjs"), "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(lifecycle.includes("schemaVersion: 2"), "lifecycle exports must use the credential-safe schema version");
expect(lifecycle.includes("const exportColumns = Object.freeze"), "lifecycle exports must use an explicit column allowlist");
expect(!lifecycle.includes("select=*"), "lifecycle exports must never use select=*");
expect(lifecycle.includes("client_tenants: \"slug,name,status,retention_days,created_at,updated_at\""), "tenant exports must exclude worker_token_hash");
expect(lifecycle.includes("worker_token_hash"), "lifecycle verifier must reject worker token hashes if supplied by an old snapshot");
expect(lifecycle.includes("pickExportColumns(table, row)"), "restore must use the same approved column boundary as export");
expect(lifecycle.includes("secretLikeValue") && lifecycle.includes("assertSnapshotSafe"), "lifecycle must reject secret-like values in metadata backups");
expect(lifecycle.includes("confirm-restore") && lifecycle.includes("confirm-offboard"), "destructive lifecycle actions must require explicit confirmation");
expect(lifecycle.includes("--delete-queue") && lifecycle.includes("--destroy-secrets"), "offboarding must require queue and secret deletion consent");
expect(lifecycle.includes("deleteRuntimeAlerts") && lifecycle.includes("listSecretNames"), "offboarding must remove client alert and secret resources");
expect(provisioner.includes("storageLifecycleFile") && provisioner.includes("matchesPrefix: [`${slug}/`]") && provisioner.includes('action: { type: "Delete" }'), "GCP provisioner must apply tenant-prefixed Cloud Storage retention");
expect(provisioner.includes("normalizeRetentionDays") && provisioner.includes("retentionDays"), "GCP provisioner must derive storage retention from the validated manifest");

const tempDir = await mkdtemp(join(tmpdir(), "veloce-client-lifecycle-"));
const safeSnapshot = join(tempDir, "safe.json");
const hashSnapshot = join(tempDir, "hash.json");
const secretSnapshot = join(tempDir, "secret.json");
const baseSnapshot = { schemaVersion: 2, slug: "test-client", exportedAt: new Date().toISOString(), tables: { client_tenants: [{ slug: "test-client", name: "Test Client", status: "active", retention_days: 30 }] } };
await writeFile(safeSnapshot, JSON.stringify(baseSnapshot), { mode: 0o600 });
await writeFile(hashSnapshot, JSON.stringify({ ...baseSnapshot, tables: { client_tenants: [{ ...baseSnapshot.tables.client_tenants[0], worker_token_hash: "deadbeef" }] } }), { mode: 0o600 });
await writeFile(secretSnapshot, JSON.stringify({ ...baseSnapshot, tables: { client_runtime_requests: [{ tenant_slug: "test-client", details: "api_key=sk-test-secret-value" }] } }), { mode: 0o600 });

function runLifecycle(args) {
  return spawnSync(process.execPath, [join(root, "scripts/client-lifecycle.mjs"), ...args], {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only-placeholder" },
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
await rm(tempDir, { recursive: true, force: true });

if (failures.length) {
  console.error("Client lifecycle verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Client lifecycle verification passed.");
