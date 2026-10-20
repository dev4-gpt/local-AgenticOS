import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

// Fast checks that keep scripts/phase1-mutation-sweep.mjs honest. They do not run the mutations (that takes
// minutes: npm run verify:phase1-mutations). They fail if the sweep goes stale: a target moved, an owning spec
// vanished, or a mutation no longer produces a different, still-valid file. No data is used.
type Mutation = { id: string; file: string; specs: string[]; original: string; mutated: string };
type Sweep = { TARGETS: { file: string; kind: string; specs: string[] }[]; EQUIVALENT: { file: string; line: number; original: string; reason: string }[]; buildMutations: (root?: string) => (Mutation & { equivalent: string | null })[] };
const load = async () => (await import(pathToFileURL(path.resolve("scripts/phase1-mutation-sweep.mjs")).href)) as Sweep;

test("every target file and every owning spec exists", async () => {
  const { TARGETS } = await load();
  expect(TARGETS.length).toBeGreaterThanOrEqual(13);
  for (const target of TARGETS) {
    expect(existsSync(target.file), target.file).toBe(true);
    expect(target.specs.length).toBeGreaterThan(0);
    for (const spec of target.specs) expect(existsSync(spec), spec).toBe(true);
  }
});

test("the sweep still finds a real number of rules, and each mutation changes its file", async () => {
  const { buildMutations, TARGETS } = await load();
  const mutations = buildMutations();
  const sqlCount = mutations.filter((m) => m.file.endsWith(".sql")).length;
  const tsCount = mutations.filter((m) => m.file.endsWith(".ts")).length;
  expect(sqlCount).toBeGreaterThanOrEqual(80);
  expect(tsCount).toBeGreaterThanOrEqual(80);
  const sources = new Map(TARGETS.map((t) => [t.file, readFileSync(t.file, "utf8")]));
  for (const m of mutations) {
    expect(m.mutated, m.id).not.toBe(sources.get(m.file));
    expect(sources.get(m.file)).toContain(m.original);
  }
});

test("every TypeScript mutation is still syntactically valid", async () => {
  const { buildMutations } = await load();
  for (const m of buildMutations().filter((x) => x.file.endsWith(".ts"))) {
    const out = ts.transpileModule(m.mutated, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    expect(out.diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")) ?? [], m.id).toEqual([]);
  }
});

test("the script restores files on every exit path and refuses a dirty tree", () => {
  const source = readFileSync("scripts/phase1-mutation-sweep.mjs", "utf8");
  expect(source).toContain("finally {");
  expect(source).toMatch(/SIGINT[\s\S]*restore\(\)/);
  expect(source).toContain("Refusing to run");
  expect(source).toContain("--max-failures=1");
  expect(source).toMatch(/Baseline failed/);
});

test("every explained duplicate still matches a real mutation and carries a reason", async () => {
  const { EQUIVALENT, buildMutations } = await load();
  const mutations = buildMutations();
  expect(EQUIVALENT.length).toBeGreaterThan(0);
  for (const entry of EQUIVALENT) {
    expect(entry.reason.length, `${entry.file}:${entry.line}`).toBeGreaterThan(30);
    const match = mutations.filter((m) => m.file === entry.file && m.line === entry.line && m.original.trim() === entry.original);
    expect(match, `${entry.file}:${entry.line} no longer matches; re-check it`).toHaveLength(1);
    expect(match[0].equivalent).toBe(entry.reason);
  }
});
