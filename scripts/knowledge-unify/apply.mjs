#!/usr/bin/env node
// Applies APPROVED duplicate decisions. It only adds frontmatter markers:
//   duplicate_of: "<keeper>"   on each duplicate
//   supersedes: ["<dup>", ...] on the keeper
// It never deletes, moves or renames a note, and never rewrites links. Dry run unless --apply is given.
// Usage: node scripts/knowledge-unify/apply.mjs --report FILE --decisions FILE [--backup-dir DIR] [--apply]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isInside, sha256Hex } from "./scan.mjs";

function safeAbs(root, rel) {
  if (typeof rel !== "string" || rel === "" || path.isAbsolute(rel) || rel.split("/").includes("..")) return null;
  const abs = path.resolve(root, rel);
  return isInside(abs, root) && abs !== path.resolve(root) ? abs : null;
}

function ref(target, from) {
  return target.root === from.root ? target.rel : `${target.root}:${target.rel}`;
}

/** Inserts "key: value" into the frontmatter, or creates a frontmatter block. Body bytes are untouched. */
export function addFrontmatterLine(raw, key, value) {
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const line = `${key}: ${value}`;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/.exec(raw);
  if (!match) return { text: `---${eol}${line}${eol}---${eol}${raw}`, status: "added" };
  if (new RegExp(`^${key}:`, "m").test(match[1])) {
    const same = match[1].split(/\r?\n/).some((existing) => existing.trim() === line);
    return { text: raw, status: same ? "already-applied" : "key-exists" };
  }
  const closeAt = match.index + match[0].length - 3;
  const eolBefore = raw.slice(closeAt - 2, closeAt) === "\r\n" ? 2 : 1;
  const insertAt = closeAt - eolBefore;
  return { text: `${raw.slice(0, insertAt)}${eol}${line}${raw.slice(insertAt)}`, status: "added" };
}

export function planApply({ report, decisions }) {
  const skipped = [];
  const edits = new Map();
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
    let ok = true;
    for (const member of cluster.members) {
      const root = report.stores[member.root];
      const abs = root ? safeAbs(root, member.rel) : null;
      if (!abs) {
        skipped.push({ id, key: member.key, reason: "unsafe-or-unknown-path" });
        ok = false;
        break;
      }
      let buffer;
      try {
        buffer = readFileSync(abs);
      } catch {
        skipped.push({ id, key: member.key, reason: "unreadable" });
        ok = false;
        break;
      }
      const raw = buffer.toString("utf8");
      if (!Buffer.from(raw, "utf8").equals(buffer)) {
        skipped.push({ id, key: member.key, reason: "not-utf8" });
        ok = false;
        break;
      }
      if (sha256Hex(raw) !== member.fileSha256) {
        skipped.push({ id, key: member.key, reason: "changed-since-scan" });
        ok = false;
        break;
      }
      staged.push({ member, abs, raw });
    }
    if (!ok) continue;
    for (const { member, abs, raw } of staged) {
      const working = edits.get(abs)?.updated ?? raw;
      const isKeeper = member.key === keeper.key;
      const result = isKeeper
        ? addFrontmatterLine(working, "supersedes", JSON.stringify(losers.map((loser) => ref(loser, keeper))))
        : addFrontmatterLine(working, "duplicate_of", JSON.stringify(ref(keeper, member)));
      if (result.status !== "added") {
        skipped.push({ id, key: member.key, reason: result.status });
        continue;
      }
      edits.set(abs, {
        root: member.root,
        rel: member.rel,
        abs,
        original: edits.get(abs)?.original ?? raw,
        updated: result.text,
      });
    }
  }
  return { edits, skipped };
}

export function applyPlan({ plan, backupRoot, stamp }) {
  const dir = path.join(backupRoot, stamp);
  for (const edit of plan.edits.values()) {
    const dest = path.join(dir, edit.root, ...edit.rel.split("/"));
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, edit.original, { flag: "wx" });
    if (sha256Hex(readFileSync(dest, "utf8")) !== sha256Hex(edit.original)) throw new Error("backup_verify_failed");
  }
  for (const edit of plan.edits.values()) writeFileSync(edit.abs, edit.updated);
  const log = {
    appliedAt: new Date().toISOString(),
    changed: [...plan.edits.values()].map((edit) => ({ root: edit.root, rel: edit.rel })),
    skipped: plan.skipped,
  };
  writeFileSync(path.join(dir, "apply-log.json"), JSON.stringify(log, null, 2));
  return { backupDir: dir, changed: log.changed.length };
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
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const decisions = JSON.parse(readFileSync(decisionsPath, "utf8"));
  const backupRoot = path.resolve(backupDir || path.join(path.dirname(path.resolve(decisionsPath)), "backups"));
  if (Object.values(report.stores).some((root) => isInside(backupRoot, root))) return fail("--backup-dir must be outside every store folder");
  const plan = planApply({ report, decisions });
  console.log(`${plan.edits.size} note(s) would change; ${plan.skipped.length} decision(s) skipped.`);
  for (const item of plan.skipped) console.log(`  skipped ${item.id}${item.key ? ` ${item.key}` : ""}: ${item.reason}`);
  if (!doApply) {
    console.log("Dry run: nothing written. Add --apply to back up and write the markers.");
    return;
  }
  if (plan.edits.size === 0) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const result = applyPlan({ plan, backupRoot, stamp });
  console.log(`Changed ${result.changed} note(s). Backup of the originals: ${result.backupDir}`);
}

if (process.argv[1]?.endsWith("/knowledge-unify/apply.mjs")) {
  main(process.argv.slice(2));
}
