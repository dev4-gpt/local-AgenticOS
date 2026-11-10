import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyRepair, planRepair, planRepairEdits, proposePatch } from "../scripts/knowledge-unify/repair.mjs";
import { claimFolder } from "../scripts/knowledge-unify/writer-claim.mjs";
import { bodyHash, checkPage } from "../scripts/knowledge-unify/schema-check.mjs";
import { parseNote } from "../scripts/knowledge-unify/scan.mjs";

// Fixtures are synthetic, built inside each test in a temp folder and removed afterwards.
const created: string[] = [];

function makeVault(files: Record<string, string>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kr-")));
  created.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

test.afterAll(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

const BODY = "A synthetic body that is long enough to be a real page.\n";
const FULL = (extra: string) => `---\ntitle: T\ntype: topic\ntags: []\nsources:\n  - https://example.com/a\ncreated: 2026-10-28\nupdated: 2026-10-28\nlicence: test\nstore_origin: v\n${extra}---\n${BODY}`;

test("a page that only lacks its hash is repairable, and the patch makes it pass the whole check", () => {
  const vault = makeVault({ "a.md": FULL("") });
  const plan = planRepair([{ label: "v", root: vault }]);
  expect(plan.summary).toMatchObject({ invalid: 1, repairable: 1, needsAPerson: 0 });
  expect(plan.items[0].fixes).toEqual(["sha256"]);
  const { meta, body } = parseNote(fs.readFileSync(path.join(vault, "a.md"), "utf8"));
  expect(checkPage({ ...meta, ...proposePatch(meta, body) }, body).status).toBe("shared-ok");
});

test("a source page gets its canonical address from its first web source, cleaned", () => {
  const raw = `---\ntitle: S\ntype: source\ntags: []\nsources:\n  - https://example.com/s?utm_source=x\ncreated: 2026-10-28\nupdated: 2026-10-28\nlicence: test\nstore_origin: v\n---\n${BODY}`;
  const { meta, body } = parseNote(raw);
  const patch = proposePatch(meta, body);
  expect(patch.canonical_url).toBe("https://example.com/s");
  expect(patch.sha256).toBe(bodyHash(body));
  const mixed = parseNote(raw.replace("  - https://example.com/s?utm_source=x", "  - notes/local-file\n  - https://example.com/second"));
  expect(proposePatch(mixed.meta, mixed.body).canonical_url).toBe("https://example.com/second"); // a local path before the web address is skipped
  const noWeb = parseNote(raw.replace("https://example.com/s?utm_source=x", "notes/local-file"));
  expect(proposePatch(noWeb.meta, noWeb.body).canonical_url).toBeUndefined();
});

test("a page missing provenance, licence, dates or type is left to a person with the rules named, and never half-patched", () => {
  const bare = `---\ntitle: T\ntype: topic\ntags: []\n---\n${BODY}`;
  const vault = makeVault({ "bare.md": bare });
  const plan = planRepair([{ label: "v", root: vault }]);
  expect(plan.summary.repairable).toBe(0);
  expect(plan.summary.needsAPerson).toBe(1);
  expect(Object.keys(plan.summary.blockingRules)).toEqual(expect.arrayContaining(["sources-not-list", "licence-missing", "created-invalid"]));
  expect(plan.items[0]).not.toHaveProperty("fixes");
});

test("an empty body is never given a hash", () => {
  const { meta, body } = parseNote(`---\ntitle: T\ntype: topic\ntags: []\nsources:\n  - https://example.com/a\ncreated: 2026-10-28\nupdated: 2026-10-28\nlicence: test\nstore_origin: v\n---\n\n`);
  expect(proposePatch(meta, body).sha256).toBeUndefined();
});

test("a single source written as a string is wrapped as a list, but an unusable one is not", () => {
  const ok = parseNote(`---\ntitle: T\ntype: topic\ntags: []\nsources: https://example.com/a\ncreated: 2026-10-28\nupdated: 2026-10-28\nlicence: test\nstore_origin: v\n---\n${BODY}`);
  expect(proposePatch(ok.meta, ok.body).sources).toEqual(["https://example.com/a"]);
  const bad = parseNote(`---\ntitle: T\ntype: topic\ntags: []\nsources: ../escape\n---\n${BODY}`);
  expect(proposePatch(bad.meta, bad.body).sources).toBeUndefined();
});

test("legacy and already valid pages are ignored", () => {
  const vault = makeVault({ "legacy.md": "No frontmatter, a legacy note that is long enough.\n", "ok.md": FULL(`sha256: ${bodyHash(BODY)}\n`) });
  expect(planRepair([{ label: "v", root: vault }]).summary.invalid).toBe(0);
});

test("the command line only plans: the vault is byte for byte unchanged, the report holds no page text, and --out inside a store is refused", () => {
  const vault = makeVault({ "a.md": FULL(""), "bare.md": `---\ntitle: T\ntype: topic\ntags: []\n---\n${BODY}` });
  const before = fs.readFileSync(path.join(vault, "a.md"), "utf8");
  const out = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kr-out-")));
  created.push(out);
  const script = path.join(__dirname, "..", "scripts", "knowledge-unify", "repair.mjs");
  const run = (...args: string[]) => spawnSync(process.execPath, [script, "plan", "--store", `v=${vault}`, ...args], { encoding: "utf8" });
  const result = run("--out", out);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("nothing was written to any store");
  expect(fs.readFileSync(path.join(vault, "a.md"), "utf8")).toBe(before);
  expect(fs.readdirSync(vault).sort()).toEqual(["a.md", "bare.md"]);
  expect(fs.readFileSync(path.join(out, "repair-plan.json"), "utf8")).not.toContain("synthetic body");
  expect(fs.statSync(path.join(out, "repair-plan.json")).mode & 0o777).toBe(0o600);
  const inside = run("--out", path.join(vault, "plans"));
  expect(inside.status).toBe(2);
  expect(inside.stderr).toContain("outside every store");
});

// ---- apply ----
const SOURCE = `---\ntitle: S\ntype: source\ntags: []\nsources:\n  - https://example.com/s?utm_source=x\ncreated: 2026-10-28\nupdated: 2026-10-28\nlicence: test\nstore_origin: v\n---\n${BODY}`;
const tmp = (prefix: string) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  created.push(dir);
  return dir;
};

test("apply adds exactly the proposed lines, leaves the body byte for byte, backs up the original first, and the page then passes the check", () => {
  const vault = makeVault({ "s.md": SOURCE, "bare.md": `---\ntitle: T\ntype: topic\ntags: []\n---\n${BODY}` });
  const bareBefore = fs.readFileSync(path.join(vault, "bare.md"), "utf8");
  const stores = [{ label: "v", root: vault }];
  const plan = planRepairEdits(stores, { device: "laptop" });
  expect(plan.edits.size).toBe(1);
  const backups = tmp("kr-bak-");
  const result = applyRepair({ plan, backupRoot: backups, stamp: "t1" });
  expect(result.changed).toBe(1);
  const after = fs.readFileSync(path.join(vault, "s.md"), "utf8");
  expect(after).toContain("canonical_url: https://example.com/s\n");
  expect(after).toContain(`sha256: ${bodyHash(BODY)}`);
  expect(after.endsWith(`---\n${BODY}`)).toBe(true);
  expect(after.replace(/^(sha256|canonical_url): .*\n/gm, "")).toBe(SOURCE);
  const { meta, body } = parseNote(after);
  expect(checkPage(meta, body).status).toBe("shared-ok");
  expect(fs.readFileSync(path.join(backups, "t1", "v", "s.md"), "utf8")).toBe(SOURCE);
  expect(fs.readFileSync(path.join(vault, "bare.md"), "utf8")).toBe(bareBefore); // a page that needs a person is untouched
  expect(planRepair(stores).summary.repairable).toBe(0); // running again finds nothing to do
});

test("a page edited after planning is dropped, not overwritten", () => {
  const vault = makeVault({ "s.md": SOURCE });
  const plan = planRepairEdits([{ label: "v", root: vault }], { device: "laptop" });
  fs.writeFileSync(path.join(vault, "s.md"), SOURCE + "added later\n");
  const result = applyRepair({ plan, backupRoot: tmp("kr-bak-"), stamp: "t2" });
  expect(result.changed).toBe(0);
  expect(result.log.skipped.map((item: { reason: string }) => item.reason)).toContain("changed-since-plan");
  expect(fs.readFileSync(path.join(vault, "s.md"), "utf8")).toBe(SOURCE + "added later\n");
});

test("a folder claimed by another device is skipped, and a page that already has a sha256 key is never rewritten", () => {
  const vault = makeVault({ "Mine/s.md": SOURCE, "Theirs/s.md": SOURCE, "Empty/s.md": SOURCE.replace("licence: test", "licence: test\nsha256:") });
  claimFolder(vault, path.join(vault, "Theirs"), { device: "desktop", by: "test" });
  const plan = planRepairEdits([{ label: "v", root: vault }], { device: "laptop" });
  const reasons = plan.skipped.map((item: { reason: string }) => item.reason).sort();
  expect(reasons).toEqual(["folder-claimed-by-other-device", "key-already-present"].sort());
  expect([...plan.edits.keys()]).toEqual(["v::Mine/s.md"]);
});

test("the command line is a dry run by default, refuses a backup folder inside a store, and writes only with --apply", () => {
  const vault = makeVault({ "s.md": SOURCE });
  const backups = tmp("kr-bak-");
  const script = path.join(__dirname, "..", "scripts", "knowledge-unify", "repair.mjs");
  const run = (...args: string[]) => spawnSync(process.execPath, [script, "apply", "--store", `v=${vault}`, ...args], { encoding: "utf8", env: { ...process.env, KU_DEVICE: "laptop" } });
  expect(run().status).toBe(2); // no backup folder given
  const inside = run("--backup-dir", path.join(vault, "bak"));
  expect(inside.status).toBe(2);
  expect(inside.stderr).toContain("outside every store");
  const dry = run("--backup-dir", backups);
  expect(dry.status).toBe(0);
  expect(dry.stdout).toContain('"would_change": 1');
  expect(fs.readFileSync(path.join(vault, "s.md"), "utf8")).toBe(SOURCE);
  const real = run("--backup-dir", backups, "--apply");
  expect(real.status).toBe(0);
  expect(real.stdout).toContain("Changed 1 page(s)");
  expect(fs.readFileSync(path.join(vault, "s.md"), "utf8")).not.toBe(SOURCE);
});

test("a page whose fix would need its sources rewritten is planned but never written by apply", () => {
  const raw = `---\ntitle: T\ntype: topic\ntags: []\nsources: https://example.com/a\ncreated: 2026-10-28\nupdated: 2026-10-28\nlicence: test\nstore_origin: v\n---\n${BODY}`;
  const vault = makeVault({ "a.md": raw });
  const stores = [{ label: "v", root: vault }];
  expect(planRepair(stores).items[0]).toMatchObject({ outcome: "repairable", fixes: ["sha256", "sources"] });
  const plan = planRepairEdits(stores, { device: "laptop" });
  expect(plan.edits.size).toBe(0);
  expect(plan.skipped.map((item: { reason: string }) => item.reason)).toEqual(["needs-manual-edit"]);
  expect(fs.readFileSync(path.join(vault, "a.md"), "utf8")).toBe(raw);
});
