import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyPlan, planApply } from "../scripts/knowledge-unify/apply.mjs";
import { buildReport } from "../scripts/knowledge-unify/dedupe-report.mjs";
import { canonicalUrl, isInside, scan } from "../scripts/knowledge-unify/scan.mjs";

// Fixtures are built inside each test in a temp folder and removed afterwards; no real data is used.
const created: string[] = [];

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

function makeVault(files: Record<string, string>): string {
  const root = tempDir("ku-vault-");
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  return root;
}

function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else out[path.relative(root, abs)] = `${fs.statSync(abs).mtimeMs}:${createHash("sha256").update(fs.readFileSync(abs)).digest("hex")}`;
    }
  };
  walk(root);
  return out;
}

const BODY = "Same body text that is long enough to be compared safely.";

test.afterAll(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

test("scan is read-only and skips tool folders", () => {
  const root = makeVault({
    "a.md": `---\ntitle: A\n---\n${BODY}\n`,
    "sub/b.md": "# B\nAnother body that is long enough for hashing.\n",
    ".obsidian/ignored.md": "should never be scanned at all",
    "_backups/old.md": "should never be scanned either",
  });
  const before = snapshot(root);
  const result = scan([{ label: "operator", root }]);
  expect(result.records.map((record: { rel: string }) => record.rel)).toEqual(["a.md", "sub/b.md"]);
  expect(snapshot(root)).toEqual(before);
});

test("exact duplicates match across stores and line endings, with no cross-contamination", () => {
  const one = makeVault({ "x.md": `---\ntitle: One\n---\n${BODY}\n` });
  const two = makeVault({ "y.md": `${BODY}\r\n`, "z.md": "A different note with its own distinct and long enough text.\n" });
  const { report } = buildReport(scan([{ label: "operator", root: one }, { label: "creator-os", root: two }]));
  expect(report.summary.exactClusters).toBe(1);
  expect(report.clusters[0].members.map((member: { key: string }) => member.key).sort()).toEqual(["creator-os::y.md", "operator::x.md"]);
  expect(report.clusters[0].reasons).toEqual(["same-body"]);
});

test("same primary source URL groups only source notes, tracking params ignored", () => {
  expect(canonicalUrl("https://www.Example.com/post/?utm_source=x&b=2&a=1#frag")).toBe("https://example.com/post/?a=1&b=2");
  const root = makeVault({
    "s1.md": "---\ntype: source\nsources: [\"https://example.com/p?utm_campaign=q\"]\n---\nFirst capture of the page with its own long body text.\n",
    "s2.md": "---\ntype: source\nurl: https://www.example.com/p\n---\nSecond capture, worded differently but the same page, long enough.\n",
    "cite.md": "---\ntype: concept\nsources: [\"https://example.com/p\"]\n---\nA concept note that merely cites the page, with its own text here.\n",
  });
  const { report } = buildReport(scan([{ label: "operator", root }]));
  expect(report.clusters).toHaveLength(1);
  expect(report.clusters[0].members.map((member: { key: string }) => member.key).sort()).toEqual(["operator::s1.md", "operator::s2.md"]);
  expect(report.clusters[0].reasons).toEqual(["same-url"]);
});

test("near duplicates are flagged as near, empty and short bodies never group", () => {
  const root = makeVault({
    "n1.md": "---\ntitle: Alpha note\n---\nThe quick brown fox, jumps over the lazy dog today!\n",
    "n2.md": "---\ntitle: Beta note\n---\nthe quick brown fox jumps over the lazy dog today\n",
    "e1.md": "",
    "e2.md": "\n",
    "t1.md": "hi",
    "t2.md": "hi",
  });
  const { report, decisions } = buildReport(scan([{ label: "operator", root }]));
  expect(report.clusters).toHaveLength(1);
  expect(report.clusters[0].kind).toBe("near");
  expect(Object.values(decisions.decisions).every((d) => (d as { action: string }).action === "pending")).toBe(true);
});

test("the keeper suggestion prefers the note other notes link to", () => {
  const root = makeVault({
    "keep-me.md": `---\ntitle: Keep\n---\n${BODY}\n`,
    "copy.md": `${BODY}\n`,
    "linker.md": "See [[keep-me]] for details, plus enough other text in this note.\n",
  });
  const { report } = buildReport(scan([{ label: "operator", root }]));
  expect(report.clusters[0].suggestedKeeper).toBe("operator::keep-me.md");
});

function exactPair() {
  const root = makeVault({ "a.md": `---\ntitle: One\n---\n${BODY}\n`, "b.md": `${BODY}\n` });
  const { report, decisions } = buildReport(scan([{ label: "vault", root }]));
  return { root, report, decisions, id: report.clusters[0].id as string };
}

test("pending decisions change nothing; a dry run writes nothing", () => {
  const { root, report, decisions } = exactPair();
  const before = snapshot(root);
  expect(planApply({ report, decisions }).edits.size).toBe(0);
  decisions.decisions[report.clusters[0].id].action = "mark-duplicates";
  decisions.decisions[report.clusters[0].id].keeper = "vault::a.md";
  expect(planApply({ report, decisions }).edits.size).toBe(2);
  expect(snapshot(root)).toEqual(before);
});

test("apply backs up originals, adds markers only, keeps bodies and files, and is not repeatable on stale data", () => {
  const { root, report, decisions, id } = exactPair();
  decisions.decisions[id] = { action: "mark-duplicates", kind: "exact", keeper: "vault::a.md" };
  const backupRoot = tempDir("ku-backup-");
  const originalA = fs.readFileSync(path.join(root, "a.md"), "utf8");
  const originalB = fs.readFileSync(path.join(root, "b.md"), "utf8");
  const plan = planApply({ report, decisions });
  const result = applyPlan({ plan, backupRoot, stamp: "test-stamp" });
  expect(result.changed).toBe(2);
  const a = fs.readFileSync(path.join(root, "a.md"), "utf8");
  const b = fs.readFileSync(path.join(root, "b.md"), "utf8");
  expect(a).toContain('supersedes: ["b.md"]');
  expect(b).toContain('duplicate_of: "a.md"');
  expect(a.endsWith(`${BODY}\n`)).toBe(true);
  expect(b.endsWith(`${BODY}\n`)).toBe(true);
  expect(fs.readdirSync(root).sort()).toEqual(["a.md", "b.md"]);
  expect(fs.readFileSync(path.join(backupRoot, "test-stamp", "vault", "a.md"), "utf8")).toBe(originalA);
  expect(fs.readFileSync(path.join(backupRoot, "test-stamp", "vault", "b.md"), "utf8")).toBe(originalB);
  const again = planApply({ report, decisions });
  expect(again.edits.size).toBe(0);
  expect(again.skipped.map((item: { reason: string }) => item.reason)).toContain("changed-since-scan");
});

test("paths that escape a store are refused and nothing is written", () => {
  const { root, report, decisions, id } = exactPair();
  decisions.decisions[id] = { action: "mark-duplicates", kind: "exact", keeper: "vault::a.md" };
  const tampered = JSON.parse(JSON.stringify(report));
  tampered.clusters[0].members[1].rel = "../evil.md";
  const before = snapshot(root);
  const plan = planApply({ report: tampered, decisions });
  expect(plan.edits.size).toBe(0);
  expect(plan.skipped[0].reason).toBe("unsafe-or-unknown-path");
  expect(snapshot(root)).toEqual(before);
  expect(isInside(path.join(root, "x"), root)).toBe(true);
  expect(isInside(path.join(root, "..", "x"), root)).toBe(false);
});
