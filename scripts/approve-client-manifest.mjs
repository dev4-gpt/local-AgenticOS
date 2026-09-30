#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const appUrl = (valueAfter("--url") || process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud").replace(/\/$/, "");
const requestId = required("--request-id");
const manifestPath = required("--manifest");
const secret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";
const review = args.includes("--review");
const approve = args.includes("--approve");
if (review === approve) fail("Choose exactly one of --review or --approve");
const expectedHash = approve ? required("--expected-hash") : null;
if (expectedHash && !/^[a-f0-9]{64}$/.test(expectedHash)) fail("--expected-hash must be the SHA-256 from --review");

if (!/^https:\/\//i.test(appUrl)) fail("--url must use HTTPS");
if (!secret) fail("CONTROL_PLANE_OPERATOR_SECRET is required. After using read, run: export CONTROL_PLANE_OPERATOR_SECRET");

const absoluteManifestPath = path.resolve(process.cwd(), manifestPath);
if (!existsSync(absoluteManifestPath)) fail(`Manifest not found: ${absoluteManifestPath}`);
const validation = spawnSync(process.execPath, [path.resolve(process.cwd(), "scripts/validate-client-manifest.mjs"), absoluteManifestPath], {
  cwd: process.cwd(),
  encoding: "utf8",
});
if (validation.status !== 0) fail(validation.stderr.trim() || validation.stdout.trim() || "Manifest validation failed");

const manifest = JSON.parse(readFileSync(absoluteManifestPath, "utf8"));
if (manifest.approved !== true || manifest.acknowledgeClientSafeRuntime !== true) {
  fail("Manifest must record explicit approval and client-safe runtime acknowledgement");
}
if (manifest.providerCallsEnabled === true) fail("Disposable acceptance manifests must keep provider calls disabled");
if (manifest.provisioning?.phase === "deploy") fail("Use this command only for the prepare stage");

const response = await fetch(`${appUrl}/api/onboarding/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-control-plane-secret": secret },
  body: JSON.stringify({ action: review ? "preview" : "approve", requestId, manifestVersion: "disposable-tenant-v1", manifestHash: expectedHash, manifest }),
  signal: AbortSignal.timeout(15_000),
}).catch(() => null);
const body = await response?.json().catch(() => null);
if (review) {
  if (!response?.ok || !body?.ok || typeof body.manifestHash !== "string" || !body.manifest || typeof body.manifest !== "object") {
    fail(`final manifest review failed (${response?.status || "network"})${typeof body?.error === "string" ? `: ${body.error}` : ""}`);
  }
  console.log(JSON.stringify(body.manifest, null, 2));
  console.log(`Final manifest SHA-256: ${body.manifestHash}`);
  console.log("Review this scope-adjusted manifest before running --approve with --expected-hash.");
  process.exit(0);
}
if (!response?.ok || !body?.ok || typeof body.runId !== "string") {
  fail(`tenant prepare was not accepted (${response?.status || "network"})${typeof body?.error === "string" ? `: ${body.error}` : ""}`);
}
if (body.dispatched !== true && body.idempotent !== true) {
  fail(`tenant prepare was not queued (${response?.status || "network"})`);
}
if (body.idempotent === true) {
  console.log(`Tenant prepare already recorded for ${requestId.slice(0, 8)}; run ${body.runId} (${body.status || "unknown"}).`);
  console.log("The approved manifest was reconciled without dispatching another prepare run.");
  console.log("The operator secret, runtime token, and secret values were not printed.");
  process.exit(0);
}

console.log(`Tenant prepare queued for ${requestId.slice(0, 8)}; run ${body.runId}.`);
console.log("Add the tenant-scoped Supabase anon-key secret version only after the prepare callback records the derived Secret Manager name.");
console.log("The operator secret, runtime token, and secret values were not printed.");

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
}

function required(flag) {
  const value = valueAfter(flag);
  if (!value) fail(`${flag} is required`);
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
