#!/usr/bin/env node
// Single writer per folder, and the sync conflict-copy check (X-12).
// A vault that syncs through iCloud (or Dropbox, Syncthing) can be written from two devices at once, and the sync
// service then makes "conflict copies". Two rules keep that visible:
//   claim     a folder can carry a marker (.ku-writer.json) naming the one device allowed to write to it. The nearest
//             marker at or above a folder governs it. Tools that write (ingest) or delete (cascade) refuse when the
//             marker names another device, unless the owner explicitly takes over. The marker syncs with the vault, so
//             the other device sees it. A marker that cannot be read counts as owned by someone else (fail closed).
//   conflicts conflict copies are found and reported, never merged, moved or deleted.
//   check     read-only: lists conflict copies and folders claimed by another device. --out must be outside every store.
// Usage:
//   node scripts/knowledge-unify/writer-claim.mjs check   --store L=PATH [--device NAME] [--out DIR]
//   node scripts/knowledge-unify/writer-claim.mjs claim   --store L=PATH --folder REL [--device NAME] [--take-over]
//   node scripts/knowledge-unify/writer-claim.mjs whoami [--init]   (prints this computer's writer name; --init saves it so a later host-name change cannot lock you out)
//   node scripts/knowledge-unify/writer-claim.mjs release --store L=PATH --folder REL [--device NAME] [--take-over]
// The device name is KU_DEVICE, else the name saved by `whoami --init`, else the host name; --device overrides all.
import { chmodSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseStoreArgs } from "./schema-check.mjs";
import { SKIP_DIRS, canonicalBody, isInside, listMarkdown, parseNote, resolveReal, sha256Hex } from "./scan.mjs";

export const MARKER = ".ku-writer.json";

export const DEVICE_FILE = path.join(os.homedir(), ".knowledge-unify-device");

/**
 * This computer's writer name: KU_DEVICE, else the name saved by `whoami --init`, else the host name. A host name can
 * change (macOS adds "-2" on a clash, networks rename), which would turn your own claims into someone else's, so save one.
 */
export function thisDevice() {
  const named = process.env.KU_DEVICE?.trim();
  if (named) return named;
  try {
    const saved = readFileSync(DEVICE_FILE, "utf8").trim();
    if (saved) return saved;
  } catch {
    // no saved name
  }
  return os.hostname();
}

/** The marker in exactly this folder: null (none), { device, by, claimedAt } or { invalid: true }. */
export function readClaim(dir) {
  let text;
  try {
    text = readFileSync(path.join(dir, MARKER), "utf8");
  } catch (error) {
    return error?.code === "ENOENT" ? null : { invalid: true };
  }
  try {
    const claim = JSON.parse(text);
    if (typeof claim?.device === "string" && claim.device.trim() !== "") return { device: claim.device, by: String(claim.by ?? ""), claimedAt: String(claim.claimedAt ?? "") };
  } catch {
    // falls through to invalid
  }
  return { invalid: true };
}

/** Nearest marker at or above `dir`, not looking past `root`. Returns { dir, claim } or null. */
export function governingClaim(root, dir) {
  let current = path.resolve(dir);
  const top = path.resolve(root);
  for (;;) {
    const claim = readClaim(current);
    if (claim) return { dir: current, claim };
    if (current === top || !isInside(current, top)) return null;
    current = path.dirname(current);
  }
}

/** { ok: true } when this device may write to `dir`, otherwise { ok: false, reason, owner }. */
export function folderGate(root, dir, { device = thisDevice(), takeOver = false } = {}) {
  const found = governingClaim(root, dir);
  if (!found || takeOver) return { ok: true, owner: found?.claim?.device ?? "" };
  if (found.claim.invalid) return { ok: false, reason: "claim-unreadable", owner: "", at: found.dir };
  if (found.claim.device === device) return { ok: true, owner: device };
  return { ok: false, reason: "folder-owned-by-other-device", owner: found.claim.device, at: found.dir };
}

/** Creates the marker only if none exists (a hard link fails when it appeared meanwhile), or replaces it on take-over. */
function writeMarker(dir, claim, replace) {
  const target = path.join(dir, MARKER);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(claim, null, 2)}\n`, { flag: "wx" });
    chmodSync(tmp, 0o644);
    if (replace) renameSync(tmp, target);
    else {
      try {
        linkSync(tmp, target);
      } catch (error) {
        // Some volumes (exFAT, network shares) have no hard links: create the marker exclusively instead.
        if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EXDEV", "EMLINK"].includes(error?.code)) throw error;
        writeFileSync(target, `${JSON.stringify(claim, null, 2)}\n`, { flag: "wx", mode: 0o644 });
      }
    }
  } catch (error) {
    if (error?.code === "EEXIST") throw Object.assign(new Error("folder-owned-by-other-device"), { owner: readClaim(dir)?.device ?? "" });
    throw error;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // renamed away, or never created
    }
  }
}

/** Claims `dir` for this device. Throws an Error whose message is the refusal reason. */
export function claimFolder(root, dir, { device = thisDevice(), by = "knowledge-tools", takeOver = false, now = new Date() } = {}) {
  const gate = folderGate(root, dir, { device, takeOver });
  if (!gate.ok) throw Object.assign(new Error(gate.reason), { owner: gate.owner });
  const found = governingClaim(root, dir);
  if (found && !found.claim.invalid && found.claim.device === device) return { status: "already-mine", dir: found.dir };
  mkdirSync(dir, { recursive: true });
  const own = readClaim(dir);
  writeMarker(dir, { device, by, claimedAt: now.toISOString() }, Boolean(own));
  return { status: found ? "taken-over" : "claimed", dir };
}

/** Removes this folder's own marker if it names this device (or takeOver). Returns "released", "none" or throws. */
export function releaseFolder(dir, { device = thisDevice(), takeOver = false } = {}) {
  const claim = readClaim(dir);
  if (!claim) return "none";
  if (!takeOver && (claim.invalid || claim.device !== device)) throw Object.assign(new Error("folder-owned-by-other-device"), { owner: claim.device ?? "" });
  unlinkSync(path.join(dir, MARKER));
  return "released";
}

/** Every marker under root (paths relative to root) with who owns it. */
export function findClaims(root) {
  const claims = [];
  const unreadable = [];
  const stack = [""];
  while (stack.length > 0) {
    const rel = stack.pop();
    let entries;
    try {
      entries = readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      unreadable.push(rel || ".");
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(child);
      } else if (entry.name === MARKER) {
        const claim = readClaim(path.join(root, rel));
        claims.push({ folder: rel || ".", device: claim?.invalid ? "" : claim?.device ?? "", invalid: Boolean(claim?.invalid), claimedAt: claim?.claimedAt ?? "" });
      }
    }
  }
  return { claims: claims.sort((a, b) => a.folder.localeCompare(b.folder)), unreadable };
}

// Only the sync services' own wording, so a note called "Policy (conflict of interest)" is not mistaken for a copy.
const SYNC_CONFLICT = /\s\((?:[^()]*\s)?conflicted copy[^()]*\)$/i;
const SYNCTHING = /\.sync-conflict-\d{8}-\d{6}(?:-[A-Z0-9]+)?$/;
const NUMBERED = [
  // One or two digits, like iCloud and Drive produce, so "Notes 2024" next to "Notes" is not called a copy.
  { kind: "numbered-suffix", pattern: /^(.+) (\d{1,2})$/ },
  { kind: "bracket-number", pattern: /^(.+) \((\d{1,2})\)$/ },
  { kind: "copy-suffix", pattern: /^(.+) copy(?: \d+)?$/i },
];

/**
 * Notes that look like sync conflict copies. Explicit conflict names are always reported. Names that only end in a
 * number or "copy" are reported only when the note they would be a copy of sits in the same folder, so "Chapter 2"
 * alone is never flagged. The report holds paths and kinds, never text.
 */
export function findConflictCopies(stores, { under = "" } = {}) {
  const found = [];
  for (const { label, root } of stores) {
    // `under` (a folder relative to the store) limits the walk; a copy always sits in the same folder as its original.
    const files = under ? listMarkdown(path.join(root, under)).map((rel) => `${under}/${rel}`) : listMarkdown(root);
    const byLower = new Map(files.map((rel) => [rel.toLowerCase(), rel]));
    for (const rel of files) {
      const dir = path.posix.dirname(rel);
      const name = path.posix.basename(rel).replace(/\.md$/i, "");
      const sibling = (base) => byLower.get(path.posix.join(dir, `${base}.md`).toLowerCase()) ?? null;
      let kind = "";
      let original = null;
      if (SYNC_CONFLICT.test(name)) {
        kind = "conflict-name";
        original = sibling(name.replace(SYNC_CONFLICT, ""));
      } else if (SYNCTHING.test(name)) {
        kind = "syncthing-conflict";
        original = sibling(name.replace(SYNCTHING, ""));
      } else {
        for (const candidate of NUMBERED) {
          const match = candidate.pattern.exec(name);
          const target = match ? sibling(match[1]) : null;
          if (!target) continue;
          kind = candidate.kind;
          original = target;
          break;
        }
      }
      if (!kind) continue;
      let identical = null;
      if (original) {
        try {
          const a = canonicalBody(parseNote(readFileSync(path.join(root, rel), "utf8")).body);
          const b = canonicalBody(parseNote(readFileSync(path.join(root, original), "utf8")).body);
          identical = sha256Hex(a) === sha256Hex(b);
        } catch {
          identical = null;
        }
      }
      found.push({ key: `${label}::${rel}`, root: label, rel, kind, original, identical });
    }
  }
  return found;
}

/** Conflict copies that sit in `dir` (absolute) or below it, for one store. */
export function conflictsUnder(store, dir) {
  const prefix = path.relative(store.root, dir).split(path.sep).join("/");
  return findConflictCopies([store], { under: prefix });
}

function fail(message) {
  console.error(`knowledge-unify writer-claim: ${message}`);
  process.exitCode = 2;
}

function safeDir(store, folder) {
  if (typeof folder !== "string" || folder === "" || path.isAbsolute(folder) || folder.split(/[\\/]/).includes("..")) return null;
  const dir = resolveReal(path.join(store.root, folder));
  return isInside(dir, store.root) && dir !== store.root ? dir : null;
}

function main(argv) {
  const [command, ...args] = argv;
  if (command === "whoami") {
    if (args.includes("--init") && !process.env.KU_DEVICE?.trim()) {
      try {
        writeFileSync(DEVICE_FILE, `${os.hostname()}\n`, { flag: "wx", mode: 0o644 });
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
    }
    console.log(thisDevice());
    return;
  }
  if (!["check", "claim", "release"].includes(command ?? "")) return fail("first argument must be check, claim, release or whoami");
  let parsed;
  try {
    parsed = parseStoreArgs(args, "writer-claim");
  } catch (error) {
    return fail(error.message);
  }
  const opts = { device: thisDevice(), folder: "", out: path.join(os.tmpdir(), "knowledge-unify"), takeOver: false };
  for (let i = 0; i < parsed.rest.length; i += 1) {
    const arg = parsed.rest[i];
    if (arg === "--device") opts.device = parsed.rest[++i] ?? "";
    else if (arg === "--folder") opts.folder = parsed.rest[++i] ?? "";
    else if (arg === "--out") opts.out = parsed.rest[++i] ?? "";
    else if (arg === "--take-over") opts.takeOver = true;
    else return fail(`unknown argument ${arg}`);
  }
  if (opts.device.trim() === "") return fail("--device needs a name");
  if (command === "check") {
    const out = resolveReal(opts.out);
    if (parsed.stores.some((store) => isInside(out, store.root))) return fail("--out must be outside every store folder");
    const conflicts = findConflictCopies(parsed.stores);
    const scanned = parsed.stores.map((store) => ({ store, ...findClaims(store.root) }));
    const claims = scanned.flatMap(({ store, claims: list }) => list.map((claim) => ({ root: store.label, ...claim, foreign: claim.invalid || claim.device !== opts.device })));
    const unreadable = scanned.flatMap(({ store, unreadable: list }) => list.map((folder) => `${store.label}::${folder}`));
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, "writer-check.json"), JSON.stringify({ schema: 1, generatedAt: new Date().toISOString(), device: opts.device, conflicts, claims, unreadable }, null, 2));
    console.log(`${conflicts.length} conflict cop${conflicts.length === 1 ? "y" : "ies"}; ${claims.length} folder claim(s), ${claims.filter((claim) => claim.foreign).length} held by another device.`);
    for (const item of conflicts) console.log(`  conflict ${item.key} (${item.kind}${item.original ? `, copy of ${item.original}${item.identical ? ", same text" : ", different text"}` : ""})`);
    for (const claim of claims.filter((entry) => entry.foreign)) console.log(`  other device ${claim.root}::${claim.folder} (${claim.invalid ? "unreadable claim" : claim.device})`);
    if (unreadable.length > 0) console.log(`WARNING: ${unreadable.length} folder(s) could not be read, so a claim inside them would not show here: ${unreadable.join(", ")}`);
    console.log(`Report (paths and kinds only): ${path.join(out, "writer-check.json")}`);
    return;
  }
  if (parsed.stores.length !== 1) return fail("give exactly one --store");
  const store = parsed.stores[0];
  const dir = safeDir(store, opts.folder);
  if (!dir) return fail("--folder must be a folder name inside the store");
  try {
    if (command === "claim") {
      const result = claimFolder(store.root, dir, { device: opts.device, takeOver: opts.takeOver });
      console.log(`${result.status}: ${opts.folder} is written by device "${opts.device}".`);
    } else {
      if (!lstatSync(dir, { throwIfNoEntry: false })) return fail("that folder does not exist");
      console.log(releaseFolder(dir, { device: opts.device, takeOver: opts.takeOver }) === "released" ? `released: ${opts.folder}` : `no claim on ${opts.folder}`);
    }
  } catch (error) {
    if (!["folder-owned-by-other-device", "claim-unreadable"].includes(error.message)) throw error;
    fail(`${error.message}${error.owner ? ` (${error.owner})` : ""}; use --take-over only if you are sure the other device has stopped`);
  }
}

if (process.argv[1]?.endsWith("/knowledge-unify/writer-claim.mjs")) {
  main(process.argv.slice(2));
}
