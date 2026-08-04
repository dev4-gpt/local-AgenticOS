#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const baseUrl = required("--url").replace(/\/$/, "");
const cookieFile = value("--cookie-file");
const manifestFile = value("--manifest") || "client-blueprints/veloce-self-marketing.campaign.json";
const outputFile = value("--out") || "/private/tmp/veloce-self-marketing-evidence.json";
const apply = args.includes("--apply");
const includeBriefs = args.includes("--include-briefs");
const providerSmoke = args.includes("--provider-smoke");
if (apply && !cookieFile) fail("--cookie-file is required with --apply");
let cookie = apply ? await readCookie(cookieFile) : "";
const campaign = JSON.parse(await readFile(manifestFile, "utf8"));
const evidence = {
  campaignId: campaign.campaignId,
  campaignName: campaign.campaignName,
  mode: apply ? "apply" : "dry-run",
  includeBriefs,
  providerSmoke: false,
  startedAt: new Date().toISOString(),
  baseUrl,
  records: [],
  workflows: [],
  briefs: [],
  manualChecks: [
    "Review /capabilities, /credentials, /integrations, /seo, /seo-guide, and /guide.",
    "Run the provider surface prompts and classify each as passed, intentionally gated, failed, or needs adapter work.",
    "Submit one labeled synthetic lead through each public form and verify signups, source attribution, Gmail receipt, and submitted fields.",
    "Delete synthetic lead rows using the controlled cleanup process.",
    "Run /deliver only as an approved test webhook; do not publish externally.",
    "Capture Cloud Run revision and manifest version for the replication package."
  ],
  notes: [
    "Provider prompts do not automatically retrieve all tenant memory; paste the approved context summary into prompts.",
    "Brief requests have no read/list endpoint. Use --include-briefs only for a new campaign seed or after confirming no duplicate campaign briefs exist.",
    "This runner never publishes, contacts prospects, or dispatches a provider workflow."
  ]
};

if (!apply) {
  console.log(JSON.stringify({
    mode: "dry-run",
    campaignId: campaign.campaignId,
    records: campaign.records.length,
    workflows: campaign.workflows.length,
    briefs: includeBriefs ? campaign.briefs.length : 0,
    providerSmoke,
    next: "Re-run with --apply. Add --include-briefs once you have confirmed the tenant has no existing campaign briefs."
  }, null, 2));
  process.exit(0);
}

for (const record of campaign.records) await seedRecord(record);
for (const workflow of campaign.workflows) await seedWorkflow(workflow);
if (includeBriefs) {
  for (const brief of campaign.briefs) await seedBrief(brief);
}
if (providerSmoke) {
  const result = spawnSync(process.execPath, ["scripts/verify-client-runtime-surface-map.mjs", "--url", baseUrl, "--cookie-file", cookieFile, "--provider-smoke"], { stdio: "inherit" });
  evidence.providerSmoke = result.status === 0;
  if (result.status !== 0) evidence.notes.push(`Provider smoke exited with status ${String(result.status)}; inspect its classified output before accepting the campaign.`);
}

evidence.finishedAt = new Date().toISOString();
await writeFile(outputFile, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(`Campaign evidence written: ${outputFile}`);
console.log(JSON.stringify({
  campaignId: evidence.campaignId,
  records: evidence.records.length,
  workflows: evidence.workflows.length,
  briefs: evidence.briefs.length,
  providerSmoke: evidence.providerSmoke,
  evidenceFile: outputFile
}, null, 2));

async function seedRecord(record) {
  const listed = await api(`/api/client-runtime/records?kind=${encodeURIComponent(record.kind)}`);
  const body = await json(listed);
  const existing = Array.isArray(body?.records) ? body.records.find((item) => item?.title === record.title) : null;
  if (existing?.id) {
    evidence.records.push({ kind: record.kind, title: record.title, status: "reused", id: existing.id });
    return;
  }
  const response = await api("/api/client-runtime/records", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record),
  });
  const result = await json(response);
  if (response.status !== 201) throw new Error(`record ${record.title} failed HTTP ${response.status}: ${String(result?.error ?? "unknown")}`);
  evidence.records.push({ kind: record.kind, title: record.title, status: "created", id: result?.record?.id ?? null });
}

async function seedWorkflow(workflow) {
  const listed = await api(`/api/client-runtime/workflows?surface=${encodeURIComponent(workflow.surface)}`);
  const body = await json(listed);
  const existing = Array.isArray(body?.workflows) ? body.workflows.find((item) => item?.title === workflow.title) : null;
  if (existing?.id) {
    evidence.workflows.push({ surface: workflow.surface, title: workflow.title, status: "reused", workflowId: existing.id, execution: existing.metadata?.execution ?? null });
    return;
  }
  const response = await api("/api/client-runtime/workflows", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(workflow),
  });
  const result = await json(response);
  if (response.status !== 202 || typeof result?.workflowId !== "string") throw new Error(`workflow ${workflow.title} failed HTTP ${response.status}: ${String(result?.error ?? "unknown")}`);
  const terminal = await waitForWorkflow(workflow.surface, result.workflowId);
  evidence.workflows.push({ surface: workflow.surface, title: workflow.title, status: terminal?.metadata?.execution?.status ?? "timeout", workflowId: result.workflowId, jobId: result.jobId ?? null, execution: terminal?.metadata?.execution ?? null });
}

async function seedBrief(brief) {
  const response = await api("/api/client-runtime/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: brief.type, title: `[${campaign.campaignId}] ${brief.title}`, details: brief.details, fields: brief.fields }),
  });
  const result = await json(response);
  if (response.status !== 200) throw new Error(`brief ${brief.title} failed HTTP ${response.status}: ${String(result?.error ?? "unknown")}`);
  evidence.briefs.push({ surface: brief.surface, title: brief.title, status: "submitted", requestType: brief.type });
}

async function waitForWorkflow(surface, id) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const response = await api(`/api/client-runtime/workflows?surface=${encodeURIComponent(surface)}`);
    const body = await json(response);
    const workflow = Array.isArray(body?.workflows) ? body.workflows.find((item) => item?.id === id) : null;
    const status = workflow?.metadata?.execution?.status;
    if (status === "completed" || status === "failed" || status === "approval_required") return workflow;
    await sleep(2_000);
  }
  return null;
}

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { accept: "application/json", cookie, ...(options.headers || {}) },
    redirect: "manual",
    cache: "no-store",
  }).catch(() => new Response(null, { status: 503 }));
  await persistRotatedCookies(response);
  return response;
}

async function json(response) {
  return response.json().catch(() => null);
}

async function readCookie(filePath) {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`Cookie file not found: ${filePath}. Create it from the authenticated browser session, then rerun with --apply.`);
    throw error;
  }
  const mode = fileStat.mode & 0o777;
  if ((mode & 0o077) !== 0) fail("--cookie-file must not be readable by group or other users");
  const value = (await readFile(filePath, "utf8")).trim().replace(/^cookie:\s*/i, "").replace(/^['"]|['"]$/g, "").trim();
  if (!value || !/\bveloce_access_token=/.test(value) || !/\bveloce_refresh_token=/.test(value)) fail("--cookie-file must contain both runtime session cookies");
  return value;
}

async function persistRotatedCookies(response) {
  const headers = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : splitSetCookieHeader(response.headers.get("set-cookie") ?? "");
  if (!headers.length) return;
  const jar = new Map();
  for (const pair of cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  for (const header of headers) {
    const match = /^(veloce_(?:access|refresh)_token)=([^;]*)/i.exec(header.trim());
    if (match && match[2]) jar.set(match[1], match[2]);
  }
  if (!jar.has("veloce_access_token") || !jar.has("veloce_refresh_token")) return;
  const nextCookie = `veloce_access_token=${jar.get("veloce_access_token")}; veloce_refresh_token=${jar.get("veloce_refresh_token")}`;
  if (nextCookie !== cookie) {
    cookie = nextCookie;
    await writeFile(cookieFile, `${cookie}\n`, { mode: 0o600 });
  }
}

function splitSetCookieHeader(value) {
  return value.split(/,(?=\s*veloce_(?:access|refresh)_token=)/i).map((item) => item.trim()).filter(Boolean);
}

function value(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function required(flag) {
  const result = value(flag);
  if (!result) fail(`${flag} is required`);
  return result.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
