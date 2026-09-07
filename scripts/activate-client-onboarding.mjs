#!/usr/bin/env node
// Calls /api/onboarding/activate to send the tenant's setup email once its
// deploy has reached smoke_testing. House style matches
// scripts/approve-client-manifest.mjs / scripts/deploy-client-manifest.mjs.
import process from "node:process";

const args = process.argv.slice(2);
const appUrl = (valueAfter("--url") || process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud").replace(/\/$/, "");
const onboardingId = required("--onboarding-id");
const secret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";

if (!/^https:\/\//i.test(appUrl)) fail("--url must use HTTPS");
if (!secret) fail("CONTROL_PLANE_OPERATOR_SECRET is required. After using read, run: export CONTROL_PLANE_OPERATOR_SECRET");

const response = await fetch(`${appUrl}/api/onboarding/activate`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-control-plane-secret": secret },
  body: JSON.stringify({ onboardingId }),
  signal: AbortSignal.timeout(15_000),
}).catch(() => null);
const body = await response?.json().catch(() => null);
if (!response?.ok || !body?.ok) {
  fail(`tenant activation was not accepted (${response?.status || "network"})${typeof body?.error === "string" ? `: ${body.error}` : ""}`);
}

console.log(`Tenant onboarding ${onboardingId.slice(0, 8)} activated; status ${body.status}.`);
console.log(`Setup email delivery: ${JSON.stringify(body.delivery)}`);
console.log("The operator secret and setup token were not printed.");

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
