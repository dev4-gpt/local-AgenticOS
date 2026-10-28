#!/usr/bin/env node
// Review quarantined files (S-3). Ingest copies a file the injection scanner stopped into a folder outside every
// store and records why in manifest.json (rule names and counts, never text). This command is the human step after:
//   list     what is there: id, original name, verdict, rules, and whether the file still matches its id.
//   release  copies a FLAGGED file you have read and judged fine into a staging folder, ready for
//            `ingest.mjs --from <staging> --allow-flagged`. A BLOCKED file is never released: edit the original and
//            ingest it again. A file that no longer matches its id (changed since it was quarantined) is refused.
//   discard  deletes a quarantined file and marks it discarded in the manifest.
// Dry run unless --apply is given. Nothing here reads a store or prints file text.
// Usage: node scripts/knowledge-unify/quarantine.mjs list    --quarantine DIR
//        node scripts/knowledge-unify/quarantine.mjs release --quarantine DIR --id ID --to DIR [--apply]
//        node scripts/knowledge-unify/quarantine.mjs discard --quarantine DIR --id ID [--apply]
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isInside, resolveReal, sha256Hex } from "./scan.mjs";

const ID = /^[0-9a-f]{16}$/;

export function readManifest(dir) {
  try {
    const parsed = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
    if (parsed?.schema === 1 && parsed.entries && typeof parsed.entries === "object") return parsed;
  } catch {
    // falls through
  }
  return null;
}

function saveManifest(dir, manifest) {
  const target = path.join(dir, "manifest.json");
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  renameSync(tmp, target);
}

/** Every entry with its file state: ok, changed (hash no longer matches the id) or missing. */
export function listQuarantine(dir) {
  const manifest = readManifest(dir);
  if (!manifest) return null;
  return Object.entries(manifest.entries)
    .map(([id, entry]) => {
      let state = "missing";
      try {
        state = sha256Hex(readFileSync(path.join(dir, `${id}.txt`), "utf8")).startsWith(id) ? "ok" : "changed";
      } catch {
        // missing
      }
      return { id, rel: entry.rel, verdict: entry.verdict, findings: entry.findings, status: entry.status, quarantinedAt: entry.quarantinedAt, state };
    })
    .sort((a, b) => a.rel.localeCompare(b.rel) || a.id.localeCompare(b.id));
}

function entryFor(dir, id) {
  if (!ID.test(id ?? "")) throw new Error("--id must be the 16-character id from list");
  const manifest = readManifest(dir);
  const entry = manifest?.entries[id];
  if (!entry) throw new Error("no quarantined file with that id");
  return { manifest, entry };
}

/** Staging name: the original file's name, kept safe. */
function stagedName(rel, id) {
  const base = path.posix.basename(String(rel)).replace(/[^\w.\- ]/g, "_");
  return /\.(md|markdown|txt)$/i.test(base) ? base : `${base || id}.md`;
}

export function releaseFile({ dir, id, to, apply }) {
  const { manifest, entry } = entryFor(dir, id);
  if (entry.status !== "quarantined") throw new Error(`that file is already ${entry.status}`);
  if (entry.verdict === "blocked") throw new Error("blocked files are never released: edit the original and ingest it again");
  const file = path.join(dir, `${id}.txt`);
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error("the quarantined file is missing");
  }
  if (!sha256Hex(raw).startsWith(id)) throw new Error("the quarantined file changed since it was quarantined; refusing to release it");
  const target = path.join(to, stagedName(entry.rel, id));
  if (existsSync(target)) throw new Error("a file with that name is already in the staging folder");
  if (apply) {
    mkdirSync(to, { recursive: true });
    writeFileSync(target, raw, { flag: "wx", mode: 0o600 });
    entry.status = "released";
    entry.releasedAt = new Date().toISOString();
    saveManifest(dir, manifest);
  }
  return { target, applied: apply };
}

export function discardFile({ dir, id, apply }) {
  const { manifest, entry } = entryFor(dir, id);
  if (entry.status !== "quarantined") throw new Error(`that file is already ${entry.status}`);
  if (apply) {
    try {
      unlinkSync(path.join(dir, `${id}.txt`));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    entry.status = "discarded";
    entry.discardedAt = new Date().toISOString();
    saveManifest(dir, manifest);
  }
  return { applied: apply };
}

function fail(message) {
  console.error(`knowledge-unify quarantine: ${message}`);
  process.exitCode = 2;
}

function main(argv) {
  const [command, ...args] = argv;
  if (!["list", "release", "discard"].includes(command ?? "")) return fail("first argument must be list, release or discard");
  const opts = { quarantine: "", id: "", to: "", apply: false };
  const valued = { "--quarantine": "quarantine", "--id": "id", "--to": "to" };
  for (let i = 0; i < args.length; i += 1) {
    if (valued[args[i]]) opts[valued[args[i]]] = args[++i] ?? "";
    else if (args[i] === "--apply") opts.apply = true;
    else return fail(`unknown argument ${args[i]}`);
  }
  if (!opts.quarantine || !existsSync(opts.quarantine) || !lstatSync(opts.quarantine).isDirectory()) return fail("--quarantine must be an existing folder");
  const dir = resolveReal(opts.quarantine);
  try {
    if (command === "list") {
      const entries = listQuarantine(dir);
      if (!entries) return fail("no manifest.json there; was this folder written by ingest.mjs --apply?");
      console.log(`${entries.length} quarantined file(s).`);
      for (const e of entries) {
        const rules = (e.findings ?? []).map((f) => `${f.rule}x${f.count}`).join(", ");
        console.log(`  ${e.id}  ${e.status}  ${e.verdict}  ${e.rel}  [${rules}]${e.state === "ok" ? "" : `  FILE ${e.state.toUpperCase()}`}`);
      }
      return;
    }
    if (command === "release") {
      if (!opts.to) return fail("--to needs a staging folder");
      const to = resolveReal(opts.to);
      if (isInside(to, dir) || isInside(dir, to)) return fail("--to must be separate from the quarantine folder");
      const result = releaseFile({ dir, id: opts.id, to, apply: opts.apply });
      console.log(result.applied ? `Released to ${result.target}. Now: ingest.mjs --from ${to} --store ... --allow-flagged` : `Dry run: would copy to ${result.target}. Add --apply.`);
      return;
    }
    const result = discardFile({ dir, id: opts.id, apply: opts.apply });
    console.log(result.applied ? "Discarded." : "Dry run: nothing deleted. Add --apply.");
  } catch (error) {
    fail(error.message);
  }
}

if (process.argv[1]?.endsWith("/knowledge-unify/quarantine.mjs")) {
  main(process.argv.slice(2));
}
