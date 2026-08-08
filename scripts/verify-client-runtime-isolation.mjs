#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);
const baseUrl = required("--url").replace(/\/$/, "");
const tenantA = required("--tenant-a");
const tenantB = required("--tenant-b");
const anonKey = valueAfter("--anon-key") || process.env.SUPABASE_ANON_KEY;
const tokenA = token("--access-token-a", "--access-token-file-a");
const tokenB = token("--access-token-b", "--access-token-file-b");

if (tenantA === tenantB) fail("--tenant-a and --tenant-b must be different");
if (!/^https:\/\//i.test(baseUrl)) fail("--url must use HTTPS");
if (!anonKey) fail("--anon-key or SUPABASE_ANON_KEY is required");

const probes = [
  ["records", "client_runtime_records"],
  ["jobs", "client_runtime_jobs"],
  ["artifacts", "client_runtime_artifacts"],
  ["paperclip companies", "client_paperclip_companies"],
  ["paperclip projects", "client_paperclip_projects"],
  ["paperclip agents", "client_paperclip_agents"],
  ["paperclip issues", "client_paperclip_issues"],
  ["paperclip comments", "client_paperclip_comments"],
  ["paperclip runs", "client_paperclip_runs"],
  ["room conversations", "client_room_conversations"],
  ["room messages", "client_room_messages"],
  ["room rounds", "client_room_rounds"],
];
const failures = [];

for (const [label, table] of probes) {
  const [aOwn, aOther, bOwn, bOther] = await Promise.all([
    select(table, tenantA, tokenA),
    select(table, tenantB, tokenA),
    select(table, tenantB, tokenB),
    select(table, tenantA, tokenB),
  ]);
  expect(aOwn.ok, `${label}: tenant A own read failed (${aOwn.status})`);
  expect(bOwn.ok, `${label}: tenant B own read failed (${bOwn.status})`);
  expect(aOther.ok && aOther.rows.length === 0, `${label}: tenant A token crossed into tenant B`);
  expect(bOther.ok && bOther.rows.length === 0, `${label}: tenant B token crossed into tenant A`);
}

if (failures.length) {
  console.error("Client isolation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Client isolation verification passed for ${tenantA} and ${tenantB}. Tokens and row content were not printed.`);

async function select(table, tenant, token) {
  // Select tenant_slug rather than id: it is the one column every probed table
  // shares, and client_paperclip_companies is keyed by tenant_slug with no id.
  const response = await fetch(`${baseUrl}/rest/v1/${table}?select=tenant_slug&tenant_slug=eq.${encodeURIComponent(tenant)}&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  const rows = await response?.json().catch(() => []) ?? [];
  return { ok: response?.ok === true, status: response?.status ?? 503, rows: Array.isArray(rows) ? rows : [] };
}

function required(flag) {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : null;
  if (!value) fail(`${flag} is required`);
  return value.trim();
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
}

function token(valueFlag, fileFlag) {
  const valueIndex = args.indexOf(valueFlag);
  if (valueIndex >= 0 && args[valueIndex + 1]) return args[valueIndex + 1].trim();
  const fileIndex = args.indexOf(fileFlag);
  if (fileIndex >= 0 && args[fileIndex + 1]) {
    try {
      const value = readFileSync(args[fileIndex + 1], "utf8").trim();
      if (value) return value;
    } catch {}
    fail(`${fileFlag} must point to a readable non-empty token file`);
  }
  fail(`${valueFlag} or ${fileFlag} is required`);
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
