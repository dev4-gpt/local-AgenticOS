#!/usr/bin/env node
import process from "node:process";

const args = process.argv.slice(2);
const appUrl = required("--service-url").replace(/\/$/, "");
const tenantSlug = required("--tenant-slug");
const reservationId = required("--reservation-id");
const secret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";

if (!/^[-a-z0-9]{2,120}$/.test(tenantSlug)) fail("Invalid tenant slug");
if (!/^[0-9a-f-]{36}$/i.test(reservationId)) fail("Invalid reservation id");
if (!/^https:\/\//i.test(appUrl) || /localhost|127\.0\.0\.1/i.test(appUrl)) fail("--service-url must be the public HTTPS deployment URL");
if (!secret) fail("CONTROL_PLANE_OPERATOR_SECRET is required in the operator shell");

console.log(`Reconciling reservation ${reservationId} for ${tenantSlug} against OpenRouter's authoritative billed cost.`);

const response = await fetch(`${appUrl}/api/internal/managed-provider/openrouter`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-control-plane-secret": secret },
  body: JSON.stringify({ operation: "reconcile", tenantSlug, reservationId }),
  signal: AbortSignal.timeout(30_000),
}).catch(() => null);
const result = await response?.json().catch(() => null);
if (!response?.ok || !result?.ok) {
  fail(`Reconciliation request was not accepted (${response?.status ?? "network"})${typeof result?.error === "string" ? `: ${result.error}` : ""}`);
}

console.log(JSON.stringify(result, null, 2));
if (result.status === "drift") {
  console.log(`DRIFT DETECTED: recorded ${result.recordedMicros} micros, OpenRouter reports ${result.providerMicros} micros (tolerance ${result.toleranceMicros}).`);
  console.log(result.disabled ? "The managed route has been disabled." : "WARNING: drift detected but the managed-route disable did not persist -- disable it manually.");
  process.exit(1);
}
console.log(`Matched: recorded ${result.recordedMicros} micros, OpenRouter reports ${result.providerMicros} micros (tolerance ${result.toleranceMicros}).`);

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
