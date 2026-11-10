#!/usr/bin/env node
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { evaluateClientStorageObjectInventory } from "./lib/client-storage-object-inventory.mjs";
import { collectClientStorageArtifactSample } from "./lib/client-storage-artifact-inventory.mjs";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
};
const project = valueAfter("--project");
const bucket = valueAfter("--bucket");
const namespace = valueAfter("--namespace");
const account = valueAfter("--account");
const output = valueAfter("--output");
const supabaseProjectRef = valueAfter("--supabase-project-ref");
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project ?? "")
    || !/^[a-z0-9][a-z0-9._-]{2,221}$/.test(bucket ?? "")
    || !/^[a-z][a-z0-9-]{2,40}$/.test(namespace ?? "")
    || !/^[a-z0-9]{20}$/.test(supabaseProjectRef ?? "")
    || (account && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account))) {
  console.error("Pass valid --project, --bucket, --namespace, --supabase-project-ref, and optional --account values.");
  process.exit(2);
}

function runListing(mode) {
  const uri = `gs://${bucket}/${namespace}/`;
  const command = ["storage", "ls", "--json", "--recursive"];
  if (mode === "all_versions") command.push("--all-versions");
  else command.push("--soft-deleted", "--exhaustive");
  command.push(uri, `--project=${project}`);
  if (account) command.push(`--account=${account}`);
  const result = spawnSync("gcloud", command, { encoding: "utf8", timeout: 120_000, maxBuffer: 100_000_000 });
  if (result.status !== 0) {
    console.error(`Cloud Storage ${mode} listing failed${result.error ? `: ${result.error.message}` : "."}`);
    process.exit(1);
  }
  try {
    const parsed = JSON.parse(result.stdout);
    if (Array.isArray(parsed)) return { objects: parsed, raw: result.stdout };
  } catch {}
  try {
    const objects = result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    if (objects.every((item) => item && typeof item === "object")) return { objects, raw: result.stdout };
  } catch {}
  console.error(`Cloud Storage ${mode} listing returned an unsupported or incomplete JSON response.`);
  process.exit(1);
}

const sample = () => collectClientStorageArtifactSample({ url: process.env.SUPABASE_URL,
  token: process.env.SUPABASE_SERVICE_ROLE_KEY, namespace, projectRef: supabaseProjectRef });
let before;
try { before = await sample(); }
catch { console.error("Artifact inventory preflight failed; verify the exact Supabase target and read credentials."); process.exit(1); }
const listingStartedAt = new Date().toISOString();
const live = runListing("all_versions");
const deleted = runListing("soft_deleted_exhaustive");
const listingCompletedAt = new Date().toISOString();
let after;
try { after = await sample(); }
catch { console.error("Artifact inventory verification failed; no crosswalk receipt can be accepted."); process.exit(1); }
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const snapshot = {
  schemaVersion: 1,
  bucket,
  prefix: `${namespace}/`,
  checkedAt: new Date().toISOString(),
  listingStartedAt,
  listingCompletedAt,
  artifactInventory: { schemaVersion: 1, projectRef: supabaseProjectRef, namespace, before, after },
  liveListingComplete: true,
  softDeletedListingComplete: true,
  liveObjects: live.objects,
  softDeletedObjects: deleted.objects,
  source: {
    collector: "verify-client-storage-object-inventory-v1",
    project,
    account: account ?? null,
    liveListingMode: "all_versions",
    softDeletedListingMode: "soft_deleted_exhaustive",
    liveListingSha256: sha256(live.raw),
    softDeletedListingSha256: sha256(deleted.raw),
  },
};
const report = evaluateClientStorageObjectInventory(snapshot, { project, bucket, namespace, account, supabaseProjectRef, retentionDays: 28, recoveryDays: 7 });
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output) writeFileSync(output, serialized, { flag: "wx", mode: 0o600 });
else process.stdout.write(serialized);
if (!report.ok) process.exitCode = 1;
