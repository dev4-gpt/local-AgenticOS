#!/usr/bin/env node
// Applies APPROVED duplicate decisions. It only adds frontmatter markers:
//   duplicate_of: "<keeper>"   on each duplicate
//   supersedes: ["<dup>", ...] on the keeper
// It never deletes, moves or renames a note, and never rewrites links. Dry run unless --apply is given.
// Every write is a temp file renamed into place. If one write fails, the files already changed are restored
// from the original text and the log is written either way.
// Usage: node scripts/knowledge-unify/apply.mjs --report FILE --decisions FILE [--backup-dir DIR] [--apply]
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { assertSchema } from "./dedupe-report.mjs";
import { isInside, resolveReal, sha256Hex } from "./scan.mjs";

/** Absolute path of a regular file inside the store, or null. Symlinks and escapes are refused. */
function safeAbs(root, rel) {
  if (typeof rel !== "string" || rel === "" || path.isAbsolute(rel) || rel.split("/").includes("..")) return null;
  try {
    const realRoot = realpathSync(root);
    const abs = path.resolve(realRoot, rel);
    if (abs === realRoot || !isInside(abs, realRoot)) return null;
    const stat = lstatSync(abs);
    if (stat.isSymbolicLink() || !stat.isFile()) return null;
    return isInside(realpathSync(path.dirname(abs)), realRoot) ? abs : null;
  } catch {
    return null;
  }
}

function ref(target, from) {
  return target.root === from.root ? target.rel : `${target.root}:${target.rel}`;
}

function markerFor(member, keeper, losers) {
  if (member.key === keeper.key) return { key: "supersedes", value: JSON.stringify(losers.map((loser) => ref(loser, keeper))) };
  return { key: "duplicate_of", value: JSON.stringify(ref(keeper, member)) };
}

/** Inserts "key: value" into the frontmatter, or creates a frontmatter block. Body bytes are untouched. */
export function addFrontmatterLine(raw, key, value) {
  const bom = raw.startsWith("﻿") ? "﻿" : "";
  const text = bom ? raw.slice(1) : raw;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const line = `${key}: ${value}`;
  const match = /^---\r?\n(?:([\s\S]*?)\r?\n)?---(?=\r?\n|$)/.exec(text);
  if (!match) return { text: `${bom}---${eol}${line}${eol}---${eol}${text}`, status: "added" };
  const block = match[1];
  if (block !== undefined && new RegExp(`^${key}:`, "m").test(block)) {
    const same = block.split(/\r?\n/).some((existing) => existing.trim() === line);
    return { text: raw, status: same ? "already-applied" : "key-exists" };
  }
  if (block === undefined) return { text: `${bom}---${eol}${line}${eol}---${text.slice(match[0].length)}`, status: "added" };
  const closeAt = match[0].length - 3;
  const eolBefore = text.slice(closeAt - 2, closeAt) === "\r\n" ? 2 : 1;
  const insertAt = closeAt - eolBefore;
  return { text: `${bom}${text.slice(0, insertAt)}${eol}${line}${text.slice(insertAt)}`, status: "added" };
}

function readStaged(report, member) {
  const root = report.stores[member.root];
  const abs = root ? safeAbs(root, member.rel) : null;
  if (!abs) return { reason: "unsafe-or-unknown-path" };
  let buffer;
  try {
    buffer = readFileSync(abs);
  } catch {
    return { reason: "unreadable" };
  }
  const raw = buffer.toString("utf8");
  if (!Buffer.from(raw, "utf8").equals(buffer)) return { reason: "not-utf8" };
  return { abs, raw };
}

export function planApply({ report, decisions }) {
  assertSchema(report, "report");
  assertSchema(decisions, "decisions");
  const skipped = [];
  const edits = new Map();
  if (report.blockers?.length) {
    return { edits, skipped: [{ reason: "blocked-by-report", detail: report.blockers.join("; ") }], blocked: true };
  }
  const clusters = new Map(report.clusters.map((cluster) => [cluster.id, cluster]));
  for (const [id, decision] of Object.entries(decisions.decisions ?? {})) {
    if (decision?.action !== "mark-duplicates") continue;
    const cluster = clusters.get(id);
    if (!cluster) {
      skipped.push({ id, reason: "unknown-cluster" });
      continue;
    }
    const keeper = cluster.members.find((member) => member.key === decision.keeper);
    if (!keeper) {
      skipped.push({ id, reason: "keeper-not-in-cluster" });
      continue;
    }
    const losers = cluster.members.filter((member) => member.key !== keeper.key);
    const staged = [];
    let failure = null;
    for (const member of cluster.members) {
      const read = readStaged(report, member);
      if (read.reason) {
        failure = { id, key: member.key, reason: read.reason };
        break;
      }
      const marker = markerFor(member, keeper, losers);
      if (sha256Hex(read.raw) !== member.fileSha256) {
        if (addFrontmatterLine(read.raw, marker.key, marker.value).status === "already-applied") {
          staged.push({ done: true });
          continue;
        }
        failure = { id, key: member.key, reason: "changed-since-scan" };
        break;
      }
      try {
        accessSync(read.abs, constants.W_OK);
      } catch {
        failure = { id, key: member.key, reason: "not-writable" };
        break;
      }
      staged.push({ member, marker, abs: read.abs, raw: read.raw, done: false });
    }
    if (failure) {
      skipped.push(failure);
      continue;
    }
    const pending = staged.filter((item) => !item.done);
    if (pending.length === 0) {
      skipped.push({ id, reason: "already-applied" });
      continue;
    }
    for (const { member, marker, abs, raw } of pending) {
      const result = addFrontmatterLine(edits.get(abs)?.updated ?? raw, marker.key, marker.value);
      if (result.status !== "added") {
        skipped.push({ id, key: member.key, reason: result.status });
        continue;
      }
      edits.set(abs, { root: member.root, rel: member.rel, abs, original: edits.get(abs)?.original ?? raw, updated: result.text });
    }
  }
  return { edits, skipped, blocked: false };
}

function atomicWrite(abs, text) {
  const tmp = `${abs}.ku-tmp-${process.pid}-${Date.now()}`;
  const mode = statSync(abs).mode & 0o777;
  try {
    writeFileSync(tmp, text, { flag: "wx" });
    chmodSync(tmp, mode);
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

export function applyPlan({ plan, backupRoot, stamp }) {
  const dir = path.join(backupRoot, stamp);
  for (const edit of plan.edits.values()) {
    const dest = path.join(dir, edit.root, ...edit.rel.split("/"));
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, edit.original, { flag: "wx" });
    if (sha256Hex(readFileSync(dest, "utf8")) !== sha256Hex(edit.original)) throw new Error("backup_verify_failed");
  }
  const log = { appliedAt: new Date().toISOString(), status: "applied", changed: [], restored: [], restoreFailures: [], skipped: plan.skipped };
  const written = [];
  let failure = null;
  try {
    for (const edit of plan.edits.values()) {
      atomicWrite(edit.abs, edit.updated);
      written.push(edit);
      log.changed.push({ root: edit.root, rel: edit.rel });
    }
  } catch (error) {
    failure = error;
    log.status = "failed";
    log.error = error?.code ?? error?.message ?? String(error);
    for (const edit of written.reverse()) {
      try {
        atomicWrite(edit.abs, edit.original);
        log.restored.push({ root: edit.root, rel: edit.rel });
      } catch (restoreError) {
        log.restoreFailures.push({ root: edit.root, rel: edit.rel, error: restoreError?.code ?? String(restoreError) });
      }
    }
    log.changed = log.restoreFailures.map(({ root, rel }) => ({ root, rel }));
  }
  writeFileSync(path.join(dir, "apply-log.json"), JSON.stringify(log, null, 2));
  if (failure) throw Object.assign(new Error("apply_failed"), { cause: failure, log, backupDir: dir });
  return { backupDir: dir, changed: log.changed.length, log };
}

function fail(message) {
  console.error(`knowledge-unify apply: ${message}`);
  process.exitCode = 2;
}

function main(argv) {
  let reportPath = "";
  let decisionsPath = "";
  let backupDir = "";
  let doApply = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--report") reportPath = argv[++i] ?? "";
    else if (argv[i] === "--decisions") decisionsPath = argv[++i] ?? "";
    else if (argv[i] === "--backup-dir") backupDir = argv[++i] ?? "";
    else if (argv[i] === "--apply") doApply = true;
    else return fail(`unknown argument ${argv[i]}`);
  }
  if (!existsSync(reportPath) || !existsSync(decisionsPath)) return fail("--report and --decisions must point to existing files");
  let report;
  let decisions;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
    decisions = JSON.parse(readFileSync(decisionsPath, "utf8"));
    assertSchema(report, "report");
    assertSchema(decisions, "decisions");
  } catch {
    return fail("report or decisions file is invalid or from an older version; run scan.mjs and dedupe-report.mjs again");
  }
  const backupRoot = resolveReal(backupDir || path.join(path.dirname(path.resolve(decisionsPath)), "backups"));
  if (Object.values(report.stores).some((root) => isInside(backupRoot, root))) return fail("--backup-dir must be outside every store folder");
  const plan = planApply({ report, decisions });
  if (plan.blocked) {
    console.log(`BLOCKED: ${plan.skipped[0].detail}`);
    if (doApply) process.exitCode = 2;
    return;
  }
  console.log(`${plan.edits.size} note(s) would change; ${plan.skipped.length} decision(s) skipped.`);
  for (const item of plan.skipped) console.log(`  skipped ${item.id}${item.key ? ` ${item.key}` : ""}: ${item.reason}`);
  if (!doApply) {
    console.log("Dry run: nothing written. Add --apply to back up and write the markers.");
    return;
  }
  if (plan.edits.size === 0) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    const result = applyPlan({ plan, backupRoot, stamp });
    console.log(`Changed ${result.changed} note(s). Backup of the originals: ${result.backupDir}`);
  } catch (error) {
    const log = error?.log;
    console.error(`apply failed (${log?.error ?? error?.message}). Restored ${log?.restored?.length ?? 0} note(s); ${log?.restoreFailures?.length ?? 0} could not be restored.`);
    console.error(`Log and backups: ${error?.backupDir ?? backupRoot}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("/knowledge-unify/apply.mjs")) {
  main(process.argv.slice(2));
}
