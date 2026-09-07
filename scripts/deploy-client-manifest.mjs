#!/usr/bin/env node
import process from "node:process";

const args = process.argv.slice(2);
const appUrl = (valueAfter("--url") || process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud").replace(/\/$/, "");
const requestId = required("--request-id");
const secret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";

if (!/^https:\/\//i.test(appUrl)) fail("--url must use HTTPS");
if (!secret) fail("CONTROL_PLANE_OPERATOR_SECRET is required. After using read, run: export CONTROL_PLANE_OPERATOR_SECRET");

const response = await fetch(`${appUrl}/api/onboarding/deploy`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-control-plane-secret": secret },
  body: JSON.stringify({ requestId }),
  signal: AbortSignal.timeout(15_000),
}).catch(() => null);
const body = await response?.json().catch(() => null);
if (!response?.ok || !body?.ok || typeof body.runId !== "string") {
  fail(`tenant deploy was not accepted (${response?.status || "network"})${typeof body?.error === "string" ? `: ${body.error}` : ""}`);
}
if (body.dispatched !== true && body.idempotent !== true) {
  fail(`tenant deploy was not queued (${response?.status || "network"}); confirm prepare, Secret Manager version, and private adapter health`);
}
if (body.idempotent === true) {
  console.log(`Tenant deploy already recorded for ${requestId.slice(0, 8)}; run ${body.runId} (${body.status || "unknown"}).`);
  console.log("The operator secret, runtime token, and secret values were not printed.");
  process.exit(0);
}

console.log(`Tenant deploy queued for ${requestId.slice(0, 8)}; run ${body.runId}.`);
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
