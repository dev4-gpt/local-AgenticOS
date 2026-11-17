import { expect, test } from "@playwright/test";
// @ts-expect-error plain ESM script, no type declarations
import { ALLOWED_ADVISORIES, evaluateAudit } from "../scripts/audit-gate.mjs";

const PICOMATCH = "GHSA-fc5q-39xc-vjpf";
const advisory = (name: string, ghsa: string, severity: string) => ({
  name, severity, source: 1, title: `${name} advisory`, url: `https://github.com/advisories/${ghsa}`,
});
const report = (...vias: unknown[]) => ({ vulnerabilities: { pkg: { severity: "high", via: vias } } });
const allow = [{ id: PICOMATCH, package: "picomatch", expires: "2026-12-17", reason: "test" }];
const before = new Date("2026-11-20T00:00:00Z");

test("an allowed high advisory passes while it is in date", () => {
  const verdict = evaluateAudit(report(advisory("picomatch", PICOMATCH, "high")), allow, before);
  expect(verdict.ok).toBe(true);
  expect(verdict.allowed.map((a: { id: string }) => a.id)).toEqual([PICOMATCH.toLowerCase()]);
});

test("an unlisted high advisory still blocks, even beside an allowed one", () => {
  const verdict = evaluateAudit(
    report(advisory("picomatch", PICOMATCH, "high"), advisory("other", "GHSA-aaaa-bbbb-cccc", "high")), allow, before);
  expect(verdict.ok).toBe(false);
  expect(verdict.blocking.map((a: { package: string }) => a.package)).toEqual(["other"]);
});

test("a critical advisory blocks", () => {
  expect(evaluateAudit(report(advisory("x", "GHSA-dddd-eeee-ffff", "critical")), allow, before).ok).toBe(false);
});

test("moderate and low advisories do not block", () => {
  const verdict = evaluateAudit(report(advisory("m", "GHSA-1111-2222-3333", "moderate"), advisory("l", "GHSA-4444-5555-6666", "low")), allow, before);
  expect(verdict.ok).toBe(true);
});

test("an allowance stops working after its expiry date", () => {
  const verdict = evaluateAudit(report(advisory("picomatch", PICOMATCH, "high")), allow, new Date("2026-12-18T00:00:00Z"));
  expect(verdict.ok).toBe(false);
  expect(verdict.expired).toHaveLength(1);
});

test("transitive string entries are not counted as advisories", () => {
  expect(evaluateAudit(report("picomatch", "fdir"), allow, before).ok).toBe(true);
});

test("a missing or malformed report fails closed", () => {
  for (const bad of [null, undefined, {}, { error: { code: "ENOAUDIT" } }, { vulnerabilities: null }]) {
    expect(evaluateAudit(bad, allow, before).ok).toBe(false);
  }
});

test("the shipped allowlist names only the picomatch advisory, with a reason and an expiry", () => {
  expect(ALLOWED_ADVISORIES.map((a: { id: string }) => a.id)).toEqual([PICOMATCH]);
  for (const entry of ALLOWED_ADVISORIES) {
    expect(entry.reason.length).toBeGreaterThan(20);
    expect(entry.expires).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
});
