#!/usr/bin/env node
// Phase 1 mutation sweep (master plan principle 5): remove one rule at a time from the adapter-host SQL and
// libraries, run the specs that own that file, and require a failure. A mutation that survives is a rule with no
// test. Every file is restored afterwards, also on a crash or Ctrl-C.
//
// Usage: node scripts/phase1-mutation-sweep.mjs [--list] [--only sql|ts] [--file <name-fragment>] [--json <path>]
// Refuses to run if a target file has uncommitted changes.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SQL_DIR = "product-experience";
const T = (name) => `tests/${name}.spec.ts`;

// File -> the specs that own it, most likely to fail first (the run stops at the first failure).
export const TARGETS = [
  { file: `${SQL_DIR}/supabase-client-adapter-host.sql`, kind: "sql", specs: [T("adapter-host-sql"), T("adapter-promotions-sql"), T("adapter-approval-gateway-sql"), T("adapter-budget-sql"), T("adapter-restore-sql"), T("adapter-retention-sql"), T("adapter-scoped-read-sql")] },
  { file: `${SQL_DIR}/supabase-client-adapter-approval-gateway.sql`, kind: "sql", specs: [T("adapter-approval-gateway-sql")] },
  { file: `${SQL_DIR}/supabase-client-adapter-budget.sql`, kind: "sql", specs: [T("adapter-budget-sql"), T("adapter-budget-concurrency")] },
  { file: `${SQL_DIR}/supabase-client-adapter-promotions.sql`, kind: "sql", specs: [T("adapter-promotions-sql")] },
  { file: `${SQL_DIR}/supabase-client-adapter-retention-28.sql`, kind: "sql", specs: [T("adapter-retention-sql"), T("adapter-restore-sql")] },
  { file: `${SQL_DIR}/supabase-client-adapter-token-uses.sql`, kind: "sql", specs: [T("adapter-token-uses-sql"), T("adapter-scoped-read-sql")] },
  { file: `${SQL_DIR}/supabase-client-adapter-background-owner.sql`, kind: "sql", specs: [T("adapter-background-owner-sql")] },
  { file: "src/lib/adapterTokens.ts", kind: "ts", specs: [T("adapter-tokens")] },
  { file: "src/lib/adapterBudget.ts", kind: "ts", specs: [T("adapter-budget")] },
  { file: "src/lib/adapterApprovalGateway.ts", kind: "ts", specs: [T("adapter-approval-gateway"), T("adapter-wrong-tenant-routes")] },
  { file: "src/lib/adapterMemoryGuard.ts", kind: "ts", specs: [T("adapter-memory-guard"), T("adapter-promotions-routes"), T("adapter-wrong-tenant-routes")] },
  { file: "src/lib/adapterContracts.ts", kind: "ts", specs: [T("adapter-contracts"), T("adapter-tokens")] },
  { file: "src/lib/adapterActivity.ts", kind: "ts", specs: [T("adapter-activity")] },
  { file: "src/lib/adapterPromotionsView.ts", kind: "ts", specs: [T("adapter-promotions-view")] },
  { file: "src/app/api/client-runtime/adapter-promotions/[id]/decision/route.ts", kind: "ts", specs: [T("adapter-promotions-routes"), T("adapter-wrong-tenant-routes")] },
  { file: "src/lib/adapterOverview.ts", kind: "ts", specs: [T("adapter-overview")] },
];

// Success results are not rules; removing them would only break the happy path, which proves nothing.
const SUCCESS_RETURNS = new Set(["reserved", "settled", "released", "approved", "rejected"]);

/**
 * Mutants that cannot change behaviour, each with the reason. Matched by file, line and the exact original text, so
 * an edit to the file makes the entry stale and the mutation runs again instead of being silently skipped.
 */
const NO_USER = "The functions are not granted to the public role, and a missing user matches no row, so the later checks give the same refusal.";
export const EQUIVALENT = [
  { file: `${SQL_DIR}/supabase-client-adapter-promotions.sql`, line: 37, original: "raise exception 'adapter_promotion_not_allowed';", reason: NO_USER },
  { file: `${SQL_DIR}/supabase-client-adapter-promotions.sql`, line: 100, original: "raise exception 'adapter_revoke_not_allowed';", reason: NO_USER },
  { file: `${SQL_DIR}/supabase-client-adapter-approval-gateway.sql`, line: 134, original: "raise exception 'adapter_approval_not_allowed';", reason: NO_USER },
  { file: `${SQL_DIR}/supabase-client-adapter-budget.sql`, line: 166, original: "return 'not_found';", reason: "Without it settle falls through to the ledger lookup, which finds nothing for a missing reservation and returns the same not_found (the vanished-ledger case is tested separately)." },
  { file: `${SQL_DIR}/supabase-client-adapter-budget.sql`, line: 236, original: "return 'not_found';", reason: "Without it release falls through to the ledger update, which matches no row for a missing reservation and returns the same not_found." },
  { file: "src/lib/adapterTokens.ts", line: 109, original: 'if (!value || typeof value !== "object" || Array.isArray(value)) return null;', reason: "A null or array payload fails the next line's field checks, or throws inside the try block, and both end as null." },
  { file: "src/lib/adapterTokens.ts", line: 111, original: 'if (typeof v !== "string" || typeof iss !== "string" || typeof tenant !== "string" || typeof aud !== "string") return null;', reason: "Each of those four fields is compared for equality with an expected string afterwards, so a non-string can never verify." },
  { file: "src/lib/adapterMemoryGuard.ts", line: 98, original: "if (!url) return null;", reason: "new URL(undefined) and new URL('') throw, and the catch returns null, so the result is identical." },
];

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

function sqlMutations(text) {
  const out = [];
  // 1. Every `raise exception ...;` becomes a no-op, so the rule it enforced is gone.
  for (const m of text.matchAll(/raise exception[^;]*;/g)) {
    if (/append-only|cannot be truncated/.test(m[0])) {
      // The only statement of a trigger function: replace it with one that lets the change through.
      out.push({ index: m.index, length: m[0].length, replacement: "return coalesce(new, old);", label: m[0].slice(0, 60) });
    } else out.push({ index: m.index, length: m[0].length, replacement: "null;", label: m[0].slice(0, 60) });
  }
  // 2. Every refusal returned as a value ('refused', 'not_found', false ...) falls through instead.
  for (const m of text.matchAll(/return (?:'([a-z_]+)'|false);/g)) {
    if (m[1] && SUCCESS_RETURNS.has(m[1])) continue;
    out.push({ index: m.index, length: m[0].length, replacement: "null;", label: m[0] });
  }
  return out;
}

function tsMutations(text) {
  const out = [];
  // Every single-line `if (cond) return|throw ...;` loses its guard.
  for (const m of text.matchAll(/^([ \t]*)if \((.*)\) (return|throw)\b(.*);$/gm)) {
    out.push({ index: m.index, length: m[0].length, replacement: `${m[1]}if (false && (${m[2]})) ${m[3]}${m[4]};`, label: m[0].trim().slice(0, 70) });
  }
  return out;
}

/** All mutations for the targets, with their location. Pure: reads the files, changes nothing. */
export function buildMutations(root = ROOT, filter = {}) {
  const all = [];
  for (const target of TARGETS) {
    if (filter.only && target.kind !== filter.only) continue;
    if (filter.file && !target.file.includes(filter.file)) continue;
    const text = readFileSync(path.join(root, target.file), "utf8");
    const found = target.kind === "sql" ? sqlMutations(text) : tsMutations(text);
    for (const m of found) {
      const original = text.slice(m.index, m.index + m.length);
      const line = lineOf(text, m.index);
      const equivalent = EQUIVALENT.find((e) => e.file === target.file && e.line === line && e.original === original.trim());
      all.push({ id: `${path.basename(target.file)}:${line}`, file: target.file, specs: target.specs, line, original, mutated: text.slice(0, m.index) + m.replacement + text.slice(m.index + m.length), label: m.label, equivalent: equivalent?.reason ?? null });
    }
  }
  return all;
}

function runSpecs(specs) {
  const result = spawnSync("npx", ["playwright", "test", ...specs, "--config=playwright.unit.config.ts", "--reporter=dot", "--max-failures=1"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return result.status === 0;
}

function main() {
  const args = process.argv.slice(2);
  const val = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const mutations = buildMutations(ROOT, { only: val("--only"), file: val("--file") });
  if (args.includes("--list")) {
    for (const m of mutations) console.log(`${m.id}\t${m.label}${m.equivalent ? "\t[equivalent]" : ""}`);
    console.log(`${mutations.length} mutations`);
    return;
  }
  const files = [...new Set(mutations.map((m) => m.file))];
  const dirty = execFileSync("git", ["status", "--porcelain", "--", ...files], { cwd: ROOT, encoding: "utf8" }).trim();
  if (dirty) {
    console.error(`Refusing to run: these target files have uncommitted changes, and the sweep rewrites them.\n${dirty}`);
    process.exit(2);
  }
  const originals = new Map(files.map((f) => [f, readFileSync(path.join(ROOT, f), "utf8")]));
  const restore = () => { for (const [f, text] of originals) writeFileSync(path.join(ROOT, f), text); };
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { restore(); process.exit(130); });

  const caught = [];
  const survived = [];
  const skipped = [];
  try {
    // A clean baseline first: if the owning specs already fail, every mutant would look caught.
    for (const specs of new Set(mutations.map((m) => m.specs.join(" ")))) {
      if (!runSpecs(specs.split(" "))) { restore(); console.error(`Baseline failed for: ${specs}. Fix that before sweeping.`); process.exit(3); }
    }
    for (const [i, m] of mutations.entries()) {
      if (m.equivalent) { skipped.push(m); continue; }
      writeFileSync(path.join(ROOT, m.file), m.mutated);
      const passed = runSpecs(m.specs);
      writeFileSync(path.join(ROOT, m.file), originals.get(m.file));
      (passed ? survived : caught).push(m);
      console.log(`[${i + 1}/${mutations.length}] ${passed ? "SURVIVED" : "caught  "} ${m.id}  ${m.label}`);
    }
  } finally {
    restore();
  }
  const leftover = execFileSync("git", ["status", "--porcelain", "--", ...files], { cwd: ROOT, encoding: "utf8" }).trim();
  const summary = { total: mutations.length, caught: caught.length, survived: survived.map((m) => ({ id: m.id, file: m.file, line: m.line, rule: m.original.trim() })), skippedEquivalent: skipped.length, filesRestored: leftover === "" };
  console.log(JSON.stringify(summary, null, 2));
  if (val("--json")) writeFileSync(path.resolve(ROOT, val("--json")), JSON.stringify(summary, null, 2));
  process.exit(survived.length || leftover ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
