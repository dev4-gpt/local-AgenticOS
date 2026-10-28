#!/usr/bin/env node
// Read-only check of the shared page format (docs/knowledge-layer-schema.md).
// A note with no `type` is a legacy note: it stays private and is not an error.
// A note with a `type` must satisfy every rule or it is invalid and cannot be shared.
// The report holds paths and rule names only, never note text. --out must be outside every store.
// Usage: node scripts/knowledge-unify/schema-check.mjs --store operator=/path/to/vault [--out DIR]
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalBody, canonicalUrl, isInside, listMarkdown, parseNote, resolveReal, sha256Hex } from "./scan.mjs";

export const PAGE_TYPES = new Set(["entity", "concept", "topic", "source", "synthesis"]);
const TENANT = /^[a-z][a-z0-9-]{2,40}$/;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** Hash a shared page must carry: the canonical body, the same hash the duplicate tools use. */
export function bodyHash(body) {
  return sha256Hex(canonicalBody(body));
}

function validDate(value) {
  if (typeof value !== "string") return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const time = Date.parse(value.trim());
  if (Number.isNaN(time)) return null;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  // Node accepts 2026-02-30 and rolls it into March, so the month must survive the round trip.
  if (day.getUTCMonth() !== Number(match[2]) - 1) return null;
  return time;
}

/** A source reference is a cleaned http(s) URL or a file reference; this only says whether it is usable. */
export function usableReference(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text === "" || /[\u0000-\u001f]/.test(text)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return canonicalUrl(text) !== "";
  return !text.split(/[\\/]/).includes("..");
}

/**
 * status: "legacy-private" (no type), "invalid" (has a type, breaks a rule) or "shared-ok".
 * Only "shared-ok" may ever be promoted.
 */
export function checkPage(meta, body) {
  const type = typeof meta.type === "string" ? meta.type.trim() : "";
  if (type === "" && !Array.isArray(meta.type)) return { status: "legacy-private", problems: [] };
  const problems = [];
  if (!PAGE_TYPES.has(type)) problems.push("type-unknown");
  if (typeof meta.title !== "string" || meta.title.trim() === "") problems.push("title-missing");
  if (!Array.isArray(meta.tags)) problems.push("tags-not-list");
  if (!Array.isArray(meta.sources)) problems.push("sources-not-list");
  else if (meta.sources.length === 0) problems.push("sources-empty");
  else if (!meta.sources.every(usableReference)) problems.push("sources-unusable");
  const created = validDate(meta.created);
  const updated = validDate(meta.updated);
  if (created === null) problems.push("created-invalid");
  if (updated === null) problems.push("updated-invalid");
  if (created !== null && updated !== null && updated < created) problems.push("updated-before-created");
  if (typeof meta.sha256 !== "string" || !SHA256.test(meta.sha256)) problems.push("sha256-missing");
  else if (canonicalBody(body) === "") problems.push("body-empty");
  else if (meta.sha256 !== bodyHash(body)) problems.push("sha256-mismatch");
  if (typeof meta.licence !== "string" || meta.licence.trim() === "") problems.push("licence-missing");
  if (typeof meta.store_origin !== "string" || !LABEL.test(meta.store_origin)) problems.push("store-origin-invalid");
  if (meta.tenant !== undefined && (typeof meta.tenant !== "string" || !TENANT.test(meta.tenant))) problems.push("tenant-invalid");
  if (type === "source") {
    if (typeof meta.canonical_url !== "string" || meta.canonical_url === "") problems.push("canonical-url-missing");
    else if (canonicalUrl(meta.canonical_url) !== meta.canonical_url) problems.push("canonical-url-not-clean");
  }
  return { status: problems.length === 0 ? "shared-ok" : "invalid", problems };
}

export function isPromotable(status) {
  return status === "shared-ok";
}

export function checkStores(stores) {
  const records = [];
  const skipped = [];
  for (const { label, root } of stores) {
    for (const rel of listMarkdown(root, (item) => skipped.push({ root: label, ...item }))) {
      let raw;
      try {
        raw = readFileSync(path.join(root, rel), "utf8");
      } catch {
        skipped.push({ root: label, rel, reason: "unreadable" });
        continue;
      }
      const { meta, body } = parseNote(raw);
      records.push({ key: `${label}::${rel}`, root: label, rel, ...checkPage(meta, body) });
    }
  }
  const count = (status) => records.filter((record) => record.status === status).length;
  const problems = Object.create(null);
  for (const record of records) for (const name of record.problems) problems[name] = (problems[name] ?? 0) + 1;
  return {
    records,
    skipped,
    summary: { total: records.length, sharedOk: count("shared-ok"), legacyPrivate: count("legacy-private"), invalid: count("invalid"), problems },
  };
}

/** Shared by the schema and source-index commands. Throws with a readable message. */
export function parseStoreArgs(argv, tool) {
  const stores = [];
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--store") {
      const value = argv[++i] ?? "";
      const eq = value.indexOf("=");
      if (eq < 1) throw new Error("--store needs label=path");
      stores.push({ label: value.slice(0, eq), root: value.slice(eq + 1) });
    } else rest.push(argv[i]);
  }
  if (stores.length === 0) throw new Error("give at least one --store label=path");
  const labels = new Set();
  for (const store of stores) {
    if (!LABEL.test(store.label)) throw new Error(`bad store label "${store.label}"`);
    if (labels.has(store.label)) throw new Error(`duplicate store label "${store.label}"`);
    labels.add(store.label);
    try {
      const real = realpathSync(store.root);
      if (!lstatSync(real).isDirectory()) throw new Error("not a directory");
      store.root = real;
    } catch {
      throw new Error(`store "${store.label}" is not a readable folder`);
    }
  }
  return { stores, rest, tool };
}

function fail(message) {
  console.error(`knowledge-unify schema-check: ${message}`);
  process.exitCode = 2;
}

function main(argv) {
  let parsed;
  try {
    parsed = parseStoreArgs(argv, "schema-check");
  } catch (error) {
    return fail(error.message);
  }
  let out = path.join(os.tmpdir(), "knowledge-unify");
  for (let i = 0; i < parsed.rest.length; i += 1) {
    if (parsed.rest[i] === "--out") out = parsed.rest[++i] ?? "";
    else return fail(`unknown argument ${parsed.rest[i]}`);
  }
  const resolvedOut = resolveReal(out);
  if (parsed.stores.some((store) => isInside(resolvedOut, store.root))) return fail("--out must be outside every store folder");
  const result = checkStores(parsed.stores);
  mkdirSync(resolvedOut, { recursive: true });
  writeFileSync(path.join(resolvedOut, "schema-check.json"), JSON.stringify({ schema: 1, generatedAt: new Date().toISOString(), ...result }, null, 2));
  const { summary } = result;
  console.log(`Checked ${summary.total} notes: ${summary.sharedOk} shareable, ${summary.legacyPrivate} legacy (private), ${summary.invalid} invalid.`);
  if (result.skipped.length > 0) console.log(`WARNING: ${result.skipped.length} note(s) could not be read, so this check is incomplete.`);
  console.log(`Problems: ${JSON.stringify(summary.problems)}`);
  console.log(`Report (paths and rule names only): ${path.join(resolvedOut, "schema-check.json")}`);
}

if (process.argv[1]?.endsWith("/knowledge-unify/schema-check.mjs")) {
  main(process.argv.slice(2));
}
