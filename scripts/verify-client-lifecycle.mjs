#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const lifecycle = await readFile(join(root, "scripts/client-lifecycle.mjs"), "utf8");
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

if (failures.length) {
  console.error("Client lifecycle verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Client lifecycle verification passed.");
