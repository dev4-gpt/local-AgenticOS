#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const projectDir = valueAfter("--project-dir") || "product-experience";
const failures = [];
const warnings = [];
const required = [
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "CLIENT_LOGIN_ENABLED",
  "RESEND_API_KEY", "PUBLIC_EMAIL_FROM",
  "PUBLIC_APP_URL", "PUBLIC_SITE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SETUP_PRICE_ID", "STRIPE_PLATFORM_PRICE_ID", "STRIPE_CREDIT_PRICE_ID", "STRIPE_MODE",
  "CONTROL_PLANE_OPERATOR_SECRET", "CONTROL_PLANE_WORKER_TOKEN", "CONTROL_PLANE_PROVISIONER_URL",
  "CONTROL_PLANE_CALLBACK_URL", "GCP_PROVISIONER_URL", "GCP_ALLOWED_PROJECT", "GCP_ALLOWED_REGION",
  "GCP_PROJECT_NUMBER", "GCP_WORKLOAD_IDENTITY_POOL_ID", "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  "GCP_CONTROL_PLANE_INVOKER_SERVICE_ACCOUNT", "LEAD_NOTIFICATION_FROM", "LEAD_NOTIFICATION_TO",
  "TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "OPENROUTER_MANAGED_SECRET_RESOURCE", "OPENROUTER_MANAGED_GATEWAY_URL",
  "OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID", "OPENROUTER_MANAGED_PRICING_JSON",
];
const sensitive = new Set([
  "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "CONTROL_PLANE_OPERATOR_SECRET", "CONTROL_PLANE_WORKER_TOKEN", "TURNSTILE_SECRET_KEY",
]);
const allowedPublicKeys = new Set(["NEXT_PUBLIC_TURNSTILE_SITE_KEY"]);

const result = spawnSync("vercel", ["env", "ls", "production", "--json", "--no-color", "--cwd", projectDir], {
  encoding: "utf8",
  maxBuffer: 5_000_000,
  timeout: 30_000,
});
if (result.error || result.status !== 0) unavailable("Vercel environment listing failed");
if (!result.stdout?.trim()) unavailable("Vercel environment listing returned no data");

let rows;
try {
  const parsed = JSON.parse(result.stdout);
  rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.envs) ? parsed.envs : parsed?.variables);
} catch {
  unavailable("Vercel environment listing did not return valid JSON");
}
if (!Array.isArray(rows)) unavailable("Vercel environment listing returned an unsupported shape");

const metadata = rows
  .map((row) => ({ name: row?.key || row?.name || "", type: row?.type || "", targets: row?.target || row?.environments || [] }))
  .filter((row) => row.name);
const byName = new Map(metadata.map((row) => [row.name, row]));

for (const name of required) {
  const row = byName.get(name);
  expect(Boolean(row), `missing Vercel Production variable: ${name}`);
  if (row) expect(row.targets.includes("production"), `${name} is not scoped to Production`);
}
for (const name of sensitive) {
  const row = byName.get(name);
  if (row) expect(row.type === "sensitive", `${name} must use Vercel's Sensitive type`);
}
const publicSecretLike = metadata
  .map((row) => row.name)
  .filter((name) => /^NEXT_PUBLIC_.*(SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN|API_KEY)$/i.test(name) && !allowedPublicKeys.has(name));
expect(publicSecretLike.length === 0, `forbidden secret-like NEXT_PUBLIC variables: ${publicSecretLike.join(", ")}`);

const managedPricingPresent = byName.has("OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID") && byName.has("OPENROUTER_MANAGED_PRICING_JSON");
if (!managedPricingPresent) warnings.push("Managed OpenRouter remains fail-closed until a reviewed pricing snapshot and matching JSON are added and production is redeployed");

console.log(JSON.stringify({
  ok: failures.length === 0,
  inventoryStatus: "complete",
  projectDir,
  productionVariableCount: metadata.filter((row) => row.targets.includes("production")).length,
  present: Object.fromEntries(required.map((name) => [name, byName.has(name)])),
  sensitiveTypes: Object.fromEntries([...sensitive].map((name) => [name, byName.get(name)?.type || null])),
  failures,
  warnings,
}, null, 2));
if (failures.length) process.exit(1);

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function unavailable(message) {
  console.log(JSON.stringify({
    ok: false,
    inventoryStatus: "unavailable",
    projectDir,
    productionVariableCount: null,
    present: Object.fromEntries(required.map((name) => [name, null])),
    sensitiveTypes: Object.fromEntries([...sensitive].map((name) => [name, null])),
    failures: [message],
    warnings: [],
  }, null, 2));
  process.exit(1);
}

function valueAfter(flag) {
  const direct = args.find((item) => item.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1).trim() || null;
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
}
