import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyCascade, buildSourceIndex, indexToJson, planCascade, resolveRef } from "../scripts/knowledge-unify/source-index.mjs";
import { bodyHash, checkPage, checkStores, isPromotable } from "../scripts/knowledge-unify/schema-check.mjs";
import { parseNote } from "../scripts/knowledge-unify/scan.mjs";

// Fixtures are synthetic, built inside each test in a temp folder and removed afterwards.
const created: string[] = [];

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

function makeVault(files: Record<string, string>): string {
  const root = tempDir("ksi-vault-");
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  return root;
}

test.afterAll(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

const SCRIPTS = path.join(__dirname, "..", "scripts", "knowledge-unify");
function run(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { encoding: "utf8" });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

const BODY = "A body that is long enough to be a real page.\n";
function page(overrides: Record<string, string | null> = {}, body = BODY): string {
  const sha = createHash("sha256").update(body.trim()).digest("hex");
  const fields: Record<string, string | null> = {
    title: "Page",
    type: "concept",
    tags: "[a]",
    sources: "[https://example.com/a]",
    created: "2026-10-01",
    updated: "2026-10-02",
    sha256: sha,
    licence: "third-party / unknown",
    store_origin: "operator",
    ...overrides,
  };
  const lines = Object.entries(fields).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

function check(raw: string) {
  const { meta, body } = parseNote(raw);
  return checkPage(meta, body);
}

function problemsOf(overrides: Record<string, string | null>, body?: string): string[] {
  return check(page(overrides, body)).problems;
}

test("a note with no type is legacy and private, not an error", () => {
  for (const raw of ["just text with no frontmatter at all\n", "---\ntitle: Old\ntags: [x]\n---\nold note body text\n"]) {
    const result = check(raw);
    expect(result).toEqual({ status: "legacy-private", problems: [] });
    expect(isPromotable(result.status)).toBe(false);
  }
});

test("a complete page is shareable and only then promotable", () => {
  const result = check(page());
  expect(result).toEqual({ status: "shared-ok", problems: [] });
  expect(isPromotable(result.status)).toBe(true);
  expect(isPromotable("invalid")).toBe(false);
});

test("each broken rule is named and makes the page invalid", () => {
  const cases: Array<[Record<string, string | null>, string]> = [
    [{ type: "banana" }, "type-unknown"],
    [{ title: null }, "title-missing"],
    [{ tags: "x" }, "tags-not-list"],
    [{ sources: "https://example.com/a" }, "sources-not-list"],
    [{ sources: "[]" }, "sources-empty"],
    [{ sources: "[../../etc/passwd]" }, "sources-unusable"],
    [{ sources: "[ftp://example.com/a]" }, "sources-unusable"],
    [{ created: "2026-02-30" }, "created-invalid"],
    [{ created: "yesterday" }, "created-invalid"],
    [{ updated: null }, "updated-invalid"],
    [{ created: "2026-10-05", updated: "2026-10-01" }, "updated-before-created"],
    [{ sha256: null }, "sha256-missing"],
    [{ sha256: "abc" }, "sha256-missing"],
    [{ sha256: "0".repeat(64) }, "sha256-mismatch"],
    [{ licence: null }, "licence-missing"],
    [{ store_origin: "not ok!" }, "store-origin-invalid"],
    [{ tenant: "X" }, "tenant-invalid"],
  ];
  for (const [overrides, name] of cases) {
    const result = check(page(overrides));
    expect(result.status, name).toBe("invalid");
    expect(result.problems, name).toContain(name);
  }
});

test("a valid tenant slug is accepted", () => {
  expect(problemsOf({ tenant: "acme-co" })).toEqual([]);
});

test("a changed body no longer matches its hash, and line endings do not matter", () => {
  const raw = page();
  expect(check(raw.replace("real page", "fake page")).problems).toContain("sha256-mismatch");
  expect(check(raw.replace(/\n/g, "\r\n")).problems).toEqual([]);
  expect(bodyHash("a  \r\nb\r\n")).toBe(bodyHash("a\nb"));
});

test("source pages need a clean canonical url", () => {
  const source = { type: "source" };
  expect(problemsOf({ ...source, canonical_url: null })).toContain("canonical-url-missing");
  expect(problemsOf({ ...source, canonical_url: "https://www.example.com/a?utm_source=x" })).toContain("canonical-url-not-clean");
  expect(problemsOf({ ...source, canonical_url: "https://example.com/a" })).toEqual([]);
  expect(problemsOf({ canonical_url: null })).toEqual([]);
});

test("checkStores counts statuses and its report holds no note text", () => {
  const secret = "ZEBRA-SECRET-PHRASE";
  const vault = makeVault({
    "ok.md": page({}, `${secret} is in this long enough body.\n`),
    "bad.md": page({ licence: null }),
    "old.md": "legacy note text that has no type\n",
    "nested/old2.md": "---\ntitle: Two\n---\nanother legacy note body\n",
  });
  const result = checkStores([{ label: "v", root: vault }]);
  expect(result.summary).toMatchObject({ total: 4, sharedOk: 1, legacyPrivate: 2, invalid: 1 });
  expect(result.summary.problems).toEqual({ "licence-missing": 1 });
  expect(JSON.stringify(result)).not.toContain(secret);
});

test("schema-check refuses an --out inside a store and writes nothing there", () => {
  const vault = makeVault({ "a.md": page() });
  const result = run("schema-check.mjs", ["--store", `v=${vault}`, "--out", path.join(vault, "reports")]);
  expect(result.status).toBe(2);
  expect(result.err).toContain("--out must be outside every store folder");
  expect(fs.readdirSync(vault)).toEqual(["a.md"]);
  const out = tempDir("ksi-out-");
  const ok = run("schema-check.mjs", ["--store", `v=${vault}`, "--out", out]);
  expect(ok.status).toBe(0);
  expect(ok.out).toContain("1 shareable");
  expect(fs.existsSync(path.join(out, "schema-check.json"))).toBe(true);
});

test("references resolve to one comparable key", () => {
  const labels = new Set(["v", "w"]);
  const r = (ref: string) => resolveRef(ref, "v", labels);
  expect(r("https://www.example.com/a/?utm_source=x#top")).toBe(r("https://example.com/a/?fbclid=1"));
  expect(r("https://example.com/a")).toBe("url:https://example.com/a");
  expect(r("Notes/Source One.md")).toBe("file:v:notes/source one");
  expect(r("./Notes/Source One")).toBe(r("notes/source one.md"));
  expect(r("[[Notes/Source One]]")).toBe(r("Notes/Source One.md"));
  expect(r("w:Notes/Other.md")).toBe("file:w:notes/other");
  expect(r("x:Notes/Other.md")).toBe("file:v:x:notes/other");
  expect(r("/Users/me/Downloads/Paper.pdf")).toBe("abs:/users/me/downloads/paper.pdf");
  expect(r("file:/Users/me/Downloads/Paper.pdf")).toBe(r("/Users/me/Downloads/Paper.pdf"));
  for (const bad of ["", "   ", "../outside.md", "a/../../b.md", "/a/../b", "ftp://example.com/x", "javascript://x", "[[]]"]) {
    expect(r(bad), bad).toBe("");
  }
});

const URL_A = "https://example.com/a";
const URL_B = "https://example.com/b";
const withSources = (sources: string[], title = "T") => `---\ntitle: ${title}\nsources: [${sources.join(", ")}]\n---\nbody text of a derived note\n`;

function indexOf(vault: string) {
  return buildSourceIndex([{ label: "v", root: vault }]);
}

test("the reverse index lists every note that cites a source", () => {
  const vault = makeVault({
    "one.md": withSources([URL_A]),
    "two.md": withSources([URL_A, URL_B]),
    "none.md": "---\ntitle: N\n---\nno sources here at all\n",
  });
  const index = indexOf(vault);
  expect([...index.bySource.get("url:https://example.com/a")!].sort()).toEqual(["v::one.md", "v::two.md"]);
  expect([...index.bySource.get("url:https://example.com/b")!]).toEqual(["v::two.md"]);
  expect(index.pages.size).toBe(3);
  const json = indexToJson(index);
  expect(json.bySource["url:https://example.com/a"]).toEqual(["v::one.md", "v::two.md"]);
  expect(JSON.stringify(json)).not.toContain("body text");
});

test("deleting a source plans removal of notes built only from it, including legacy notes", () => {
  const vault = makeVault({
    "derived.md": withSources([URL_A]),
    "legacy.md": `---\ntitle: Old\nsources: ${URL_A}\n---\nlegacy body text for the note\n`,
    "other.md": withSources([URL_B]),
    "plain.md": "no frontmatter at all in this note\n",
  });
  const plan = planCascade(indexOf(vault), ["url:https://example.com/a"]);
  expect(plan.delete.map((item: { key: string }) => item.key).sort()).toEqual(["v::derived.md", "v::legacy.md"]);
  expect(plan.review).toEqual([]);
  expect(plan.blocked).toBe(false);
});

test("a note that still has another source is kept for review unless partial delete is chosen", () => {
  const vault = makeVault({ "mixed.md": withSources([URL_A, URL_B]) });
  const review = planCascade(indexOf(vault), ["url:https://example.com/a"]);
  expect(review.delete).toEqual([]);
  expect(review.review).toHaveLength(1);
  expect(review.review[0]).toMatchObject({ key: "v::mixed.md", remaining: ["url:https://example.com/b"] });
  const all = planCascade(indexOf(vault), ["url:https://example.com/a"], { partial: "delete" });
  expect(all.delete.map((item: { key: string }) => item.key)).toEqual(["v::mixed.md"]);
  expect(() => planCascade(indexOf(vault), [], { partial: "bogus" as never })).toThrow();
});

test("the cascade follows derived notes through other derived notes, in any order", () => {
  const vault = makeVault({
    "a-level2.md": withSources(["v:z-level1.md"]),
    "b-level3.md": withSources(["a-level2"]),
    "c-both.md": withSources(["z-level1.md", URL_B]),
    "z-level1.md": withSources([URL_A]),
  });
  const plan = planCascade(indexOf(vault), ["url:https://example.com/a"]);
  expect(plan.delete.map((item: { key: string }) => item.key).sort()).toEqual(["v::a-level2.md", "v::b-level3.md", "v::z-level1.md"]);
  expect(plan.review.map((item: { key: string }) => item.key)).toEqual(["v::c-both.md"]);
});

test("the source note itself is never in the plan, even when it cites its own parent", () => {
  const vault = makeVault({ "src.md": withSources(["parent.md"]), "kid.md": withSources(["src.md"]) });
  const plan = planCascade(indexOf(vault), ["file:v:src"]);
  expect(plan.delete.map((item: { key: string }) => item.key)).toEqual(["v::kid.md"]);
});

test("a source note that is itself built from a deleted source is still left for its owner", () => {
  const vault = makeVault({ "src.md": withSources([URL_A]), "kid.md": withSources(["src.md"]) });
  const plan = planCascade(indexOf(vault), ["url:https://example.com/a", "file:v:src"]);
  expect(plan.delete.map((item: { key: string }) => item.key)).toEqual(["v::kid.md"]);
});

test("impossible calendar dates are refused, with or without a time", () => {
  for (const created of ["2026-02-30", "2026-04-31T10:00:00Z", "2026-13-01"]) {
    expect(problemsOf({ created, updated: "2026-12-31" }), created).toContain("created-invalid");
  }
  expect(problemsOf({ created: "2026-02-28T10:00:00Z", updated: "2026-03-01" })).toEqual([]);
});

test("a note that could not be read blocks the cascade", () => {
  const vault = makeVault({ "derived.md": withSources([URL_A]), ".Hidden.md.icloud": "stub" });
  const index = indexOf(vault);
  expect(index.blockers).toEqual([expect.objectContaining({ reason: "not-downloaded" })]);
  const plan = planCascade(index, ["url:https://example.com/a"]);
  expect(plan.blocked).toBe(true);
  expect(() => applyCascade({ stores: [{ label: "v", root: vault }], plan, backupRoot: null, stamp: "s" })).toThrow();
  expect(fs.existsSync(path.join(vault, "derived.md"))).toBe(true);
});

test("apply copies the originals out, deletes only the planned notes and writes a log", () => {
  const vault = makeVault({ "derived.md": withSources([URL_A]), "keep.md": withSources([URL_B]), "mixed.md": withSources([URL_A, URL_B]) });
  const original = fs.readFileSync(path.join(vault, "derived.md"), "utf8");
  const backups = tempDir("ksi-backup-");
  const stores = [{ label: "v", root: vault }];
  const plan = planCascade(indexOf(vault), ["url:https://example.com/a"]);
  const result = applyCascade({ stores, plan, backupRoot: backups, stamp: "stamp" });
  expect(result.log.deleted.map((item: { key: string }) => item.key)).toEqual(["v::derived.md"]);
  expect(fs.existsSync(path.join(vault, "derived.md"))).toBe(false);
  expect(fs.existsSync(path.join(vault, "keep.md"))).toBe(true);
  expect(fs.existsSync(path.join(vault, "mixed.md"))).toBe(true);
  expect(fs.readFileSync(path.join(backups, "stamp", "v", "derived.md"), "utf8")).toBe(original);
  expect(JSON.parse(fs.readFileSync(path.join(backups, "stamp", "cascade-log.json"), "utf8")).deleted).toHaveLength(1);
});

test("a note edited after the index was built is skipped, not deleted", () => {
  const vault = makeVault({ "derived.md": withSources([URL_A]), "other.md": withSources([URL_A], "Other") });
  const plan = planCascade(indexOf(vault), ["url:https://example.com/a"]);
  fs.appendFileSync(path.join(vault, "derived.md"), "a late edit\n");
  const result = applyCascade({ stores: [{ label: "v", root: vault }], plan, backupRoot: null, stamp: "s" });
  expect(result.log.skipped).toEqual([{ key: "v::derived.md", reason: "changed-since-index" }]);
  expect(result.log.deleted.map((item: { key: string }) => item.key)).toEqual(["v::other.md"]);
  expect(fs.existsSync(path.join(vault, "derived.md"))).toBe(true);
});

test("erase without a backup leaves no copy anywhere", () => {
  const vault = makeVault({ "derived.md": withSources([URL_A]) });
  const plan = planCascade(indexOf(vault), ["url:https://example.com/a"]);
  const result = applyCascade({ stores: [{ label: "v", root: vault }], plan, backupRoot: null, stamp: "s" });
  expect(result.backupDir).toBeNull();
  expect(fs.readdirSync(vault)).toEqual([]);
});

test("the command line plans first, refuses unsafe options, and round-trips a source deletion", () => {
  const vault = makeVault({ "src/paper.md": "---\ntitle: Paper\n---\nthe original source note\n", "derived.md": withSources(["src/paper.md"]), "deep.md": withSources(["derived.md"]) });
  const base = ["cascade", "--store", `v=${vault}`, "--source", "src/paper.md"];
  const dry = run("source-index.mjs", base);
  expect(dry.status).toBe(0);
  expect(dry.out).toContain("2 note(s) derived from the source would be deleted");
  expect(fs.readdirSync(vault).sort()).toEqual(["deep.md", "derived.md", "src"]);

  const noFlag = run("source-index.mjs", [...base, "--apply"]);
  expect(noFlag.status).toBe(2);
  expect(noFlag.err).toContain("--backup-dir DIR or --erase-no-backup");
  const both = run("source-index.mjs", [...base, "--apply", "--erase-no-backup", "--backup-dir", tempDir("ksi-b-")]);
  expect(both.status).toBe(2);
  const inside = run("source-index.mjs", [...base, "--apply", "--backup-dir", path.join(vault, "bk")]);
  expect(inside.status).toBe(2);
  expect(inside.err).toContain("outside every store");
  expect(fs.readdirSync(vault).sort()).toEqual(["deep.md", "derived.md", "src"]);

  // The owner deletes the source; the tool then removes what was built from it.
  fs.unlinkSync(path.join(vault, "src", "paper.md"));
  const backups = tempDir("ksi-back-");
  const real = run("source-index.mjs", [...base, "--apply", "--backup-dir", backups]);
  expect(real.status).toBe(0);
  expect(real.out).toContain("Deleted 2");
  expect(fs.readdirSync(vault)).toEqual(["src"]);
});

test("the command line refuses to apply when a note is unreadable and builds an index report outside the store", () => {
  const vault = makeVault({ "derived.md": withSources([URL_A]), ".Gone.md.icloud": "stub" });
  const blocked = run("source-index.mjs", ["cascade", "--store", `v=${vault}`, "--source", URL_A, "--apply", "--erase-no-backup"]);
  expect(blocked.status).toBe(2);
  expect(blocked.out).toContain("BLOCKED");
  expect(fs.existsSync(path.join(vault, "derived.md"))).toBe(true);
  const out = tempDir("ksi-idx-");
  const build = run("source-index.mjs", ["build", "--store", `v=${vault}`, "--out", out]);
  expect(build.status).toBe(0);
  expect(JSON.parse(fs.readFileSync(path.join(out, "source-index.json"), "utf8")).blockers).toHaveLength(1);
  expect(run("source-index.mjs", ["build", "--store", `v=${vault}`, "--out", path.join(vault, "r")]).status).toBe(2);
});
