#!/usr/bin/env node
// Repair PLAN for typed pages that fail the shared-page check (ADR-024 addendum). Read-only: it never writes to a store.
// It proposes only fixes that are fully determined by the page itself, and proposes them for a page only if the page would
// then pass the WHOLE check. It never invents provenance, a licence, a date, a type or a title.
//   sha256-missing          -> the hash of the page's own body (the same hash the check uses)
//   canonical-url-missing   -> the cleaned first http(s) entry in `sources`, for `source` pages only
//   sources-not-list        -> the existing single string wrapped as a list
// Everything else stays as it is and is counted by rule name, so a person can decide. The report holds paths and rule
// names only, never page text. --out must be outside every store.
// Usage: node scripts/knowledge-unify/repair.mjs plan --store label=path [--out DIR]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { addFrontmatterLine, applyPlan, safeAbs } from "./apply.mjs";
import { folderGate, thisDevice } from "./writer-claim.mjs";
import { bodyHash, checkPage, parseStoreArgs, usableReference } from "./schema-check.mjs";
import { canonicalBody, canonicalUrl, isInside, listMarkdown, parseNote, resolveReal, sha256Hex } from "./scan.mjs";

/** The patch that would be applied to a page's metadata, or an empty object. Pure: no I/O. */
export function proposePatch(meta, body) {
  const patch = {};
  if (typeof meta.sha256 !== "string" || meta.sha256 === "") {
    if (canonicalBody(body) !== "") patch.sha256 = bodyHash(body);
  }
  if (typeof meta.sources === "string" && usableReference(meta.sources)) patch.sources = [meta.sources.trim()];
  const type = typeof meta.type === "string" ? meta.type.trim() : "";
  if (type === "source" && (typeof meta.canonical_url !== "string" || meta.canonical_url === "")) {
    const list = patch.sources ?? (Array.isArray(meta.sources) ? meta.sources : []);
    const first = list.find((value) => typeof value === "string" && /^https?:\/\//i.test(value.trim()));
    const clean = first ? canonicalUrl(first.trim()) : "";
    if (clean) patch.canonical_url = clean;
  }
  return patch;
}

export function planRepair(stores) {
  const items = [];
  const remaining = Object.create(null);
  for (const { label, root } of stores) {
    for (const rel of listMarkdown(root, () => {})) {
      let raw;
      try {
        raw = readFileSync(path.join(root, rel), "utf8");
      } catch {
        continue;
      }
      const { meta, body } = parseNote(raw);
      const before = checkPage(meta, body);
      if (before.status !== "invalid") continue;
      const patch = proposePatch(meta, body);
      const after = checkPage({ ...meta, ...patch }, body);
      if (after.status === "shared-ok") {
        items.push({ root: label, rel, outcome: "repairable", fixes: Object.keys(patch).sort() });
      } else {
        items.push({ root: label, rel, outcome: "needs-a-person", blocking: after.problems });
        for (const problem of after.problems) remaining[problem] = (remaining[problem] ?? 0) + 1;
      }
    }
  }
  const count = (outcome) => items.filter((item) => item.outcome === outcome).length;
  return { items, summary: { invalid: items.length, repairable: count("repairable"), needsAPerson: count("needs-a-person"), blockingRules: remaining } };
}

// Only these two additions are written. A fix list with anything else (a wrapped `sources`) is left for a person.
const WRITABLE = new Set(["canonical_url", "sha256"]);
const YAML_URL = (value) => (/^[A-Za-z0-9:/._~%+=&?#@!$()*,;-]+$/.test(value) && !/^[&*!|>'"%@`#]/.test(value) ? value : JSON.stringify(value));

/**
 * Builds the exact edits (original and updated text) for the repairable pages. Writes nothing. A page is skipped, with a
 * reason, if its patch is not one of the two writable additions, a key already exists, the folder is claimed by another
 * device, the file cannot be opened safely, or the updated page would not pass the whole check.
 */
export function planRepairEdits(stores, { device = thisDevice() } = {}) {
  const edits = new Map();
  const skipped = [];
  for (const item of planRepair(stores).items) {
    if (item.outcome !== "repairable") continue;
    const store = stores.find((candidate) => candidate.label === item.root);
    const skip = (reason) => skipped.push({ root: item.root, rel: item.rel, reason });
    if (!item.fixes.every((fix) => WRITABLE.has(fix))) { skip("needs-manual-edit"); continue; }
    const abs = safeAbs(store.root, item.rel);
    if (!abs) { skip("unsafe-path"); continue; }
    if (!folderGate(store.root, path.dirname(abs), { device }).ok) { skip("folder-claimed-by-other-device"); continue; }
    const original = readFileSync(abs, "utf8");
    const { meta, body } = parseNote(original);
    const patch = proposePatch(meta, body);
    let updated = original;
    let failed = false;
    for (const key of ["sha256", "canonical_url"]) {
      if (patch[key] === undefined) continue;
      const result = addFrontmatterLine(updated, key, YAML_URL(patch[key]));
      if (result.status !== "added") failed = true;
      updated = result.text;
    }
    if (failed) { skip("key-already-present"); continue; }
    const check = parseNote(updated);
    if (checkPage(check.meta, check.body).status !== "shared-ok") { skip("would-still-fail"); continue; }
    if (check.body !== body) { skip("body-would-change"); continue; }
    edits.set(`${item.root}::${item.rel}`, { key: `${item.root}::${item.rel}`, root: item.root, rel: item.rel, abs, original, updated, originalSha256: sha256Hex(original) });
  }
  return { edits, skipped };
}

function main() {
  const [command, ...argv] = process.argv.slice(2);
  const { stores, rest } = parseStoreArgs(argv, "repair");
  if (command !== "plan" && command !== "apply") throw new Error("usage: repair.mjs plan|apply --store label=path [--out DIR] [--backup-dir DIR] [--apply]");
  if (command === "apply") return mainApply(stores, rest);
  const outIndex = rest.indexOf("--out");
  const plan = planRepair(stores);
  console.log(JSON.stringify(plan.summary, null, 1));
  if (outIndex > -1) {
    const out = resolveReal(rest[outIndex + 1] ?? "");
    if (stores.some((store) => isInside(out, store.root))) throw new Error("--out must be outside every store");
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, "repair-plan.json"), JSON.stringify(plan, null, 1), { mode: 0o600 });
  }
  console.log("Plan only: nothing was written to any store.");
}

/** Re-reads every file just before writing; a page that changed since planning is dropped, never overwritten. */
export function applyRepair({ plan, backupRoot, stamp }) {
  const edits = new Map();
  const skipped = [...plan.skipped];
  for (const [key, edit] of plan.edits) {
    let now = "";
    try {
      now = sha256Hex(readFileSync(edit.abs, "utf8"));
    } catch {
      /* unreadable now: treated as changed */
    }
    if (now === edit.originalSha256) edits.set(key, edit);
    else skipped.push({ root: edit.root, rel: edit.rel, reason: "changed-since-plan" });
  }
  if (edits.size === 0) return { backupDir: "", changed: 0, log: { status: "nothing-to-do", changed: [], skipped } };
  return applyPlan({ plan: { edits, skipped }, backupRoot, stamp });
}

function mainApply(stores, rest) {
  const at = rest.indexOf("--backup-dir");
  const backupRoot = resolveReal(at > -1 ? (rest[at + 1] ?? "") : "");
  if (at < 0 || !rest[at + 1]) throw new Error("apply needs --backup-dir DIR (outside every store)");
  if (stores.some((store) => isInside(backupRoot, store.root))) throw new Error("--backup-dir must be outside every store");
  const plan = planRepairEdits(stores);
  console.log(JSON.stringify({ would_change: plan.edits.size, skipped: plan.skipped.length, skipReasons: plan.skipped.reduce((acc, item) => ({ ...acc, [item.reason]: (acc[item.reason] ?? 0) + 1 }), {}) }, null, 1));
  if (!rest.includes("--apply")) return console.log("Dry run: nothing written. Add --apply to write the changes (originals are backed up first).");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const result = applyRepair({ plan, backupRoot, stamp });
  console.log(`Changed ${result.changed} page(s). Backup of the originals: ${result.backupDir}`);
}

if (process.argv[1]?.endsWith("/knowledge-unify/repair.mjs")) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
