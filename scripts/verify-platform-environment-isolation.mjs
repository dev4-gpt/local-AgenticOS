#!/usr/bin/env node
// Live probe for platform_deploy_runs (service_role-only, not RLS/tenant
// scoped like client_provisioning_runs). The risk here isn't a missing RLS
// policy — it's a query missing an `environment` filter, or environment
// identity being trusted from a client-supplied field instead of derived
// from which operator secret authenticated the write. This inserts one
// synthetic row per environment, asserts an environment-filtered read never
// crosses into the other environment's row, asserts the
// (environment, workflow, idempotency_key) constraint lets staging and
// production reuse the same key for the same digest without colliding, then
// cleans up both rows.
import { randomUUID } from "node:crypto";

const failures = [];

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const stagingId = randomUUID();
const productionId = randomUUID();
const sharedIdempotencyKey = `verify-platform-isolation-${randomUUID()}`;
const syntheticCommit = "0".repeat(40);

let insertedStaging = false;
let insertedProduction = false;

try {
  const stagingInsert = await insert(row("staging", stagingId));
  expect(stagingInsert.ok, `staging synthetic row insert failed (${stagingInsert.status})`);
  insertedStaging = stagingInsert.ok;

  const productionInsert = await insert(row("production", productionId));
  expect(productionInsert.ok, `production synthetic row insert failed (${productionInsert.status}) - same idempotency_key as the staging row must not collide across environments`);
  insertedProduction = productionInsert.ok;

  const stagingRead = await selectByEnvironment("staging");
  expect(stagingRead.ok, "staging-filtered read failed - inconclusive, re-run");
  expect(!stagingRead.ok || !stagingRead.rows.some((entry) => entry.id === productionId), "staging-filtered query returned the production row - environment isolation crossed");
  expect(!stagingRead.ok || stagingRead.rows.some((entry) => entry.id === stagingId), "staging-filtered query did not return the staging row - inconclusive, re-run");

  const productionRead = await selectByEnvironment("production");
  expect(productionRead.ok, "production-filtered read failed - inconclusive, re-run");
  expect(!productionRead.ok || !productionRead.rows.some((entry) => entry.id === stagingId), "production-filtered query returned the staging row - environment isolation crossed");
  expect(!productionRead.ok || productionRead.rows.some((entry) => entry.id === productionId), "production-filtered query did not return the production row - inconclusive, re-run");
} finally {
  if (insertedStaging) await del(stagingId);
  if (insertedProduction) await del(productionId);
}

if (failures.length) {
  console.error("Platform environment isolation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Platform environment isolation verification passed: staging and production rows stayed isolated, and the (environment, workflow, idempotency_key) constraint allowed the same key across environments.");

function row(environment, id) {
  return {
    id,
    environment,
    workflow: "control-plane-image-deploy",
    git_commit: syntheticCommit,
    triggered_by: "ci-auto",
    idempotency_key: sharedIdempotencyKey,
    status: "queued",
  };
}

async function insert(record) {
  const response = await supabaseRequest("platform_deploy_runs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(record) });
  return { ok: response.ok, status: response.status };
}

async function selectByEnvironment(environment) {
  const response = await supabaseRequest(`platform_deploy_runs?select=id,environment&idempotency_key=eq.${encodeURIComponent(sharedIdempotencyKey)}&environment=eq.${environment}`, { method: "GET" }).catch(() => null);
  const rows = await response?.json().catch(() => []) ?? [];
  return { ok: response?.ok === true, status: response?.status ?? 503, rows: Array.isArray(rows) ? rows : [] };
}

async function del(id) {
  await supabaseRequest(`platform_deploy_runs?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => null);
}

async function supabaseRequest(pathname, options = {}) {
  const url = process.env.SUPABASE_URL.replace(/\/$/, "");
  return fetch(`${url}/rest/v1/${pathname}`, {
    ...options,
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(options.headers || {}) },
    cache: "no-store",
  });
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
