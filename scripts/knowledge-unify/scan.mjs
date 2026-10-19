#!/usr/bin/env node
// Read-only inventory of markdown knowledge stores (Obsidian-style vaults).
// It only reads store folders. The report goes to --out, which must be outside every store.
// Usage: node scripts/knowledge-unify/scan.mjs --store operator=/path/to/vault [--store creator-os=/path] [--out DIR]
// Format reference: docs/knowledge-layer-schema.md
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const SKIP_DIRS = new Set([".obsidian", ".git", ".trash", "node_modules", "_backups", "_duplicates"]);
export const MAX_BYTES = 5 * 1024 * 1024;
const TRACKING_PARAM = /^(utm_|fbclid$|igshid$|gclid$|mc_cid$|mc_eid$)/i;
const MIN_COMPARABLE_CHARS = 20;

export function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** True when child is the same folder as parent or sits below it. */
export function isInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

export function canonicalUrl(raw) {
  try {
    const url = new URL(String(raw).trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    let out = url.toString();
    if (!url.search && out.endsWith("/")) out = out.slice(0, -1);
    return out;
  } catch {
    return "";
  }
}

export function canonicalBody(body) {
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .trim();
}

export function normalizeText(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function unquote(value) {
  const trimmed = value.trim();
  return /^(".*"|'.*')$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

function parseSimpleYaml(block) {
  const meta = {};
  let currentKey = null;
  for (const line of block.split("\n")) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && currentKey && Array.isArray(meta[currentKey])) {
      meta[currentKey].push(unquote(item[1]));
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key, value] = pair;
    currentKey = key;
    if (value === "") meta[key] = [];
    else if (value.startsWith("[") && value.endsWith("]")) {
      meta[key] = value.slice(1, -1).split(",").map((part) => unquote(part)).filter(Boolean);
    } else meta[key] = unquote(value);
  }
  return meta;
}

export function parseNote(raw) {
  const text = raw.replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!match) return { meta: {}, body: text, hasFrontmatter: false };
  return { meta: parseSimpleYaml(match[1]), body: text.slice(match[0].length), hasFrontmatter: true };
}

function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" && value ? [value] : [];
}

function noteTitle(meta, body, rel) {
  if (typeof meta.title === "string" && meta.title.trim()) return meta.title.trim();
  const heading = /^#\s+(.+)$/m.exec(body);
  if (heading) return heading[1].trim();
  return path.posix.basename(rel, ".md");
}

function wikilinks(body) {
  const targets = new Set();
  for (const match of body.matchAll(/\[\[([^\]|#\n]+)(?:[#|][^\]\n]*)?\]\]/g)) {
    const name = match[1].trim().split("/").pop().toLowerCase();
    if (name) targets.add(name);
  }
  return [...targets];
}

function primaryUrl(meta) {
  const candidates = [];
  for (const key of ["url", "source_url", "canonical_url"]) {
    if (typeof meta[key] === "string") candidates.push(meta[key]);
  }
  if (typeof meta.source === "string") candidates.push(meta.source);
  if (meta.type === "source" && Array.isArray(meta.sources) && meta.sources.length > 0) candidates.push(meta.sources[0]);
  for (const candidate of candidates) {
    const url = canonicalUrl(candidate);
    if (url) return url;
  }
  return "";
}

function originFor(label, rel) {
  if (label !== "operator") return label;
  if (rel.startsWith("Agentic OS/Content OS/")) return "creator-os";
  if (rel.startsWith("Agentic OS/Knowledge/")) return "knowledge";
  return label;
}

export function listMarkdown(root) {
  const found = [];
  const stack = [""];
  while (stack.length > 0) {
    const rel = stack.pop();
    for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(childRel);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        found.push(childRel);
      }
    }
  }
  return found.sort();
}

export function scanStore(label, root) {
  const records = [];
  const skipped = [];
  for (const rel of listMarkdown(root)) {
    const abs = path.join(root, rel);
    const stat = lstatSync(abs);
    if (stat.size > MAX_BYTES) {
      skipped.push({ root: label, rel, reason: "too-large" });
      continue;
    }
    let raw;
    try {
      raw = readFileSync(abs, "utf8");
    } catch {
      skipped.push({ root: label, rel, reason: "unreadable" });
      continue;
    }
    const { meta, body, hasFrontmatter } = parseNote(raw);
    const canonical = canonicalBody(body);
    const comparable = normalizeText(canonical);
    const title = noteTitle(meta, body, rel);
    const titleText = normalizeText(title);
    records.push({
      key: `${label}::${rel}`,
      root: label,
      origin: originFor(label, rel),
      rel,
      title,
      type: typeof meta.type === "string" ? meta.type : "",
      tags: asList(meta.tags),
      sources: asList(meta.sources),
      primaryUrl: primaryUrl(meta),
      sha256: canonical.length >= MIN_COMPARABLE_CHARS ? sha256Hex(canonical) : "",
      nearKey: comparable.length >= MIN_COMPARABLE_CHARS ? sha256Hex(comparable) : "",
      titleKey: titleText.length >= 8 ? titleText : "",
      fileSha256: sha256Hex(raw),
      bodyChars: canonical.length,
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
      metaFields: Object.keys(meta).length,
      hasFrontmatter,
      linksOut: wikilinks(body),
    });
  }
  return { records, skipped };
}

function tally(values) {
  const counts = {};
  for (const value of values) counts[value || "(none)"] = (counts[value || "(none)"] ?? 0) + 1;
  return counts;
}

export function scan(stores) {
  const records = [];
  const skipped = [];
  for (const { label, root } of stores) {
    const result = scanStore(label, root);
    records.push(...result.records);
    skipped.push(...result.skipped);
  }
  return {
    generatedAt: new Date().toISOString(),
    stores: Object.fromEntries(stores.map((store) => [store.label, path.resolve(store.root)])),
    records,
    skipped,
    summary: {
      total: records.length,
      byOrigin: tally(records.map((record) => record.origin)),
      byType: tally(records.map((record) => record.type)),
      noFrontmatter: records.filter((record) => !record.hasFrontmatter).length,
      tooShortToCompare: records.filter((record) => !record.sha256).length,
      skipped: skipped.length,
    },
  };
}

function fail(message) {
  console.error(`knowledge-unify scan: ${message}`);
  process.exitCode = 2;
}

function main(argv) {
  const stores = [];
  let out = path.join(os.tmpdir(), "knowledge-unify");
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--vault") stores.push({ label: "operator", root: argv[++i] ?? "" });
    else if (arg === "--store") {
      const value = argv[++i] ?? "";
      const eq = value.indexOf("=");
      if (eq < 1) return fail("--store needs label=path");
      stores.push({ label: value.slice(0, eq), root: value.slice(eq + 1) });
    } else if (arg === "--out") out = argv[++i] ?? "";
    else return fail(`unknown argument ${arg}`);
  }
  if (stores.length === 0) return fail("give at least one --store label=path (or --vault path)");
  const labels = new Set();
  for (const store of stores) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(store.label)) return fail(`bad store label "${store.label}"`);
    if (labels.has(store.label)) return fail(`duplicate store label "${store.label}"`);
    labels.add(store.label);
    let real;
    try {
      real = realpathSync(store.root);
      if (!lstatSync(real).isDirectory()) throw new Error("not a directory");
    } catch {
      return fail(`store "${store.label}" is not a readable folder`);
    }
    store.root = real;
  }
  const resolvedOut = path.resolve(out);
  if (stores.some((store) => isInside(resolvedOut, store.root))) return fail("--out must be outside every store folder");
  const result = scan(stores);
  mkdirSync(resolvedOut, { recursive: true });
  writeFileSync(path.join(resolvedOut, "scan.json"), JSON.stringify(result, null, 2));
  console.log(`Scanned ${result.summary.total} notes in ${stores.length} store(s); ${result.summary.skipped} skipped.`);
  console.log(`By origin: ${JSON.stringify(result.summary.byOrigin)}`);
  console.log(`Report (titles and paths only, no note text): ${path.join(resolvedOut, "scan.json")}`);
}

if (process.argv[1]?.endsWith("/knowledge-unify/scan.mjs")) {
  main(process.argv.slice(2));
}
