#!/usr/bin/env node
// Policy-as-code release gate: provider budget + approved-egress policy,
// applied to every checked-in client manifest automatically. Reuses
// client-provider-policy.mjs's validateProviderActivation /
// validateResearchWorkerConfig -- the same functions validate-client-manifest.mjs
// already applies by hand, one manifest at a time, during onboarding -- so
// this does not invent a second policy definition.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  normalizeCapabilityProviderAllowlist, normalizeHostAllowlist, normalizeModelPricing,
  validateProviderActivation, validateResearchWorkerConfig,
} from "./client-provider-policy.mjs";

const root = new URL("..", import.meta.url).pathname;
const blueprintsDir = join(root, "client-blueprints");
const failures = [];
let manifestsChecked = 0;

for (const path of await walk(blueprintsDir)) {
  if (!path.endsWith(".json")) continue;
  let manifest;
  try { manifest = JSON.parse(await readFile(path, "utf8")); } catch { continue; }
  if (!manifest || typeof manifest.clientSlug !== "string") continue; // not a client manifest (e.g. the campaign JSON)
  manifestsChecked++;
  const label = relative(root, path);
  const fail = (message) => failures.push(`${label}: ${message}`);

  const models = Array.isArray(manifest.modelAllowlist) ? manifest.modelAllowlist.map(String) : [];
  const secretEnvRaw = manifest.secretEnv ?? manifest.secretRefs ?? {};
  const secretNames = Array.isArray(secretEnvRaw)
    ? secretEnvRaw.map((v) => String(v).trim().toUpperCase().replace(/-/g, "_"))
    : secretEnvRaw && typeof secretEnvRaw === "object" ? Object.keys(secretEnvRaw).map((k) => k.trim().toUpperCase()) : [];

  if (manifest.budget && typeof manifest.budget === "object") {
    expect_(Number(manifest.budget.warningThreshold) < Number(manifest.budget.monthlyCap), `${label}: budget.warningThreshold must be below budget.monthlyCap`);
  }
  validateResearchWorkerConfig({
    value: manifest.researchWorkerConfig, secretNames,
    providerAllowlist: Array.isArray(manifest.providerAllowlist) ? manifest.providerAllowlist : [],
    fail,
  });
  validateProviderActivation({
    enabled: manifest.providerCallsEnabled === true,
    providerAllowlist: Array.isArray(manifest.providerAllowlist) ? manifest.providerAllowlist.map((v) => String(v).trim().toUpperCase()) : [],
    secretNames,
    modelAllowlist: models,
    providerModelAllowlist: manifest.providerModelAllowlist ?? {},
    modelPricing: normalizeModelPricing(manifest.modelPricing),
    enabledCapabilities: Array.isArray(manifest.enabledCapabilities) ? manifest.enabledCapabilities.map(String) : [],
    capabilityProviderAllowlist: normalizeCapabilityProviderAllowlist(manifest.capabilityProviderAllowlist),
    researchProvider: manifest.researchProvider,
    seoAllowedHosts: normalizeHostAllowlist(manifest.seoAllowedHosts),
    deliveryAllowedHosts: normalizeHostAllowlist(manifest.deliveryAllowedHosts),
    fail,
  });
}
expect_(manifestsChecked > 0, `no client manifests found under ${relative(root, blueprintsDir)}`);

// Regression check: the manifest checks above only prove an allowlist was
// *declared* -- this proves the two places that actually fetch a
// tenant-supplied destination still enforce it before the request leaves.
const seoAdapter = await readFile(join(root, "src/lib/clientSeoAdapter.ts"), "utf8");
const deliveryAdapter = await readFile(join(root, "src/lib/clientDeliveryAdapter.ts"), "utf8");
expect_(seoAdapter.includes("CLIENT_SEO_ALLOWED_HOSTS"), "clientSeoAdapter must still enforce CLIENT_SEO_ALLOWED_HOSTS before fetching a tenant-supplied URL");
expect_(deliveryAdapter.includes("CLIENT_DELIVERY_ALLOWED_HOSTS"), "clientDeliveryAdapter must still enforce CLIENT_DELIVERY_ALLOWED_HOSTS before fetching a tenant-supplied destination");

console.log(JSON.stringify({ ok: failures.length === 0, manifestsChecked, failures }, null, 2));
if (failures.length) process.exit(1);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const paths = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(full)); else paths.push(full);
  }
  return paths;
}
function expect_(condition, message) { if (!condition) failures.push(message); }
