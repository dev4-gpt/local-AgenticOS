#!/usr/bin/env node
import process from "node:process";

const args = process.argv.slice(2);
const appUrl = (valueAfter("--url") || process.env.PUBLIC_APP_URL || "https://app.veloceos.cloud").replace(/\/$/, "");
const requestId = required("--request-id");
const email = required("--email").toLowerCase();
const approvedBy = required("--approved-by");
const secret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";

if (!/^https:\/\//i.test(appUrl)) fail("--url must use HTTPS");
if (!/^\S+@\S+\.\S+$/.test(email)) fail("--email must be valid");
if (!secret) fail("CONTROL_PLANE_OPERATOR_SECRET is required and must not be placed in shell history");

const approval = await requestJson("/api/onboarding/scope/approve", {
  method: "POST",
  headers: { "x-control-plane-secret": secret },
  body: { requestId, approvedBy, stripeTestFixture: true },
});
if (!approval.ok || approval.body?.quote?.testFixture !== true || approval.body.quote.initialTotalCents !== 100) {
  fail(`test fixture approval was rejected (${approval.status || "network"}); confirm Stripe Test mode and the 50¢ + 50¢ fixture configuration`);
}

const checkout = await requestJson("/api/billing/checkout", {
  method: "POST",
  body: { requestId, email },
});
if (!checkout.ok || typeof checkout.body?.checkoutUrl !== "string" || !/^https:\/\/checkout\.stripe\.com\//.test(checkout.body.checkoutUrl)) {
  fail(`test checkout was not created (${checkout.status || "network"})`);
}

console.log(`Stripe Test fixture approved for ${requestId.slice(0, 8)}. Open this one checkout URL in the matching test user's browser:`);
console.log(checkout.body.checkoutUrl);
console.log("The operator secret, Stripe key, and payment details were not printed.");

async function requestJson(path, input) {
  const response = await fetch(`${appUrl}${path}`, {
    method: input.method,
    headers: { "content-type": "application/json", ...(input.headers || {}) },
    body: JSON.stringify(input.body),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return { ok: response?.ok === true, status: response?.status ?? 0, body: await response?.json().catch(() => null) };
}

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
