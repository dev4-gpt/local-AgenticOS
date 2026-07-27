#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const project = required("--project");
const slug = required("--slug");
const secret = valueAfter("--secret") || `worker-token`;
const supabaseUrl = (process.env.SUPABASE_URL || valueAfter("--supabase-url"))?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apply = args.includes("--apply");

if (!/^[a-z][a-z0-9-]{2,40}$/.test(slug)) fail("Invalid client slug");
if (!/^[a-z][a-z0-9_-]{1,120}$/.test(secret)) fail("Invalid worker secret name");
if (!supabaseUrl || !serviceKey) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in the operator shell");
if (!/^https:\/\//i.test(supabaseUrl)) fail("SUPABASE_URL must use HTTPS");

const secretName = `veloce-${slug}-${secret}`;
console.log(`Client worker token: ${slug}`);
console.log(`Secret: ${secretName}`);
console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
console.log("The token and its hash are never printed.");

if (!apply) {
  console.log("Dry run only. Add --apply to rotate the worker token and update the tenant hash.");
  process.exit(0);
}

const describe = spawnSync("gcloud", ["secrets", "describe", secretName, "--project", project], { stdio: "ignore" });
if (describe.status !== 0) fail(`Secret ${secretName} does not exist. Run the client prepare phase first.`);

const token = randomBytes(32).toString("base64url");
const secretVersion = spawnSync("gcloud", ["secrets", "versions", "add", secretName, "--project", project, "--data-file=-"], {
  input: token,
  stdio: ["pipe", "inherit", "inherit"],
});
if (secretVersion.status !== 0) fail("Could not add the worker token version");

const hash = createHash("sha256").update(token).digest("hex");
const response = await fetch(`${supabaseUrl}/rest/v1/client_tenants?slug=eq.${encodeURIComponent(slug)}`, {
  method: "PATCH",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({ worker_token_hash: hash, updated_at: new Date().toISOString() }),
  cache: "no-store",
}).catch(() => null);
if (!response?.ok) fail(`Could not update the tenant worker hash (${response?.status ?? "no response"})`);
const rows = await response.json().catch(() => []);
if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.slug !== slug) fail("Tenant worker hash update was not confirmed");

console.log("Worker token rotation complete. Redeploy the approved image so Cloud Run refreshes the latest secret version.");

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function required(flag) {
  const value = valueAfter(flag);
  if (!value) fail(`${flag} is required`);
  return value.trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
