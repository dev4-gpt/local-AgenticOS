#!/usr/bin/env node
// Tells one adapter to erase its copies of notes the host has erased, and records its receipts (Veloce phase 2 slice 2c,
// ADR-014). Run it by hand or from a scheduler, after the events puller. It reads ONLY these environment variables and
// never prints any value:
//
//   SUPABASE_URL                     the client's Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY        its service role key (a Secret Manager reference in a deployed job)
//   CLIENT_SLUG                      the tenant
//   ADAPTER_ID                       which adapter to tell, for example creator-os
//   ADAPTER_ENDPOINTS                JSON map of adapter id -> https base URL
//   ADAPTER_TOKEN_SIGNING_KEY_PEM    the host's Ed25519 private key (ADR-012)
//   BACKGROUND_DEPLOYMENT_ID         optional: when set, only the recorded background owner runs (QM-6c)
//   ADAPTER_ALLOW_LOOPBACK           optional "true": allows plain http to 127.0.0.1 / localhost for local runs and tests
//
// It prints one JSON line with counts and reasons, never the text of a note. Exit 0 when every due note was acknowledged
// (or none was due); 1 when something failed, the database did not answer, or a note has been given up on after ten
// answers; 2 when it refused to start (a setting is missing).
//
// The host libraries are TypeScript. In a checkout this script transpiles them with the `typescript` package; in the job
// image they are already compiled (scripts/build-adapter-sync.mjs) and `typescript` is not installed (ADR-015).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHostLibLoader } from "./lib/hostLibLoader.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loadLib = createHostLibLoader(root);

function refuse(reason) {
  console.error(`REFUSED: ${reason}`);
  process.exit(2);
}
const need = (name) => {
  const value = (process.env[name] ?? "").trim();
  if (!value) refuse(`${name} is not set`);
  return value;
};

const tenantSlug = need("CLIENT_SLUG");
const adapterId = need("ADAPTER_ID");
const supabaseUrl = need("SUPABASE_URL").replace(/\/$/, "");
const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY");
const signingPem = need("ADAPTER_TOKEN_SIGNING_KEY_PEM");
const loopbackAllowed = process.env.ADAPTER_ALLOW_LOOPBACK === "true";

let endpoints;
try {
  endpoints = JSON.parse(need("ADAPTER_ENDPOINTS"));
} catch {
  refuse("ADAPTER_ENDPOINTS is not valid JSON");
}
if (endpoints === null || typeof endpoints !== "object" || Array.isArray(endpoints)) refuse("ADAPTER_ENDPOINTS must be a JSON object");
const baseUrl = endpoints[adapterId];
if (typeof baseUrl !== "string") refuse(`ADAPTER_ENDPOINTS has no address for ${adapterId}`);

const contracts = loadLib("adapterContracts");
if (!contracts.isValidTenantSlug(tenantSlug) || !contracts.isValidAdapterId(adapterId)) refuse("CLIENT_SLUG or ADAPTER_ID is not a valid id");
let supabase;
try {
  supabase = new URL(supabaseUrl);
} catch {
  refuse("SUPABASE_URL is not a url");
}
const supabaseLoopback = ["127.0.0.1", "localhost", "[::1]"].includes(supabase.hostname);
if (supabase.protocol !== "https:" && !(supabase.protocol === "http:" && loopbackAllowed && supabaseLoopback)) refuse("SUPABASE_URL must be https");

const tokens = loadLib("adapterTokens");
let privateKey;
try {
  privateKey = tokens.ed25519PrivateKey(signingPem);
} catch {
  refuse("ADAPTER_TOKEN_SIGNING_KEY_PEM is not an Ed25519 private key");
}

async function rpc(name, body) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response) return { ok: false, status: 0, value: null };
  const value = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, value };
}

const deploymentId = (process.env.BACKGROUND_DEPLOYMENT_ID ?? "").trim();
if (deploymentId) {
  const owner = await rpc("client_adapter_background_owner_may_run", { p_deployment_id: deploymentId });
  if (!owner.ok) {
    console.error(`Background owner check failed (${owner.status}); verify the background-owner migration`);
    process.exit(1);
  }
  if (owner.value !== true) {
    console.log(JSON.stringify({ event: "tombstones-dispatch-end", tenant: tenantSlug, adapterId, skipped: true, reason: "this deployment is not the background owner" }));
    process.exit(0);
  }
}

const { dispatchTombstones } = loadLib("adapterTombstoneDispatcher");
const mintToken = () => tokens.mintAdapterToken({ privateKey, tenant: tenantSlug, adapterId, scope: ["memory.tombstone"], ttlSeconds: 60 }).token;
let report;
try {
  report = await dispatchTombstones({ tenantSlug, adapterId, baseUrl, allowInsecureLoopback: loopbackAllowed }, { rpc, mintToken });
} catch (error) {
  // The message names a setting at most (for example "the adapter url must be https"); it never holds a value.
  console.error(`REFUSED: ${error instanceof Error ? error.message : "the dispatcher could not start"}`);
  process.exit(2);
}
console.log(JSON.stringify({ event: "tombstones-dispatch-end", tenant: tenantSlug, ...report }));
const needsALook = report.stopped !== null || Object.keys(report.failed).length > 0 || (report.summary?.gaveUp ?? 0) > 0;
process.exit(needsALook ? 1 : 0);
