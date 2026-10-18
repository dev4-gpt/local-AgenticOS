#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";
import { evaluateTenantProbe } from "./lib/tenant-isolation-probe.mjs";

const args = process.argv.slice(2);
const suppliedUrl = required("--url");
const expectedProjectRef = required("--expected-project-ref");
const tenantA = required("--tenant-a");
const tenantB = required("--tenant-b");

if (tenantA === tenantB) fail("--tenant-a and --tenant-b must be different");
if (!/^[a-z0-9]{20}$/.test(expectedProjectRef)) fail("--expected-project-ref must be a Supabase project reference");
let parsedUrl;
try { parsedUrl = new URL(suppliedUrl); } catch { fail("--url must be a valid Supabase project URL"); }
if (parsedUrl.origin !== `https://${expectedProjectRef}.supabase.co` || parsedUrl.pathname !== "/"
    || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
  fail("--url must match the independently verified --expected-project-ref without credentials, path or query");
}
const baseUrl = parsedUrl.origin;
const anonKey = valueAfter("--anon-key") || process.env.SUPABASE_ANON_KEY;
if (!anonKey) fail("--anon-key or SUPABASE_ANON_KEY is required");
const tokenA = token("--access-token-a", "--access-token-file-a");
const tokenB = token("--access-token-b", "--access-token-file-b");
const [identityA, identityB] = await Promise.all([identity(tokenA), identity(tokenB)]);
if (!identityA || !identityB || identityA === identityB) {
  fail("Both sessions must resolve to distinct Supabase Auth users before table probes");
}

const probes = [
  ["records", "client_runtime_records"],
  ["notebooks", "client_notebooks"],
  ["notebook sources", "client_notebook_sources"],
  ["notebook chunks", "client_notebook_chunks"],
  ["research runs", "client_research_runs"],
  ["research records", "client_research_records"],
  ["research citations", "client_research_citations"],
  ["visual QA reports", "client_visual_qa_reports"],
  ["visual QA findings", "client_visual_qa_findings"],
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
  ["pipeline items", "client_pipeline_items"],
  ["board tasks", "client_board_tasks"],
  ["board comments", "client_board_comments"],
  ["board events", "client_board_events"],
  ["loop runs", "client_loop_runs"],
  ["loop rounds", "client_loop_rounds"],
  ["Hermes content factory", "client_hermes_content_factory_runs"],
  ["Hermes stage outputs", "client_hermes_content_factory_stage_outputs"],
  ["Hermes citations", "client_hermes_content_factory_citations"],
  ["Hermes quality reports", "client_hermes_content_factory_quality_reports"],
  ["Hermes approvals", "client_hermes_content_factory_approvals"],
  ["Hermes deliveries", "client_hermes_content_factory_deliveries"],
  ["ruflo swarms", "client_ruflo_swarms"],
  ["ruflo agents", "client_ruflo_agents"],
];
const failures = [];

for (const [label, table] of probes) {
  const [aOwn, aOther, bOwn, bOther] = await Promise.all([
    select(table, tenantA, tokenA),
    select(table, tenantB, tokenA),
    select(table, tenantB, tokenB),
    select(table, tenantA, tokenB),
  ]);
  failures.push(...evaluateTenantProbe(label, tenantA, tenantB, { aOwn, aOther, bOwn, bOther }));
}

if (failures.length) {
  console.error("Client isolation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Read-only client isolation probes passed for ${tenantA} and ${tenantB}: two distinct Auth users, ${probes.length} populated table probes. Tokens and row content were not printed. Writes, execution, export and recovery remain untested.`);

async function identity(token) {
  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const user = await response.json().catch(() => null);
  return typeof user?.id === "string"
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(user.id)
    ? user.id.toLowerCase() : null;
}

async function select(table, tenant, token) {
  // Select tenant_slug rather than id: it is the one column every probed table
  // shares, and client_paperclip_companies is keyed by tenant_slug with no id.
  const response = await fetch(`${baseUrl}/rest/v1/${table}?select=tenant_slug&tenant_slug=eq.${encodeURIComponent(tenant)}&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const rows = await response?.json().catch(() => null);
  return { ok: response?.ok === true && Array.isArray(rows), status: response?.status ?? 503, rows: Array.isArray(rows) ? rows : [] };
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

function fail(message) {
  console.error(message);
  process.exit(1);
}
