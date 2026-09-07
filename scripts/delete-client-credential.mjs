#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const project = required("--project");
const clientSlug = required("--client-slug");
const providerKey = required("--provider").trim().toUpperCase();
const targetSecret = required("--target-secret");
const apply = args.includes("--apply");
const confirmDelete = args.includes("--confirm-delete");
const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!/^[a-z][a-z0-9-]{2,40}$/.test(clientSlug)) fail("Invalid client slug");
if (!/^[A-Z][A-Z0-9_]{2,120}$/.test(providerKey)) fail("Invalid provider key");
if (!targetSecret.startsWith(`veloce-${clientSlug}-`)) fail("Target secret must be inside the client namespace");
if (targetSecret.includes("credential-inbox")) fail("Refusing to delete the shared credential inbox secret");
if (!supabaseUrl || !serviceKey) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in the operator shell");
if (apply && !confirmDelete) fail("Refusing --apply without --confirm-delete");

const connection = await readConnection();
if (!connection) fail(`No connection record found for ${providerKey} on ${clientSlug}`);
if (connection.secret_resource && !connection.secret_resource.endsWith(`/secrets/${targetSecret}`)) {
  fail(`Recorded secret_resource (${connection.secret_resource}) does not match --target-secret; verify before proceeding`);
}

console.log(`${apply ? "Deleting" : "Would delete"} credential ${providerKey} for ${clientSlug}`);
console.log(`Target secret: ${targetSecret}`);
console.log(`Connection status before deletion: ${connection.status}`);
console.log("No secret value is printed.");

if (!apply) {
  console.log("Dry run only. Add --apply --confirm-delete to destroy the secret and remove the connection record.");
  process.exit(0);
}

const result = spawnSync("gcloud", ["secrets", "delete", targetSecret, "--project", project, "--quiet"], { stdio: "inherit" });
if (result.status !== 0) fail("Could not delete the target secret");

const removed = await deleteConnection();
if (!removed) fail("Secret deleted, but the connection record could not be removed -- reconcile client_provider_connections manually");

console.log("Credential deleted: secret destroyed and connection record removed.");

async function readConnection() {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/client_provider_connections?tenant_slug=eq.${encodeURIComponent(clientSlug)}&provider_key=eq.${encodeURIComponent(providerKey)}&select=status,secret_resource&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, cache: "no-store" },
  ).catch(() => null);
  if (!response?.ok) fail(`Could not read the connection record (${response?.status ?? "no response"})`);
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function deleteConnection() {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/client_provider_connections?tenant_slug=eq.${encodeURIComponent(clientSlug)}&provider_key=eq.${encodeURIComponent(providerKey)}`,
    { method: "DELETE", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "return=minimal" }, cache: "no-store" },
  ).catch(() => null);
  return response?.ok === true;
}

function required(flag) {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : null;
  if (!value) fail(`${flag} is required`);
  return value.trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
