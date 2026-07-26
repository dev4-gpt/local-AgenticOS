#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const file = process.argv[2];
if (!file) fail("Usage: node scripts/validate-client-manifest.mjs path/to/client.json");
const absolute = path.resolve(process.cwd(), file);
if (!existsSync(absolute)) fail(`Manifest not found: ${absolute}`);
const raw = readFileSync(absolute, "utf8");
const manifest = JSON.parse(raw);

for (const field of ["clientSlug", "clientName", "gcp", "access", "enabledCapabilities", "providerAllowlist", "budget", "storage", "retention"]) {
  if (manifest[field] === undefined) fail(`Missing manifest field: ${field}`);
}

const env = manifest.runtimeEnv ?? {};
for (const [key, expected] of [
  ["VELOCE_CLIENT_EDITION", "1"],
  ["AGENTIC_OS_DISABLE_LOCAL_CLI", "1"],
  ["AGENTIC_OS_DISABLE_LOCAL_FILES", "1"],
  ["AGENTIC_OS_REQUIRE_APPROVALS", "1"],
  ["CLIENT_RUNTIME_ENFORCE_AUTH", "1"],
]) if (String(env[key] ?? "") !== expected) fail(`${key} must be ${expected}`);

if (!Array.isArray(manifest.access.allowedUserEmails) || manifest.access.allowedUserEmails.length === 0) fail("At least one approved runtime email is required");
if (!Array.isArray(manifest.enabledCapabilities) || manifest.enabledCapabilities.length === 0) fail("At least one explicitly reviewed capability is required");
if (Number(manifest.gcp.minInstances) !== 0) fail("minInstances must be explicitly set to 0 for the low-cost default");
if (Number(manifest.gcp.maxInstances) < 1) fail("maxInstances must be at least 1");
if (Number(manifest.budget.warningThreshold) >= Number(manifest.budget.monthlyCap)) fail("warningThreshold must be below monthlyCap");
if (/sk-[A-Za-z0-9_-]{20,}|api[_ -]?key\s*[:=]|secret\s*[:=]|password\s*[:=]/i.test(raw)) fail("Manifest appears to contain a raw credential value");

console.log(`Client manifest validation passed: ${manifest.clientSlug}`);
function fail(message) { console.error(message); process.exit(1); }
