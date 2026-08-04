#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import process from "node:process";

const args = process.argv.slice(2);
const baseUrl = required("--url").replace(/\/$/, "");
const cookieFile = required("--cookie-file");
const manifestFile = value("--manifest") || "client-blueprints/veloce-self-marketing.campaign.json";
const outputFile = value("--out") || "/private/tmp/veloce-self-marketing-assets-evidence.json";
const apply = args.includes("--apply");
let cookie = await readCookie(cookieFile);
const campaign = JSON.parse(await readFile(manifestFile, "utf8"));
const evidence = { campaignId: campaign.campaignId, mode: apply ? "apply" : "dry-run", baseUrl, assets: [], startedAt: new Date().toISOString() };

if (!apply) {
  console.log(JSON.stringify({ mode: "dry-run", assets: campaign.assets?.map(({ provider, model, title }) => ({ provider, model, title })) ?? [] }, null, 2));
  process.exit(0);
}

for (const asset of campaign.assets ?? []) {
  const existing = await findNotebook(asset.title);
  if (existing?.id) {
    evidence.assets.push({ provider: asset.provider, title: asset.title, status: "reused", recordId: existing.id });
    continue;
  }
  console.log(`Generating ${asset.title} with ${asset.provider}...`);
  const created = await api("/api/client-runtime/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: asset.provider, model: asset.model, prompt: asset.prompt, history: [], idempotencyKey: `${campaign.campaignId}-${asset.provider}-asset-v1` }),
  });
  const body = await json(created);
  if (created.status !== 202 || typeof body?.jobId !== "string") throw new Error(`${asset.title} enqueue failed HTTP ${created.status}: ${String(body?.error ?? "unknown")}`);
  const job = await waitForJob(body.jobId);
  if (job?.status !== "succeeded") throw new Error(`${asset.title} ended as ${String(job?.status ?? "timeout")}: ${String(job?.error_code ?? "")}`);
  const output = typeof job.output_metadata?.output === "string" ? job.output_metadata.output.trim() : "";
  if (output.length < 20) throw new Error(`${asset.title} returned no usable content`);
  const stored = await api("/api/client-runtime/records", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "notebook", title: asset.title, content: redactSecretLikeSyntax(output) }),
  });
  const storedBody = await json(stored);
  if (stored.status !== 201) throw new Error(`${asset.title} record failed HTTP ${stored.status}: ${String(storedBody?.error ?? "unknown")}`);
  evidence.assets.push({ provider: asset.provider, model: asset.model, title: asset.title, status: "generated-and-stored", jobId: body.jobId });
}

evidence.finishedAt = new Date().toISOString();
await writeFile(outputFile, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(`Asset evidence written: ${outputFile}`);
console.log(JSON.stringify(evidence, null, 2));

async function findNotebook(title) {
  const response = await api(`/api/client-runtime/records?kind=notebook`);
  const body = await json(response);
  return Array.isArray(body?.records) ? body.records.find((item) => item?.title === title) : null;
}

async function waitForJob(id) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await api(`/api/client-runtime/jobs/${encodeURIComponent(id)}`);
    const body = await json(response);
    const job = body?.job;
    if (job?.status === "succeeded" || job?.status === "failed" || job?.status === "cancelled") return job;
    await sleep(2_000);
  }
  return null;
}

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers: { accept: "application/json", cookie, ...(options.headers || {}) }, redirect: "manual", cache: "no-store" }).catch(() => new Response(null, { status: 503 }));
  await persistRotatedCookies(response);
  return response;
}

async function json(response) { return response.json().catch(() => null); }

async function readCookie(filePath) {
  const mode = (await stat(filePath)).mode & 0o777;
  if ((mode & 0o077) !== 0) fail("--cookie-file must not be readable by group or other users");
  const value = (await readFile(filePath, "utf8")).trim();
  if (!/\bveloce_access_token=/.test(value) || !/\bveloce_refresh_token=/.test(value)) fail("--cookie-file must contain both runtime session cookies");
  return value;
}

async function persistRotatedCookies(response) {
  const headers = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : splitSetCookieHeader(response.headers.get("set-cookie") ?? "");
  if (!headers.length) return;
  const jar = new Map();
  for (const pair of cookie.split(";")) { const separator = pair.indexOf("="); if (separator > 0) jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim()); }
  for (const header of headers) { const match = /^(veloce_(?:access|refresh)_token)=([^;]*)/i.exec(header.trim()); if (match && match[2]) jar.set(match[1], match[2]); }
  if (!jar.has("veloce_access_token") || !jar.has("veloce_refresh_token")) return;
  const nextCookie = `veloce_access_token=${jar.get("veloce_access_token")}; veloce_refresh_token=${jar.get("veloce_refresh_token")}`;
  if (nextCookie !== cookie) { cookie = nextCookie; await writeFile(cookieFile, `${cookie}\n`, { mode: 0o600 }); }
}

function splitSetCookieHeader(value) { return value.split(/,(?=\s*veloce_(?:access|refresh)_token=)/i).map((item) => item.trim()).filter(Boolean); }
function redactSecretLikeSyntax(value) { return value.replace(/(api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token)\s*[:=]\s*[^\s,;]+/gi, "$1 [redacted]"); }
function value(flag) { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : null; }
function required(flag) { const result = value(flag); if (!result) fail(`${flag} is required`); return result.trim(); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function fail(message) { console.error(message); process.exit(1); }
