#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const modelIds = (valueAfter("--models") || "").split(",").map((value) => value.trim()).filter(Boolean);
const outputPath = valueAfter("--out");
const sourceUrl = "https://openrouter.ai/api/v1/models";
if (!modelIds.length) fail("Pass one or more exact OpenRouter model IDs with --models model-a,model-b");

const response = await fetch(sourceUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
if (!response?.ok) fail(`OpenRouter model catalog request failed with HTTP ${response?.status || 0}`);
const body = await response.json().catch(() => null);
const catalog = Array.isArray(body?.data) ? body.data : [];
if (!catalog.length) fail("OpenRouter model catalog returned no models");

const failures = [];
const warnings = [];
const selected = [];
const pricing = {};
for (const id of modelIds) {
  const model = catalog.find((row) => row?.id === id);
  if (!model) {
    failures.push(`model not found in current OpenRouter catalog: ${id}`);
    continue;
  }
  if (Array.isArray(model.pricing)) {
    failures.push(`tiered pricing is not supported by the current Veloce quote schema: ${id}`);
    continue;
  }
  const promptPerToken = decimal(model?.pricing?.prompt);
  const completionPerToken = decimal(model?.pricing?.completion);
  if (promptPerToken === null || completionPerToken === null) {
    failures.push(`prompt/completion pricing is missing or invalid: ${id}`);
    continue;
  }
  const inputMicrosPer1k = conservativeMicrosPer1k(promptPerToken);
  const outputMicrosPer1k = conservativeMicrosPer1k(completionPerToken);
  if (inputMicrosPer1k === 0 && outputMicrosPer1k === 0) warnings.push(`${id} is zero-priced; the positive managed-credit reservation contract needs an explicit free-lane policy before activation`);
  pricing[id] = { inputMicrosPer1k, outputMicrosPer1k };
  selected.push({
    id,
    name: typeof model.name === "string" ? model.name : id,
    contextLength: Number.isSafeInteger(Number(model.context_length)) ? Number(model.context_length) : null,
    sourcePricingPerToken: { prompt: String(model.pricing.prompt), completion: String(model.pricing.completion) },
    normalized: pricing[id],
  });
}

const retrievedAt = new Date().toISOString();
const canonical = JSON.stringify(Object.fromEntries(Object.entries(pricing).sort(([left], [right]) => left.localeCompare(right))));
const snapshotId = `openrouter-managed-${retrievedAt.slice(0, 10)}-${createHash("sha256").update(canonical).digest("hex").slice(0, 12)}`;
const artifact = {
  schemaVersion: 1,
  snapshotId,
  retrievedAt,
  sourceUrl,
  reviewStatus: "pending-human-approval",
  modelAllowlist: Object.keys(pricing).sort(),
  pricing,
  selected,
  failures,
  warnings,
};

if (outputPath) {
  const target = resolve(outputPath);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, JSON.stringify(artifact, null, 2) + "\n", { mode: 0o600 });
  chmodSync(target, 0o600);
}
console.log(JSON.stringify({ ...artifact, outputPath: outputPath ? resolve(outputPath) : null }, null, 2));
if (failures.length) process.exit(1);

function decimal(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function conservativeMicrosPer1k(dollarsPerToken) {
  const value = Math.ceil(dollarsPerToken * 1_000_000_000);
  return Number.isSafeInteger(value) && value >= 0 ? value : Number.NaN;
}

function valueAfter(flag) {
  const direct = args.find((item) => item.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1).trim() || null;
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
