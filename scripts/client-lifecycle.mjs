#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const mode = valueAfter("--mode") || "export";
const apply = args.includes("--apply");
const slug = required(valueAfter("--slug"), "--slug");
const configPath = valueAfter("--config");
const outputPath = path.resolve(process.cwd(), valueAfter("--out") || `.private-client-kits/exports/${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const inputPath = valueAfter("--input");
const objectsPath = valueAfter("--objects");
const project = valueAfter("--project") || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const bucket = valueAfter("--bucket");
const namespace = valueAfter("--namespace") || slug;
const includeObjects = args.includes("--include-objects");
const confirmRestore = args.includes("--confirm-restore");
const destroySecrets = args.includes("--destroy-secrets");
const deleteService = args.includes("--delete-service");
const deleteBucket = args.includes("--delete-bucket");
const deleteQueue = args.includes("--delete-queue");

if (!["export", "restore", "offboard"].includes(mode)) fail("--mode must be export, restore, or offboard");
if (mode === "restore" && !inputPath) fail("--input is required for restore");
if (mode !== "restore" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for export/offboard");
if ((mode === "offboard" || mode === "restore") && !process.env.SUPABASE_SERVICE_ROLE_KEY) fail("SUPABASE_SERVICE_ROLE_KEY is required for operator lifecycle actions");
if (mode === "offboard" && apply && !args.includes("--confirm-offboard")) fail("Refusing offboard apply without --confirm-offboard");
if (mode === "offboard" && apply && !destroySecrets) fail("Refusing offboard apply without --destroy-secrets");
if (mode === "offboard" && apply && !deleteQueue) fail("Refusing offboard apply without --delete-queue");
if (mode === "offboard" && apply && !project) fail("--project is required for offboard apply");
if (mode === "restore" && apply && !confirmRestore) fail("Refusing restore apply without --confirm-restore");

const manifest = configPath ? JSON.parse(await readFile(path.resolve(process.cwd(), configPath), "utf8")) : {};
const gcp = manifest.gcp && typeof manifest.gcp === "object" ? manifest.gcp : {};
const resolvedBucket = bucket || gcp.storageBucket;
const resolvedNamespace = manifest.storage?.namespace || namespace;
const serviceName = gcp.serviceName || `veloce-${slug}`;

if ((mode === "offboard" || includeObjects) && !resolvedBucket) fail("--bucket or a manifest storageBucket is required for bucket lifecycle work");
if (mode === "restore" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for restore");
if (mode === "restore" && objectsPath && !resolvedBucket) fail("--objects restore requires --bucket or a manifest storageBucket");

const tables = [
  "client_tenants",
  "client_memberships",
  "client_runtime_requests",
  "client_runtime_audit_events",
  "client_runtime_jobs",
  "client_runtime_artifacts",
  "client_runtime_records",
  "client_runtime_budget_ledger",
  "client_runtime_delivery_actions",
];

if (mode === "export") {
  const snapshot = await exportSnapshot();
  await writeSnapshot(snapshot, outputPath);
  if (includeObjects) exportObjects(outputPath.replace(/\.json$/i, "-objects"));
  console.log(`Client export written: ${outputPath}`);
  process.exit(0);
}

if (mode === "restore") {
  const snapshot = JSON.parse(await readFile(path.resolve(process.cwd(), inputPath), "utf8"));
  validateSnapshot(snapshot);
  if (!apply) {
    console.log(`Dry run restore for ${snapshot.slug} from ${inputPath}`);
    console.log(`Tables: ${Object.keys(snapshot.tables).join(", ")}`);
    process.exit(0);
  }
  if (snapshot.tables.client_runtime_artifacts?.length && !objectsPath) {
    fail("Restore contains artifact metadata; pass --objects with the matching Cloud Storage backup");
  }
  await restoreSnapshot(snapshot);
  if (objectsPath) restoreObjects(objectsPath);
  console.log(`Client metadata restored: ${snapshot.slug}`);
  process.exit(0);
}

const snapshot = await exportSnapshot();
await writeSnapshot(snapshot, outputPath);
console.log(`Pre-offboarding export written: ${outputPath}`);
console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`Tenant: ${slug}`);
console.log(`Bucket: ${resolvedBucket}`);
console.log(`Secrets: veloce-${slug}-*`);
console.log(`Service: ${serviceName}`);
if (!apply) {
  console.log("Dry run only. Add --apply --confirm-offboard --destroy-secrets after reviewing the export.");
  process.exit(0);
}

await supabasePatch("client_tenants", `slug=eq.${encodeURIComponent(slug)}`, { status: "offboarding", updated_at: new Date().toISOString() });
if (bucketHasObjects()) runGcloud(["storage", "rm", "--recursive", `gs://${resolvedBucket}/${resolvedNamespace}/**`, "--quiet"]);
if (deleteBucket) runGcloud(["storage", "buckets", "delete", `gs://${resolvedBucket}`, "--project", project, "--quiet"]);
if (deleteQueue) deleteQueueIfPresent();
const secretNames = listSecretNames();
for (const name of secretNames) runGcloud(["secrets", "delete", name, "--project", project, "--quiet"]);
if (deleteService) runGcloud(["run", "services", "delete", serviceName, "--region", gcp.region || "asia-south1", "--project", project, "--quiet"]);
await supabaseDelete("client_tenants", `slug=eq.${encodeURIComponent(slug)}`);
console.log(`Client offboarding completed: ${slug}`);

async function exportSnapshot() {
  const result = { schemaVersion: 1, slug, exportedAt: new Date().toISOString(), tables: {} };
  for (const table of tables) result.tables[table] = await supabaseSelect(table, table === "client_tenants" ? `slug=eq.${encodeURIComponent(slug)}` : `tenant_slug=eq.${encodeURIComponent(slug)}`);
  return result;
}

async function restoreSnapshot(snapshot) {
  const ordered = ["client_tenants", "client_memberships", "client_runtime_requests", "client_runtime_audit_events", "client_runtime_jobs", "client_runtime_artifacts", "client_runtime_records", "client_runtime_budget_ledger", "client_runtime_delivery_actions"];
  for (const table of ordered) {
    const rows = Array.isArray(snapshot.tables[table]) ? snapshot.tables[table] : [];
    if (!rows.length) continue;
    const tenantRows = rows.filter((row) => table === "client_tenants" ? row.slug === slug : row.tenant_slug === slug);
    if (tenantRows.length !== rows.length) fail(`Restore contains rows outside requested tenant: ${table}`);
    await supabaseInsert(table, tenantRows);
  }
}

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.slug !== slug || !snapshot.tables || typeof snapshot.tables !== "object") fail("Invalid lifecycle snapshot or slug mismatch");
}

function restoreObjects(input) {
  const source = path.resolve(process.cwd(), input);
  if (!existsSync(source)) fail(`Object backup directory not found: ${source}`);
  if (!path.basename(source).startsWith(`${slug}-`)) fail("Object backup directory must begin with the requested client slug");
  const namespacedSource = existsSync(path.join(source, resolvedNamespace)) ? path.join(source, resolvedNamespace) : source;
  runGcloud(["storage", "cp", "--recursive", namespacedSource, `gs://${resolvedBucket}/${resolvedNamespace}`]);
  console.log(`Client objects restored from ${namespacedSource}`);
}

async function writeSnapshot(snapshot, filePath) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  await chmod(filePath, 0o600);
}

async function supabaseSelect(table, filter) {
  const response = await supabaseRequest(`${table}?${filter}&select=*`);
  if (!response.ok) fail(`Export failed for ${table} (${response.status})`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function supabaseInsert(table, rows) {
  const response = await supabaseRequest(table, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
  if (!response.ok) fail(`Restore failed for ${table} (${response.status})`);
}

async function supabasePatch(table, query, record) {
  const response = await supabaseRequest(`${table}?${query}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(record) });
  if (!response.ok) fail(`Supabase lifecycle update failed (${response.status})`);
}

async function supabaseDelete(table, query) {
  const response = await supabaseRequest(`${table}?${query}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  if (!response.ok) fail(`Supabase lifecycle delete failed (${response.status})`);
}

async function supabaseRequest(pathname, options = {}) {
  const url = process.env.SUPABASE_URL.replace(/\/$/, "");
  return fetch(`${url}/rest/v1/${pathname}`, {
    ...options,
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(options.headers || {}) },
    cache: "no-store",
  });
}

function exportObjects(destination) {
  spawnSync("mkdir", ["-p", destination], { stdio: "ignore" });
  spawnSync("chmod", ["700", destination], { stdio: "ignore" });
  runGcloud(["storage", "cp", "--recursive", `gs://${resolvedBucket}/${resolvedNamespace}`, destination]);
}

function bucketHasObjects() {
  const result = spawnSync("gcloud", ["storage", "ls", `gs://${resolvedBucket}/${resolvedNamespace}/**`], { encoding: "utf8" });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function deleteQueueIfPresent() {
  const queue = gcp.taskQueue || `veloce-${slug}`;
  const region = gcp.region || "asia-south1";
  const existing = spawnSync("gcloud", ["tasks", "queues", "describe", queue, "--location", region, "--project", project], { stdio: "ignore" });
  if (existing.status !== 0) {
    console.log(`Cloud Tasks queue not found; continuing: ${queue}`);
    return;
  }
  runGcloud(["tasks", "queues", "delete", queue, "--location", region, "--project", project, "--quiet"]);
}

function listSecretNames() {
  const result = spawnSync("gcloud", ["secrets", "list", "--project", project, `--filter=name~^veloce-${slug}-`, "--format=value(name)"], { encoding: "utf8" });
  if (result.status !== 0) fail("Unable to enumerate client secrets");
  return result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).map((value) => value.split("/").pop()).filter(Boolean);
}

function runGcloud(command) {
  console.log(`gcloud ${command[0]} ${command[1] || ""} [client-scoped action]`);
  const result = spawnSync("gcloud", command, { stdio: "inherit" });
  if (result.status !== 0) fail(`gcloud action failed: ${command[0]}`);
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function required(value, flag) {
  if (!value) fail(`${flag} is required`);
  return value.trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
