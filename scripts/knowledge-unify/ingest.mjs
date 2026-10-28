#!/usr/bin/env node
// Ingest your own files (.md, .markdown, .txt) into a vault as pages in the shared format.
// Every file goes through four gates and ends in exactly one outcome:
//   quarantined  the injection scanner blocked it (or flagged it, unless --allow-flagged). The original is copied to
//                --quarantine, which is outside every store, and nothing is written to the vault.
//   duplicate    the same canonical body is already in the vault or earlier in this run.
//   lint-failed  the page it would become breaks a rule in schema-check.mjs.
//   exists       the destination note already exists. Nothing is ever overwritten.
//   written      (would-write on a dry run) a new page with title, type, tags, sources, created, updated, sha256,
//                licence and store_origin. `sources` always names the original file by absolute path, so deleting that
//                file and running `source-index.mjs cascade --source <path>` removes the page.
// Reports hold paths, outcomes, rule names and counts, never note text. Dry run unless --apply is given.
// Usage: node scripts/knowledge-unify/ingest.mjs --from DIR --store L=PATH [--into SUBDIR] [--type TYPE]
//        [--licence TEXT] [--origin LABEL] [--tenant SLUG] [--allow-flagged] [--out DIR] [--quarantine DIR] [--apply]
// The scanner is src/lib/adapterMemoryGuard.ts, loaded at run time; the command stops if it cannot be loaded.
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PAGE_TYPES, bodyHash, checkPage, parseStoreArgs, validDate } from "./schema-check.mjs";
import { MAX_BYTES, SKIP_DIRS, canonicalBody, isInside, listMarkdown, parseNote, resolveReal, sha256Hex } from "./scan.mjs";

export const INGEST_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
export const MIN_BODY_CHARS = 20;
const ICLOUD_STUB = /^\.(.+)\.icloud$/i;
const MANAGED = ["title", "type", "tags", "sources", "created", "updated", "sha256", "licence", "store_origin"];

/** Walks --from. Symlinks are skipped, iCloud placeholders and unreadable folders are reported, never ignored. */
export function listSourceFiles(root) {
  const files = [];
  const skipped = [];
  const stack = [""];
  while (stack.length > 0) {
    const rel = stack.pop();
    let entries;
    try {
      entries = readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      skipped.push({ rel: rel || ".", reason: "unreadable-dir" });
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(child);
      } else if (entry.isFile()) {
        if (ICLOUD_STUB.test(entry.name)) skipped.push({ rel: child, reason: "not-downloaded" });
        else if (INGEST_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(child);
        else skipped.push({ rel: child, reason: "unsupported-type" });
      }
    }
  }
  return { files: files.sort(), skipped };
}

/** Splits a note into its frontmatter lines and body. Handles an empty block and a byte-order mark. */
function splitNote(raw) {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)/.exec(text);
  if (!match) return { lines: [], body: text };
  return { lines: match[1] === undefined ? [] : match[1].split("\n"), body: text.slice(match[0].length) };
}

function scalar(value) {
  const flat = String(value).replace(/\s+/g, " ").trim();
  if (!/^["'[]/.test(flat)) return flat;
  if (!flat.includes('"')) return `"${flat}"`;
  if (!flat.includes("'")) return `'${flat}'`;
  return flat.replace(/^["'[]+/, "");
}

/** Removes the managed keys (and their list items) and keeps every other line exactly as written. */
function keepOtherLines(lines, managed) {
  const kept = [];
  let dropping = false;
  for (const line of lines) {
    const key = /^([A-Za-z0-9_-]+):/.exec(line);
    if (key) dropping = managed.has(key[1]);
    else if (!/^\s*-\s/.test(line) && line.trim() !== "") dropping = false;
    if (!dropping) kept.push(line);
  }
  return kept;
}

function firstHeading(body) {
  const heading = /^#\s+(.+)$/m.exec(body);
  return heading ? heading[1].trim() : "";
}

/**
 * Builds the page for one source file. Returns { text, title, body }.
 * Existing frontmatter values are kept when they are valid; the source file reference, updated and sha256 are always set.
 */
export function buildPage({ raw, absSource, rel, defaults, today }) {
  const { lines, body } = splitNote(raw);
  const { meta } = parseNote(`---\n${lines.join("\n")}\n---\n`);
  const title = (typeof meta.title === "string" && meta.title.trim()) || firstHeading(body) || path.basename(rel, path.extname(rel));
  const type = typeof meta.type === "string" && PAGE_TYPES.has(meta.type.trim()) ? meta.type.trim() : defaults.type;
  const tags = Array.isArray(meta.tags) ? meta.tags.map(String) : typeof meta.tags === "string" && meta.tags ? [meta.tags] : [];
  const existing = Array.isArray(meta.sources) ? meta.sources.map(String) : typeof meta.sources === "string" && meta.sources ? [meta.sources] : [];
  const sources = [...new Set([...existing, absSource])];
  const created = typeof meta.created === "string" && validDate(meta.created) !== null ? meta.created.trim() : today;
  const licence = typeof meta.licence === "string" && meta.licence.trim() ? meta.licence.trim() : defaults.licence;
  const origin = typeof meta.store_origin === "string" && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(meta.store_origin) ? meta.store_origin : defaults.origin;
  const managed = new Set(defaults.tenant ? [...MANAGED, "tenant"] : MANAGED);
  const out = [
    `title: ${scalar(title)}`,
    `type: ${type}`,
    ...(tags.length > 0 ? ["tags:", ...tags.map((tag) => `  - ${scalar(tag)}`)] : ["tags: []"]),
    "sources:",
    ...sources.map((source) => `  - ${scalar(source)}`),
    `created: ${created}`,
    `updated: ${today}`,
    `sha256: ${bodyHash(body)}`,
    `licence: ${scalar(licence)}`,
    `store_origin: ${origin}`,
    ...(defaults.tenant ? [`tenant: ${defaults.tenant}`] : []),
    ...keepOtherLines(lines, managed),
  ];
  return { text: `---\n${out.join("\n")}\n---\n${body}`, title, body };
}

function existingBodies(store) {
  const hashes = new Map();
  for (const rel of listMarkdown(store.root)) {
    try {
      const { body } = parseNote(readFileSync(path.join(store.root, rel), "utf8"));
      if (canonicalBody(body).length >= MIN_BODY_CHARS) hashes.set(bodyHash(body), `${store.label}::${rel}`);
    } catch {
      // an unreadable note cannot be compared; the source index and cascade report such notes as blockers
    }
  }
  return hashes;
}

/**
 * Reads everything and decides each file's outcome. Writes nothing.
 * `scan` is the injection scanner (scanMemoryContent); there is no default, so ingest cannot run without one.
 */
export function planIngest({ from, store, into = "Ingest", scan, defaults = {}, allowFlagged = false, now = new Date() }) {
  if (typeof scan !== "function") throw new Error("a scanner function is required");
  const today = now.toISOString().slice(0, 10);
  const settings = { type: "topic", licence: "third-party / unknown", origin: store.label, tenant: "", ...defaults };
  if (!PAGE_TYPES.has(settings.type) || settings.type === "source") throw new Error("default type must be entity, concept, topic or synthesis");
  const { files, skipped } = listSourceFiles(from);
  const seen = existingBodies(store);
  const items = [];
  for (const rel of files) {
    const abs = path.join(from, rel);
    const item = { rel, outcome: "", problems: [], findings: [], dest: "" };
    items.push(item);
    let raw;
    try {
      if (lstatSync(abs).size > MAX_BYTES) {
        item.outcome = "skipped";
        item.problems = ["too-large"];
        continue;
      }
      const buffer = readFileSync(abs);
      raw = buffer.toString("utf8");
      if (!Buffer.from(raw, "utf8").equals(buffer)) {
        item.outcome = "skipped";
        item.problems = ["not-utf8"];
        continue;
      }
    } catch {
      item.outcome = "skipped";
      item.problems = ["unreadable"];
      continue;
    }
    item.fileSha256 = sha256Hex(raw);
    const built = buildPage({ raw, absSource: abs, rel, defaults: settings, today });
    const verdict = scan(`${built.title}\n${built.body}`);
    item.verdict = verdict.verdict;
    item.findings = verdict.findings.map(({ rule, severity, count }) => ({ rule, severity, count }));
    if (verdict.verdict === "blocked" || (verdict.verdict === "flagged" && !allowFlagged)) {
      item.outcome = "quarantined";
      item.raw = raw;
      continue;
    }
    if (canonicalBody(built.body).length < MIN_BODY_CHARS) {
      item.outcome = "lint-failed";
      item.problems = ["body-too-short"];
      continue;
    }
    const lint = checkPage(parseNote(built.text).meta, built.body);
    if (lint.status !== "shared-ok") {
      item.outcome = "lint-failed";
      item.problems = lint.problems;
      continue;
    }
    const hash = bodyHash(built.body);
    if (seen.has(hash)) {
      item.outcome = "duplicate";
      item.of = seen.get(hash);
      continue;
    }
    const destRel = `${into.replace(/^\/+|\/+$/g, "")}/${rel.replace(/\.(markdown|txt)$/i, ".md")}`.replace(/^\//, "");
    const destAbs = resolveReal(path.join(store.root, destRel));
    if (destRel.split("/").includes("..") || !isInside(destAbs, store.root)) {
      item.outcome = "lint-failed";
      item.problems = ["destination-outside-store"];
      continue;
    }
    item.dest = destRel;
    if (existsSync(destAbs)) {
      item.outcome = "exists";
      continue;
    }
    seen.set(hash, `${store.label}::${destRel}`);
    item.outcome = "would-write";
    item.destAbs = destAbs;
    item.text = built.text;
  }
  const blocked = skipped.some((entry) => entry.reason === "not-downloaded" || entry.reason === "unreadable-dir");
  return { items, skipped, blocked };
}

function atomicCreate(abs, text) {
  const tmp = `${abs}.ku-tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, text, { flag: "wx" });
    chmodSync(tmp, 0o644);
    renameSync(tmp, abs);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      // the temp file may never have been created
    }
    throw error;
  }
}

/** Writes the planned pages and copies quarantined originals out. A failed write removes every page written in this run. */
export function applyIngest({ plan, quarantineDir }) {
  if (plan.blocked) throw Object.assign(new Error("blocked"), { skipped: plan.skipped });
  const written = [];
  let quarantined = 0;
  try {
    for (const item of plan.items) {
      if (item.outcome === "quarantined") {
        mkdirSync(quarantineDir, { recursive: true });
        item.quarantineFile = `${item.fileSha256.slice(0, 16)}.txt`;
        const dest = path.join(quarantineDir, item.quarantineFile);
        if (!existsSync(dest)) writeFileSync(dest, item.raw, { flag: "wx", mode: 0o600 });
        quarantined += 1;
      } else if (item.outcome === "would-write") {
        mkdirSync(path.dirname(item.destAbs), { recursive: true });
        if (existsSync(item.destAbs)) throw new Error("destination_appeared");
        atomicCreate(item.destAbs, item.text);
        written.push(item.destAbs);
        item.outcome = "written";
      }
    }
  } catch (error) {
    for (const abs of written.reverse()) {
      try {
        unlinkSync(abs);
      } catch {
        // best effort; the failure below is reported either way
      }
    }
    throw Object.assign(new Error("ingest_failed"), { cause: error, rolledBack: written.length });
  }
  return { written: written.length, quarantined };
}

export function reportOf(plan) {
  const count = (outcome) => plan.items.filter((item) => item.outcome === outcome).length;
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      files: plan.items.length,
      wouldWrite: count("would-write"),
      written: count("written"),
      quarantined: count("quarantined"),
      duplicate: count("duplicate"),
      lintFailed: count("lint-failed"),
      exists: count("exists"),
      skipped: count("skipped") + plan.skipped.length,
    },
    items: plan.items.map(({ rel, outcome, problems, findings, verdict, dest, of, quarantineFile }) => ({ rel, outcome, problems, findings, verdict, dest, of, quarantineFile })),
    skipped: plan.skipped,
  };
}

async function loadScanner() {
  // Resolved from the running script, not import.meta, so the file also loads where tests transform modules to CommonJS.
  const scriptDir = path.dirname(realpathSync(process.argv[1]));
  const url = pathToFileURL(path.join(scriptDir, "..", "..", "src", "lib", "adapterMemoryGuard.ts")).href;
  const mod = await import(url);
  if (typeof mod.scanMemoryContent !== "function") throw new Error("scanMemoryContent missing");
  return mod.scanMemoryContent;
}

function fail(message) {
  console.error(`knowledge-unify ingest: ${message}`);
  process.exitCode = 2;
}

async function main(argv) {
  let parsed;
  try {
    parsed = parseStoreArgs(argv, "ingest");
  } catch (error) {
    return fail(error.message);
  }
  if (parsed.stores.length !== 1) return fail("give exactly one --store");
  const store = parsed.stores[0];
  const opts = { from: "", into: "Ingest", type: "topic", licence: "third-party / unknown", origin: store.label, tenant: "", out: path.join(os.tmpdir(), "knowledge-unify"), quarantine: "", apply: false, allowFlagged: false };
  const valued = { "--from": "from", "--into": "into", "--type": "type", "--licence": "licence", "--origin": "origin", "--tenant": "tenant", "--out": "out", "--quarantine": "quarantine" };
  for (let i = 0; i < parsed.rest.length; i += 1) {
    const arg = parsed.rest[i];
    if (valued[arg]) opts[valued[arg]] = parsed.rest[++i] ?? "";
    else if (arg === "--apply") opts.apply = true;
    else if (arg === "--allow-flagged") opts.allowFlagged = true;
    else return fail(`unknown argument ${arg}`);
  }
  let from;
  try {
    from = realpathSync(opts.from);
    if (!lstatSync(from).isDirectory()) throw new Error("not a directory");
  } catch {
    return fail("--from is not a readable folder");
  }
  if (isInside(from, store.root) || isInside(store.root, from)) return fail("--from and the store must be separate folders");
  const out = resolveReal(opts.out);
  const quarantineDir = resolveReal(opts.quarantine || path.join(out, "quarantine"));
  for (const [name, dir] of [["--out", out], ["--quarantine", quarantineDir]]) {
    if (isInside(dir, store.root) || isInside(dir, from)) return fail(`${name} must be outside the store and the --from folder`);
  }
  let scan;
  try {
    scan = await loadScanner();
  } catch {
    return fail("the injection scanner could not be loaded (needs Node 22.18 or newer, which runs .ts files); nothing was ingested");
  }
  let plan;
  try {
    plan = planIngest({ from, store, into: opts.into, scan, allowFlagged: opts.allowFlagged, defaults: { type: opts.type, licence: opts.licence, origin: opts.origin, tenant: opts.tenant } });
  } catch (error) {
    return fail(error.message);
  }
  const { summary } = reportOf(plan);
  console.log(`${summary.files} file(s): ${summary.wouldWrite} to write, ${summary.quarantined} quarantined, ${summary.duplicate} duplicate, ${summary.lintFailed} failed lint, ${summary.exists} already there, ${summary.skipped} skipped.`);
  if (plan.blocked) console.log("BLOCKED: some files are not downloaded from iCloud or a folder is unreadable. Fix that and run again.");
  mkdirSync(out, { recursive: true });
  const reportPath = path.join(out, "ingest-report.json");
  if (!opts.apply || plan.blocked) {
    writeFileSync(reportPath, JSON.stringify(reportOf(plan), null, 2));
    console.log(`Report (paths, outcomes and rule names only): ${reportPath}`);
    if (plan.blocked && opts.apply) process.exitCode = 2;
    else if (!opts.apply) console.log("Dry run: nothing written. Add --apply to write pages and copy quarantined files out.");
    return;
  }
  try {
    const result = applyIngest({ plan, quarantineDir });
    writeFileSync(reportPath, JSON.stringify(reportOf(plan), null, 2));
    console.log(`Wrote ${result.written} page(s); ${result.quarantined} file(s) copied to quarantine ${quarantineDir}.`);
  } catch (error) {
    console.error(`ingest failed (${error?.cause?.code ?? error?.message}); ${error?.rolledBack ?? 0} page(s) written in this run were removed.`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("/knowledge-unify/ingest.mjs")) {
  main(process.argv.slice(2)).catch((error) => fail(error?.message ?? String(error)));
}
