#!/usr/bin/env node
// Compiles the host libraries the adapter commands need into dist/adapter-sync/*.js, so the scheduled job image does not
// need the `typescript` package (Veloce phase 2 slice 2d, ADR-015). Which libraries: the two the commands load directly,
// plus everything they import from ./ (followed, so a new import cannot be forgotten).
//
// Usage: node scripts/build-adapter-sync.mjs [--out <dir>]     (default: dist/adapter-sync under the repository root)
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPILED_DIR } from "./lib/hostLibLoader.mjs";

/** True when this file is the one node was started with. Real paths on both sides: a temp folder may sit behind a symlink. */
function isEntryPoint() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** What the commands load directly, by name under src/lib. */
export const ENTRY_LIBS = ["adapterContracts", "adapterTokens", "adapterEventsPuller", "adapterTombstoneDispatcher"];
const RELATIVE_IMPORT = /from\s+["']\.\/([A-Za-z0-9]+)["']/g;

/** The entry libraries and everything they import from ./, in a stable order. Pure apart from reading the sources. */
export function libsToCompile(repoRoot = root) {
  const seen = new Set();
  const queue = [...ENTRY_LIBS];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const source = readFileSync(path.join(repoRoot, "src", "lib", `${name}.ts`), "utf8");
    for (const match of source.matchAll(RELATIVE_IMPORT)) queue.push(match[1]);
  }
  return [...seen].sort();
}

export function buildAdapterSync({ repoRoot = root, outDir = path.join(repoRoot, ...COMPILED_DIR) } = {}) {
  const ts = createRequire(path.join(repoRoot, "package.json"))("typescript");
  mkdirSync(outDir, { recursive: true });
  const libs = libsToCompile(repoRoot);
  for (const name of libs) {
    const source = readFileSync(path.join(repoRoot, "src", "lib", `${name}.ts`), "utf8");
    const { outputText, diagnostics } = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
    if (diagnostics && diagnostics.length > 0) throw new Error(`${name}.ts does not compile: ${diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("; ")}`);
    writeFileSync(path.join(outDir, `${name}.js`), outputText);
  }
  return { outDir, libs };
}

if (isEntryPoint()) {
  const outIndex = process.argv.indexOf("--out");
  const result = buildAdapterSync(outIndex > -1 ? { outDir: path.resolve(process.argv[outIndex + 1] ?? "") } : {});
  console.log(JSON.stringify({ event: "adapter-sync-built", outDir: result.outDir, libs: result.libs }));
}
