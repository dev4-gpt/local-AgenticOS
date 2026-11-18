#!/usr/bin/env node
// Dependency-advisory gate. Same bar as `npm audit --audit-level=high`, except
// that a named advisory with no patched release may be allowed until a date.
// An allowance expires on its own, so it cannot be forgotten.
// Usage (from a package directory): node ../scripts/audit-gate.mjs [--omit=dev]
import { spawnSync } from "node:child_process";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

// Every entry needs a reason and an expiry. Remove the entry when a patched
// release exists, or when the dependency is gone.
export const ALLOWED_ADVISORIES = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    expires: "2026-12-17",
    reason:
      "ReDoS through repeated extglobs; no patched release exists (affects <= 4.0.7, the latest). " +
      "Reached only through build, lint and CLI tooling, which use fixed glob patterns. Owner decision 2026-11-17.",
  },
];

function advisoryIdOf(via) {
  const match = /GHSA-[0-9a-z-]+/i.exec(String(via.url ?? ""));
  return match ? match[0].toLowerCase() : null;
}

// Pure: turns an `npm audit --json` report into a verdict.
export function evaluateAudit(report, allowed = ALLOWED_ADVISORIES, now = new Date()) {
  if (!report || typeof report !== "object" || typeof report.vulnerabilities !== "object" || report.vulnerabilities === null) {
    return { ok: false, blocking: [], allowed: [], expired: [], error: "audit report is missing or unreadable" };
  }
  const seen = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities)) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== "object" || via === null) continue; // a string is a transitive pointer
      if (!BLOCKING_SEVERITIES.has(via.severity)) continue;
      const id = advisoryIdOf(via) ?? `source-${via.source}`;
      if (!seen.has(id)) seen.set(id, { id, package: via.name, severity: via.severity, title: via.title });
    }
  }
  const blocking = [];
  const allowedNow = [];
  const expired = [];
  for (const advisory of seen.values()) {
    const rule = allowed.find((entry) => entry.id.toLowerCase() === advisory.id);
    if (!rule) blocking.push(advisory);
    else if (new Date(`${rule.expires}T23:59:59Z`) < now) expired.push({ ...advisory, expires: rule.expires });
    else allowedNow.push({ ...advisory, expires: rule.expires, reason: rule.reason });
  }
  return { ok: blocking.length === 0 && expired.length === 0, blocking, allowed: allowedNow, expired };
}

function runAudit(extraArgs) {
  const result = spawnSync("npm", ["audit", "--json", ...extraArgs], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  // npm exits non-zero when it finds anything, so the exit code is not the verdict.
  return JSON.parse(result.stdout);
}

function main() {
  const extraArgs = process.argv.slice(2).filter((arg) => arg.startsWith("--omit="));
  let verdict;
  try {
    verdict = evaluateAudit(runAudit(extraArgs));
  } catch (error) {
    console.error(`audit-gate: could not read the audit report: ${error.message}`);
    process.exit(1);
  }
  for (const item of verdict.allowed) {
    console.log(`audit-gate: allowed ${item.id} (${item.package}, ${item.severity}) until ${item.expires} -- ${item.reason}`);
  }
  for (const item of verdict.expired) {
    console.error(`audit-gate: allowance for ${item.id} (${item.package}) expired on ${item.expires}; fix it or renew the decision`);
  }
  for (const item of verdict.blocking) {
    console.error(`audit-gate: BLOCKING ${item.id} (${item.package}, ${item.severity}) ${item.title ?? ""}`);
  }
  if (verdict.error) console.error(`audit-gate: ${verdict.error}`);
  if (!verdict.ok) process.exit(1);
  console.log("audit-gate: no unallowed high or critical advisories");
}

// Run only as a script. Tests import this file, and a test runner's own argv[1] is not this path.
if (/[\\/]audit-gate\.mjs$/.test(process.argv[1] ?? "")) main();
