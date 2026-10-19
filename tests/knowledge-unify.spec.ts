import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addFrontmatterLine, applyPlan, planApply } from "../scripts/knowledge-unify/apply.mjs";
import { buildReport } from "../scripts/knowledge-unify/dedupe-report.mjs";
import { canonicalUrl, isInside, listMarkdown, parseNote, scan } from "../scripts/knowledge-unify/scan.mjs";

// Fixtures are built inside each test in a temp folder and removed afterwards; no real data is used.
const created: string[] = [];
const isRoot = process.getuid?.() === 0;

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
  for (const dir of created) {
    try {
      fs.chmodSync(dir, 0o755);
    } catch {
      // already removed
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
  expect(result.schema).toBe(2);
  expect(snapshot(root)).toEqual(before);
});

test("exact duplicates match across stores and line endings, with no cross-contamination", () => {
  const one = makeVault({ "x.md": `---\ntitle: One\n---\n${BODY}\n` });
  const two = makeVault({ "y.md": `${BODY}\r\n`, "z.md": "A different note with its own distinct and long enough text.\n" });
  const { report } = buildReport(scan([{ label: "operator", root: one }, { label: "creator-os", root: two }]));
  expect(report.summary.exactClusters).toBe(1);
  expect(report.clusters[0].members.map((member: { key: string }) => member.key).sort()).toEqual(["creator-os::y.md", "operator::x.md"]);
  expect(report.clusters[0].reasons).toEqual(["same-body"]);
  expect(report.clusters[0].confidence).toBe("high");
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

test("CR-5: a non-source note with a url field is not grouped by URL", () => {
  const root = makeVault({
    "c1.md": "---\ntype: concept\nurl: https://example.com/a\n---\nFirst distinct concept text that is long enough here.\n",
    "c2.md": "---\ntype: concept\nurl: https://example.com/a\n---\nSecond very different concept text that is long enough.\n",
  });
  expect(buildReport(scan([{ label: "v", root }])).report.clusters).toHaveLength(0);
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
  expect(report.clusters[0].confidence).toBe("medium");
  expect(Object.values(decisions.decisions).every((d) => (d as { action: string }).action === "pending")).toBe(true);
});

test("CR-6: empty notes with the same title never group; real same-title notes are low confidence", () => {
  const empty = makeVault({ "a/Untitled.md": "", "b/Untitled.md": "" });
  expect(buildReport(scan([{ label: "v", root: empty }])).report.clusters).toHaveLength(0);
  const titled = makeVault({
    "a/Weekly planning notes.md": "---\ntitle: Weekly planning notes\n---\nFirst week covers hiring and the launch checklist in detail.\n",
    "b/Weekly planning notes.md": "---\ntitle: Weekly planning notes\n---\nA different week about budgets, vendors and contract renewals.\n",
  });
  const { report } = buildReport(scan([{ label: "v", root: titled }]));
  expect(report.clusters).toHaveLength(1);
  expect(report.clusters[0].reasons).toEqual(["same-title"]);
  expect(report.clusters[0].confidence).toBe("low");
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

test("CR-13: generated Graphify notes are left out and the note they derive from is the preferred keeper", () => {
  const generatedRoot = makeVault({
    "Memories/day.md": "# Day Memory 2026\n\nSystem note recorded on the day, long enough to compare.\n",
    "Graphify/Day Memory 2026.md":
      "---\nsource_file: \"Memories/day.md\"\ntype: \"document\"\ncommunity: \"Community 3\"\ntags:\n  - graphify/document\n---\n\n# Day Memory 2026\n\n## Connections\n- [[Other]] - references\n",
  });
  const generated = buildReport(scan([{ label: "v", root: generatedRoot }]));
  expect(generated.report.clusters).toHaveLength(0);
  expect(generated.report.summary.generatedExcluded).toBe(1);

  const keeperRoot = makeVault({
    "x.md": `---\ntitle: X\ntype: note\n---\n${BODY}\n`,
    "y.md": `${BODY}\n`,
    "Graphify/Derived.md": "---\nsource_file: \"y.md\"\ncommunity: \"Community 1\"\ntags:\n  - graphify/document\n---\n\n# Derived\n",
  });
  const { report } = buildReport(scan([{ label: "v", root: keeperRoot }]));
  expect(report.clusters[0].suggestedKeeper).toBe("v::y.md");
});

test("CR-7: a __proto__ frontmatter key cannot change the metadata prototype", () => {
  const { meta } = parseNote("---\n__proto__:\ntitle: X\n---\nbody\n");
  expect(Object.getPrototypeOf(meta)).toBeNull();
  expect(meta.title).toBe("X");
});

test("CR-4: iCloud placeholders are reported, counted and block apply", () => {
  const root = makeVault({ "a.md": `---\ntitle: One\n---\n${BODY}\n`, "b.md": `${BODY}\n`, ".Evicted.md.icloud": "stub", "sub/.Gone.MD.icloud": "stub" });
  expect(listMarkdown(root)).toEqual(["a.md", "b.md"]);
  const result = scan([{ label: "v", root }]);
  expect(result.skipped.map((item: { rel: string; reason: string }) => `${item.rel}:${item.reason}`).sort()).toEqual(["Evicted.md:not-downloaded", "sub/Gone.MD:not-downloaded"]);
  expect(result.summary.notDownloaded).toBe(2);
  const { report, decisions } = buildReport(result);
  expect(report.blockers).toHaveLength(1);
  decisions.decisions[report.clusters[0].id] = { action: "mark-duplicates", kind: "exact", keeper: "v::a.md" };
  const before = snapshot(root);
  const plan = planApply({ report, decisions });
  expect(plan.blocked).toBe(true);
  expect(plan.edits.size).toBe(0);
  expect(plan.skipped[0].reason).toBe("blocked-by-report");
  expect(snapshot(root)).toEqual(before);
});

test("CR-10: an unreadable folder is reported as skipped and the scan continues", () => {
  test.skip(isRoot, "permissions are not enforced for root");
  const root = makeVault({ "ok.md": `${BODY}\n`, "locked/hidden.md": `${BODY}\n` });
  fs.chmodSync(path.join(root, "locked"), 0o000);
  try {
    const result = scan([{ label: "v", root }]);
    expect(result.records.map((record: { rel: string }) => record.rel)).toEqual(["ok.md"]);
    expect(result.skipped).toEqual([{ root: "v", rel: "locked", reason: "unreadable-dir" }]);
  } finally {
    fs.chmodSync(path.join(root, "locked"), 0o755);
  }
});

test("CR-11: reported URLs lose credentials and sensitive query parameters", () => {
  const root = makeVault({
    "s.md": "---\ntype: source\nsources:\n  - \"https://user:pw@example.com/doc?token=abc123&api_key=k&page=2&utm_source=x\"\n  - \"notes/local-file.md\"\n---\nA source note with a signed URL and a plain local reference here.\n",
  });
  const record = scan([{ label: "v", root }]).records[0];
  expect(record.sources).toEqual(["https://example.com/doc?page=2", "notes/local-file.md"]);
  expect(record.primaryUrl).toBe("https://example.com/doc?page=2");
  expect(JSON.stringify(record)).not.toMatch(/abc123|api_key|user:pw/);
});

test("older scan, report or decision files are rejected", () => {
  const root = makeVault({ "a.md": `${BODY}\n`, "b.md": `${BODY}\n` });
  const result = scan([{ label: "v", root }]);
  expect(() => buildReport({ ...result, schema: 1 })).toThrow("scan_schema_mismatch");
  const { report, decisions } = buildReport(result);
  expect(() => planApply({ report: { ...report, schema: 1 }, decisions })).toThrow("report_schema_mismatch");
  expect(() => planApply({ report, decisions: { ...decisions, schema: 1 } })).toThrow("decisions_schema_mismatch");
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

test("apply backs up originals, adds markers only, keeps bodies and files, and a rerun says already-applied", () => {
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
  expect(JSON.parse(fs.readFileSync(path.join(backupRoot, "test-stamp", "apply-log.json"), "utf8")).status).toBe("applied");
  expect(fs.readdirSync(root).some((name) => name.includes("ku-tmp"))).toBe(false);
  const again = planApply({ report, decisions });
  expect(again.edits.size).toBe(0);
  expect(again.skipped.map((item: { reason: string }) => item.reason)).toEqual(["already-applied"]);
});

test("CR-1: a failed write restores the files already changed and still writes the log", () => {
  test.skip(isRoot, "permissions are not enforced for root");
  const root = makeVault({ "a.md": `---\ntitle: One\n---\n${BODY}\n`, "sub/b.md": `${BODY}\n` });
  const { report, decisions } = buildReport(scan([{ label: "v", root }]));
  decisions.decisions[report.clusters[0].id] = { action: "mark-duplicates", kind: "exact", keeper: "v::a.md" };
  const plan = planApply({ report, decisions });
  expect([...plan.edits.values()].map((edit: { rel: string }) => edit.rel)).toEqual(["a.md", "sub/b.md"]);
  const originalA = fs.readFileSync(path.join(root, "a.md"), "utf8");
  const backupRoot = tempDir("ku-backup-");
  fs.chmodSync(path.join(root, "sub"), 0o555);
  try {
    expect(() => applyPlan({ plan, backupRoot, stamp: "fail" })).toThrow("apply_failed");
  } finally {
    fs.chmodSync(path.join(root, "sub"), 0o755);
  }
  expect(fs.readFileSync(path.join(root, "a.md"), "utf8")).toBe(originalA);
  expect(fs.readFileSync(path.join(root, "sub", "b.md"), "utf8")).toBe(`${BODY}\n`);
  expect(fs.readdirSync(root).some((name) => name.includes("ku-tmp"))).toBe(false);
  const log = JSON.parse(fs.readFileSync(path.join(backupRoot, "fail", "apply-log.json"), "utf8"));
  expect(log.status).toBe("failed");
  expect(log.restored.map((item: { rel: string }) => item.rel)).toEqual(["a.md"]);
  expect(log.changed).toEqual([]);
});

test("CR-1: a read-only note is skipped at planning time", () => {
  test.skip(isRoot, "permissions are not enforced for root");
  const { root, report, decisions, id } = exactPair();
  decisions.decisions[id] = { action: "mark-duplicates", kind: "exact", keeper: "vault::a.md" };
  fs.chmodSync(path.join(root, "b.md"), 0o444);
  const plan = planApply({ report, decisions });
  expect(plan.edits.size).toBe(0);
  expect(plan.skipped[0].reason).toBe("not-writable");
});

test("CR-2: an empty frontmatter block gets one marker block, not a second block", () => {
  expect(addFrontmatterLine("---\n---\nBody\n", "duplicate_of", '"x"').text).toBe('---\nduplicate_of: "x"\n---\nBody\n');
  expect(addFrontmatterLine("---\n\n---\nBody\n", "duplicate_of", '"x"').text).toBe('---\n\nduplicate_of: "x"\n---\nBody\n');
});

test("CR-3: a byte-order mark stays at the very start", () => {
  const withBlock = addFrontmatterLine("﻿---\ntitle: T\n---\nBody\n", "duplicate_of", '"x"').text;
  expect(withBlock).toBe('﻿---\ntitle: T\nduplicate_of: "x"\n---\nBody\n');
  const without = addFrontmatterLine("﻿Body\n", "duplicate_of", '"x"').text;
  expect(without.startsWith("﻿---\n")).toBe(true);
  expect(without.indexOf("﻿", 1)).toBe(-1);
});

test("CRLF notes keep their line endings", () => {
  const out = addFrontmatterLine("---\r\ntitle: T\r\n---\r\nBody\r\n", "supersedes", '["b.md"]').text;
  expect(out).toBe('---\r\ntitle: T\r\nsupersedes: ["b.md"]\r\n---\r\nBody\r\n');
});

test("a different existing value is never overwritten", () => {
  const out = addFrontmatterLine('---\nduplicate_of: "other.md"\n---\nBody\n', "duplicate_of", '"x"');
  expect(out.status).toBe("key-exists");
  expect(out.text).toBe('---\nduplicate_of: "other.md"\n---\nBody\n');
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

test("CR-9: a note replaced by a symlink after the scan is refused and the link target is untouched", () => {
  const { root, report, decisions, id } = exactPair();
  decisions.decisions[id] = { action: "mark-duplicates", kind: "exact", keeper: "vault::a.md" };
  const outside = path.join(tempDir("ku-out-"), "outside.md");
  fs.writeFileSync(outside, "outside note content that must not change\n");
  fs.rmSync(path.join(root, "b.md"));
  fs.symlinkSync(outside, path.join(root, "b.md"));
  const plan = planApply({ report, decisions });
  expect(plan.edits.size).toBe(0);
  expect(plan.skipped.map((item: { reason: string }) => item.reason)).toContain("unsafe-or-unknown-path");
  expect(fs.readFileSync(outside, "utf8")).toBe("outside note content that must not change\n");
});
