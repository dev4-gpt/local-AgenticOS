#!/usr/bin/env node
// Policy-as-code release gate: dependency license compliance.
//
// ALLOWLIST reflects this repo's actual dependency graph, reviewed here:
// MIT/ISC/Apache-2.0/BSD-2/BSD-3/0BSD/CC0-1.0/Unlicense are unconditionally
// permissive. BlueOak-1.0.0, Python-2.0 (argparse) and CC-BY-4.0
// (browserslist's caniuse-lite *data*, not code) are permissive in effect.
// MPL-2.0 (lightningcss, axe-core) and LGPL-3.0-or-later (sharp's libvips
// native binaries) are weak-copyleft licenses already shipping here as
// build tooling / optional native binaries, never statically linked into
// code we distribute -- re-review before adding a NEW package under either
// license for a different purpose.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const lockPath = join(root, "package-lock.json");

const ALLOWLIST = new Set([
  "MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD",
  "CC0-1.0", "Unlicense", "BlueOak-1.0.0", "Python-2.0", "CC-BY-4.0",
  "MPL-2.0", "LGPL-3.0-or-later", "LGPL-3.0-only", "LGPL-2.1-or-later", "LGPL-2.1-only",
]);
const DENYLIST_HINTS = ["GPL-1.0", "GPL-2.0", "GPL-3.0", "AGPL-1.0", "AGPL-3.0", "SSPL-1.0", "BUSL-1.1", "CC-BY-SA", "CC-BY-NC", "UNLICENSED"];
const failures = [];

function isAllowedExpression(expr) {
  const value = Array.isArray(expr) ? expr.join(" OR ") : expr;
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim().replace(/^\(|\)$/g, "");
  const orParts = trimmed.split(/\s+OR\s+/i);
  if (orParts.length > 1) return orParts.some(isAllowedExpression);
  const andParts = trimmed.split(/\s+AND\s+/i);
  if (andParts.length > 1) return andParts.every(isAllowedExpression);
  return ALLOWLIST.has(trimmed);
}

// Self-test doubles as this gate's regression test AND its "intentional
// failure" proof -- no real dependency needs touching to prove it fires.
expect(isAllowedExpression("MIT"), "self-test: MIT must be allowed");
expect(isAllowedExpression("Apache-2.0 AND LGPL-3.0-or-later AND MIT"), "self-test: all-allowed AND expression must pass");
expect(!isAllowedExpression("GPL-3.0-only"), "self-test: GPL-3.0-only must be rejected");
expect(!isAllowedExpression("Apache-2.0 AND AGPL-3.0-only"), "self-test: one bad AND branch must reject the whole expression");
expect(!isAllowedExpression(""), "self-test: a missing license must be rejected");
expect(!isAllowedExpression("UNLICENSED"), "self-test: npm's UNLICENSED placeholder must be rejected");

const lock = JSON.parse(await readFile(lockPath, "utf8"));
const entries = Object.entries(lock.packages ?? {}).filter(([path]) => path.includes("node_modules/"));
expect(entries.length > 0, "package-lock.json produced no node_modules entries to check");

for (const [path, meta] of entries) {
  if (isAllowedExpression(meta?.license)) continue;
  const hint = DENYLIST_HINTS.some((bad) => String(meta?.license ?? "").includes(bad));
  failures.push(`${path}@${meta?.version ?? "unknown"} has a disallowed license: ${meta?.license ?? "(missing)"}${hint ? " (explicitly denylisted)" : ""}`);
}

console.log(JSON.stringify({ ok: failures.length === 0, checked: entries.length, failures }, null, 2));
if (failures.length) process.exit(1);

function expect(condition, message) { if (!condition) failures.push(message); }
