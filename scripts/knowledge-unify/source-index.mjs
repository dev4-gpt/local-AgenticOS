#!/usr/bin/env node
// Reverse index from each note's `sources` list to the notes that cite it, and the source-deletion cascade.
// Deleting a source means: every note built only from it (directly or through other derived notes) goes too.
//   build    writes source-index.json (paths, keys and statuses only, never note text).
//   cascade  plans the removal of notes derived from --source REF. Dry run unless --apply is given.
// The cascade never touches the source itself (removing it is your own act), and it is blocked when any note
// could not be read, because a note we could not see might be derived from the source.
// A note that still has a source left after the deletion is listed for review and kept, unless --partial delete.
// Usage:
//   node scripts/knowledge-unify/source-index.mjs build   --store L=PATH [--out DIR]
//   node scripts/knowledge-unify/source-index.mjs cascade --store L=PATH --source REF [--partial review|delete]
//        [--apply (--backup-dir DIR | --erase-no-backup)]
// REF is a URL, "label:path/inside/store" or an absolute file path.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeAbs } from "./apply.mjs";
import { checkPage, parseStoreArgs } from "./schema-check.mjs";
import { canonicalUrl, isInside, listMarkdown, parseNote, resolveReal, sha256Hex } from "./scan.mjs";
import { folderGate, thisDevice } from "./writer-claim.mjs";

const stripMd = (rel) => rel.replace(/\.md$/i, "");

/**
 * One comparable key per reference. URLs are cleaned like the duplicate tools do. A plain relative path means
 * "inside the same store as the citing note"; "label:path" names another store; an absolute path is outside every store.
 * Case is ignored for files (macOS volumes are case-insensitive). Returns "" for an unusable reference.
 */
export function resolveRef(ref, ownLabel, labels) {
  if (typeof ref !== "string") return "";
  let text = ref.trim();
  const wiki = /^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/.exec(text);
  if (wiki) text = wiki[1].trim();
  if (text === "" || /[[\]]/.test(text)) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    const url = canonicalUrl(text);
    return url ? `url:${url}` : "";
  }
  text = text.replace(/^file:/i, "").replace(/\\/g, "/");
  // Checked before normalising, which would quietly fold "a/../b" into "b" and hide the climb.
  if (text.split("/").includes("..")) return "";
  let label = ownLabel;
  const qualified = /^([A-Za-z0-9][A-Za-z0-9-]*):(?!\/)(.+)$/.exec(text);
  if (qualified && labels.has(qualified[1])) {
    label = qualified[1];
    text = qualified[2];
  } else if (text.startsWith("/")) {
    const abs = path.posix.normalize(text);
    return abs.split("/").includes("..") ? "" : `abs:${stripMd(abs).toLowerCase()}`;
  }
  const rel = path.posix.normalize(text.replace(/^\.\//, ""));
  if (rel === "." || rel === ".." || rel.startsWith("../") || rel.startsWith("/")) return "";
  return `file:${label}:${stripMd(rel).toLowerCase()}`;
}

export function pageId(label, rel) {
  return `file:${label}:${stripMd(rel).toLowerCase()}`;
}

export function buildSourceIndex(stores) {
  const labels = new Set(stores.map((store) => store.label));
  const pages = new Map();
  const bySource = new Map();
  const blockers = [];
  for (const { label, root } of stores) {
    for (const rel of listMarkdown(root, (item) => blockers.push({ root: label, ...item }))) {
      let raw;
      try {
        raw = readFileSync(path.join(root, rel), "utf8");
      } catch {
        blockers.push({ root: label, rel, reason: "unreadable" });
        continue;
      }
      const { meta, body } = parseNote(raw);
      const cited = Array.isArray(meta.sources) ? meta.sources : typeof meta.sources === "string" && meta.sources ? [meta.sources] : [];
      const sourceKeys = [...new Set(cited.map((ref) => resolveRef(ref, label, labels)).filter(Boolean))];
      const key = `${label}::${rel}`;
      pages.set(key, { key, root: label, rel, id: pageId(label, rel), status: checkPage(meta, body).status, sourceKeys, fileSha256: sha256Hex(raw) });
      for (const source of sourceKeys) {
        if (!bySource.has(source)) bySource.set(source, new Set());
        bySource.get(source).add(key);
      }
    }
  }
  return { pages, bySource, blockers };
}

export function indexToJson(index) {
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    pages: [...index.pages.values()].map(({ key, root, rel, status, sourceKeys }) => ({ key, root, rel, status, sourceKeys })),
    bySource: Object.fromEntries([...index.bySource].map(([source, keys]) => [source, [...keys].sort()])),
    blockers: index.blockers,
  };
}

/**
 * Notes to delete once `sourceKeys` are gone. Runs to a fixed point: a deleted note is itself a deleted source for
 * the notes that cite it. partial "review" keeps a note that still has another source and lists it; "delete" removes it.
 */
export function planCascade(index, sourceKeys, { partial = "review" } = {}) {
  if (partial !== "review" && partial !== "delete") throw new Error("partial must be review or delete");
  const gone = new Set(sourceKeys);
  const roots = new Set(sourceKeys);
  const doomed = new Map();
  for (let changed = true; changed; ) {
    changed = false;
    for (const page of index.pages.values()) {
      if (doomed.has(page.key) || roots.has(page.id)) continue;
      const via = page.sourceKeys.filter((source) => gone.has(source));
      if (via.length === 0) continue;
      if (partial === "delete" || via.length === page.sourceKeys.length) {
        doomed.set(page.key, { key: page.key, root: page.root, rel: page.rel, fileSha256: page.fileSha256, via });
        gone.add(page.id);
        changed = true;
      }
    }
  }
  const review = [];
  for (const page of index.pages.values()) {
    if (doomed.has(page.key) || roots.has(page.id)) continue;
    const via = page.sourceKeys.filter((source) => gone.has(source));
    if (via.length > 0) review.push({ key: page.key, root: page.root, rel: page.rel, via, remaining: page.sourceKeys.filter((s) => !gone.has(s)) });
  }
  return { delete: [...doomed.values()], review, blocked: index.blockers.length > 0, blockers: index.blockers };
}

/** Planned deletions that sit in a folder claimed by another device. Those are skipped, never deleted. */
export function foreignKeys(stores, plan, { device = thisDevice(), takeOver = false } = {}) {
  const rootOf = Object.fromEntries(stores.map((store) => [store.label, store.root]));
  return plan.delete.filter((item) => {
    const root = rootOf[item.root];
    return !folderGate(root, path.dirname(path.join(root, item.rel)), { device, takeOver }).ok;
  });
}

/** Deletes the planned notes. Originals are copied to backupRoot first (null = erase with no copy). */
export function applyCascade({ stores, plan, backupRoot, stamp, device = thisDevice(), takeOver = false }) {
  if (plan.blocked) throw Object.assign(new Error("blocked"), { blockers: plan.blockers });
  const rootOf = Object.fromEntries(stores.map((store) => [store.label, store.root]));
  const log = { appliedAt: new Date().toISOString(), deleted: [], skipped: [], failed: [] };
  const staged = [];
  const foreign = new Set(foreignKeys(stores, plan, { device, takeOver }).map((item) => item.key));
  for (const item of plan.delete) {
    if (foreign.has(item.key)) {
      log.skipped.push({ key: item.key, reason: "folder-owned-by-other-device" });
      continue;
    }
    const abs = safeAbs(rootOf[item.root], item.rel);
    let raw = null;
    try {
      raw = abs ? readFileSync(abs, "utf8") : null;
    } catch {
      raw = null;
    }
    if (raw === null) log.skipped.push({ key: item.key, reason: "unsafe-or-unreadable" });
    else if (sha256Hex(raw) !== item.fileSha256) log.skipped.push({ key: item.key, reason: "changed-since-index" });
    else staged.push({ item, abs, raw });
  }
  const dir = backupRoot ? path.join(backupRoot, stamp) : null;
  if (dir) {
    for (const { item, raw } of staged) {
      const dest = path.join(dir, item.root, ...item.rel.split("/"));
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, raw, { flag: "wx" });
      if (sha256Hex(readFileSync(dest, "utf8")) !== sha256Hex(raw)) throw new Error("backup_verify_failed");
    }
  }
  for (const { item, abs } of staged) {
    try {
      unlinkSync(abs);
      log.deleted.push({ key: item.key, via: item.via });
    } catch (error) {
      log.failed.push({ key: item.key, error: error?.code ?? String(error) });
    }
  }
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "cascade-log.json"), JSON.stringify(log, null, 2));
  }
  return { backupDir: dir, log };
}

function fail(message) {
  console.error(`knowledge-unify source-index: ${message}`);
  process.exitCode = 2;
}

function main(argv) {
  const [command, ...args] = argv;
  if (command !== "build" && command !== "cascade") return fail("first argument must be build or cascade");
  let parsed;
  try {
    parsed = parseStoreArgs(args, "source-index");
  } catch (error) {
    return fail(error.message);
  }
  const { stores } = parsed;
  const opts = { out: path.join(os.tmpdir(), "knowledge-unify"), source: "", partial: "review", backupDir: "", apply: false, erase: false, device: thisDevice(), takeOver: false };
  for (let i = 0; i < parsed.rest.length; i += 1) {
    const arg = parsed.rest[i];
    if (arg === "--device") opts.device = parsed.rest[++i] ?? "";
    else if (arg === "--take-over") opts.takeOver = true;
    else if (arg === "--out") opts.out = parsed.rest[++i] ?? "";
    else if (arg === "--source") opts.source = parsed.rest[++i] ?? "";
    else if (arg === "--partial") opts.partial = parsed.rest[++i] ?? "";
    else if (arg === "--backup-dir") opts.backupDir = parsed.rest[++i] ?? "";
    else if (arg === "--apply") opts.apply = true;
    else if (arg === "--erase-no-backup") opts.erase = true;
    else return fail(`unknown argument ${arg}`);
  }
  const outside = (dir) => !stores.some((store) => isInside(dir, store.root));
  const index = buildSourceIndex(stores);
  if (command === "build") {
    const out = resolveReal(opts.out);
    if (!outside(out)) return fail("--out must be outside every store folder");
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, "source-index.json"), JSON.stringify(indexToJson(index), null, 2));
    console.log(`Indexed ${index.pages.size} notes, ${index.bySource.size} distinct sources, ${index.blockers.length} unreadable.`);
    if (index.blockers.length > 0) console.log("WARNING: some notes could not be read, so the index is incomplete and a cascade will refuse to run.");
    console.log(`Index (paths and keys only): ${path.join(out, "source-index.json")}`);
    return;
  }
  const labels = new Set(stores.map((store) => store.label));
  const key = resolveRef(opts.source, stores[0].label, labels);
  if (!key) return fail("--source needs a URL, label:path or absolute file path");
  if (opts.partial !== "review" && opts.partial !== "delete") return fail("--partial must be review or delete");
  const plan = planCascade(index, [key], { partial: opts.partial });
  if (plan.blocked) {
    console.log(`BLOCKED: ${plan.blockers.length} note(s) could not be read (${[...new Set(plan.blockers.map((b) => b.reason))].join(", ")}). Fix that and run again.`);
    if (opts.apply) process.exitCode = 2;
    return;
  }
  console.log(`${plan.delete.length} note(s) derived from the source would be deleted; ${plan.review.length} still have another source (kept, review them).`);
  for (const item of plan.delete) console.log(`  delete ${item.key}`);
  for (const item of plan.review) console.log(`  review ${item.key} (still cites ${item.remaining.length} other source(s))`);
  const foreign = foreignKeys(stores, plan, { device: opts.device, takeOver: opts.takeOver });
  if (foreign.length > 0) console.log(`WARNING: ${foreign.length} of these note(s) are in folders claimed by another device and will be skipped (use --take-over only if that device has stopped).`);
  if (!opts.apply) {
    console.log("Dry run: nothing deleted. Add --apply with --backup-dir DIR (or --erase-no-backup) to delete.");
    return;
  }
  if (!opts.backupDir && !opts.erase) return fail("--apply needs --backup-dir DIR or --erase-no-backup");
  if (opts.backupDir && opts.erase) return fail("use either --backup-dir or --erase-no-backup, not both");
  const backupRoot = opts.backupDir ? resolveReal(opts.backupDir) : null;
  if (backupRoot && !outside(backupRoot)) return fail("--backup-dir must be outside every store folder");
  if (plan.delete.length === 0) return;
  try {
    const result = applyCascade({ stores, plan, backupRoot, stamp: new Date().toISOString().replace(/[:.]/g, "-"), device: opts.device, takeOver: opts.takeOver });
    console.log(`Deleted ${result.log.deleted.length}, skipped ${result.log.skipped.length}, failed ${result.log.failed.length}.`);
    if (result.backupDir && existsSync(result.backupDir)) console.log(`Originals and log: ${result.backupDir}`);
    if (result.log.failed.length > 0 || result.log.skipped.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`cascade failed before deleting (${error?.message}).`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("/knowledge-unify/source-index.mjs")) {
  main(process.argv.slice(2));
}
