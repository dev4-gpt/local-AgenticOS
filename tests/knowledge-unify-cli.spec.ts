import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Runs the three scripts exactly as a user would, in subprocesses, against temp folders built inside each test.
const root = process.cwd();
const created: string[] = [];
const BODY = "Same body text that is long enough to be compared safely.";

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

function makeVault(files: Record<string, string>): string {
  const vault = tempDir("ku-cli-vault-");
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(vault, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  return vault;
}

function run(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "knowledge-unify", script), ...args], { cwd: root, encoding: "utf8" });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

function snapshot(dir: string): string {
  const parts: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) walk(abs);
      else parts.push(`${path.relative(dir, abs)}:${createHash("sha256").update(fs.readFileSync(abs)).digest("hex")}`);
    }
  };
  walk(dir);
  return parts.join("\n");
}

test.afterAll(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

test("scan without a store, with an unknown flag, or with a bad label exits 2 with a message", () => {
  for (const args of [[], ["--nope"], ["--store", "no-equals-sign"], ["--store", "bad label=/tmp"]]) {
    const result = run("scan.mjs", args);
    expect(result.status).toBe(2);
    expect(result.err).toContain("knowledge-unify scan:");
  }
});

test("scan refuses an --out folder inside a store and leaves the store untouched", () => {
  const vault = makeVault({ "a.md": `${BODY}\n` });
  const before = snapshot(vault);
  const result = run("scan.mjs", ["--store", `v=${vault}`, "--out", path.join(vault, "reports")]);
  expect(result.status).toBe(2);
  expect(result.err).toContain("--out must be outside every store folder");
  expect(snapshot(vault)).toBe(before);
});

test("scan, report and a dry-run apply work end to end and change nothing in the store", () => {
  const vault = makeVault({ "a.md": `---\ntitle: One\n---\n${BODY}\n`, "b.md": `${BODY}\n` });
  const out = tempDir("ku-cli-out-");
  const before = snapshot(vault);
  const scan = run("scan.mjs", ["--store", `v=${vault}`, "--out", out]);
  expect(scan.status).toBe(0);
  expect(scan.out).toContain("Scanned 2 notes");
  const report = run("dedupe-report.mjs", ["--scan", path.join(out, "scan.json")]);
  expect(report.status).toBe(0);
  expect(report.out).toContain("1 exact and 0 near-duplicate groups");
  const apply = run("apply.mjs", ["--report", path.join(out, "dedupe-report.json"), "--decisions", path.join(out, "decisions.json")]);
  expect(apply.status).toBe(0);
  expect(apply.out).toContain("0 note(s) would change");
  expect(apply.out).toContain("Dry run: nothing written");
  expect(snapshot(vault)).toBe(before);
});

test("apply --apply with approved decisions writes markers and a backup outside the store", () => {
  const vault = makeVault({ "a.md": `---\ntitle: One\n---\n${BODY}\n`, "b.md": `${BODY}\n` });
  const out = tempDir("ku-cli-out-");
  run("scan.mjs", ["--store", `v=${vault}`, "--out", out]);
  run("dedupe-report.mjs", ["--scan", path.join(out, "scan.json")]);
  const decisionsPath = path.join(out, "decisions.json");
  const decisions = JSON.parse(fs.readFileSync(decisionsPath, "utf8"));
  const id = Object.keys(decisions.decisions)[0];
  decisions.decisions[id].action = "mark-duplicates";
  decisions.decisions[id].keeper = "v::a.md";
  fs.writeFileSync(decisionsPath, JSON.stringify(decisions));
  const backups = path.join(out, "backups");
  const apply = run("apply.mjs", ["--report", path.join(out, "dedupe-report.json"), "--decisions", decisionsPath, "--backup-dir", backups, "--apply"]);
  expect(apply.status).toBe(0);
  expect(apply.out).toContain("Changed 2 note(s)");
  expect(fs.readFileSync(path.join(vault, "b.md"), "utf8")).toContain('duplicate_of: "a.md"');
  expect(fs.readdirSync(backups)).toHaveLength(1);
});

test("apply refuses a backup folder inside a store and missing input files", () => {
  const vault = makeVault({ "a.md": `${BODY}\n`, "b.md": `${BODY}\n` });
  const out = tempDir("ku-cli-out-");
  run("scan.mjs", ["--store", `v=${vault}`, "--out", out]);
  run("dedupe-report.mjs", ["--scan", path.join(out, "scan.json")]);
  const files = ["--report", path.join(out, "dedupe-report.json"), "--decisions", path.join(out, "decisions.json")];
  const inside = run("apply.mjs", [...files, "--backup-dir", path.join(vault, "backups"), "--apply"]);
  expect(inside.status).toBe(2);
  expect(inside.err).toContain("--backup-dir must be outside every store folder");
  const missing = run("apply.mjs", ["--report", path.join(out, "nope.json"), "--decisions", path.join(out, "nope2.json")]);
  expect(missing.status).toBe(2);
});

test("a symlinked path into a store cannot be used for --out or --backup-dir", () => {
  const vault = makeVault({ "a.md": `${BODY}\n`, "b.md": `${BODY}\n` });
  const link = path.join(tempDir("ku-cli-link-"), "vault-link");
  fs.symlinkSync(vault, link);
  const viaLink = run("scan.mjs", ["--store", `v=${vault}`, "--out", path.join(link, "reports")]);
  expect(viaLink.status).toBe(2);
  expect(viaLink.err).toContain("--out must be outside every store folder");
  const out = tempDir("ku-cli-out-");
  run("scan.mjs", ["--store", `v=${vault}`, "--out", out]);
  run("dedupe-report.mjs", ["--scan", path.join(out, "scan.json")]);
  const backup = run("apply.mjs", ["--report", path.join(out, "dedupe-report.json"), "--decisions", path.join(out, "decisions.json"), "--backup-dir", path.join(link, "backups")]);
  expect(backup.status).toBe(2);
  expect(backup.err).toContain("--backup-dir must be outside every store folder");
  expect(fs.readdirSync(vault).sort()).toEqual(["a.md", "b.md"]);
});

test("apply --apply is blocked while iCloud placeholders exist, and the dry run explains why", () => {
  const vault = makeVault({ "a.md": `${BODY}\n`, "b.md": `${BODY}\n`, ".Evicted.md.icloud": "stub" });
  const out = tempDir("ku-cli-out-");
  const scan = run("scan.mjs", ["--store", `v=${vault}`, "--out", out]);
  expect(scan.out).toContain("not downloaded from iCloud");
  const report = run("dedupe-report.mjs", ["--scan", path.join(out, "scan.json")]);
  expect(report.out).toContain("BLOCKER");
  const files = ["--report", path.join(out, "dedupe-report.json"), "--decisions", path.join(out, "decisions.json")];
  const dry = run("apply.mjs", files);
  expect(dry.status).toBe(0);
  expect(dry.out).toContain("BLOCKED");
  const real = run("apply.mjs", [...files, "--apply"]);
  expect(real.status).toBe(2);
});

test("files from an older version are rejected with a clear message", () => {
  const vault = makeVault({ "a.md": `${BODY}\n` });
  const out = tempDir("ku-cli-out-");
  run("scan.mjs", ["--store", `v=${vault}`, "--out", out]);
  const scanPath = path.join(out, "scan.json");
  const old = JSON.parse(fs.readFileSync(scanPath, "utf8"));
  old.schema = 1;
  fs.writeFileSync(scanPath, JSON.stringify(old));
  const result = run("dedupe-report.mjs", ["--scan", scanPath]);
  expect(result.status).toBe(2);
  expect(result.err).toContain("older version");
});
