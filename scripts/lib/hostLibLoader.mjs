// Loads the host's TypeScript libraries (src/lib) for the adapter commands (Veloce phase 2 slice 2d, ADR-015).
//
// Two ways, chosen by what is on disk, never by a setting:
//   - dist/adapter-sync/<name>.js exists (the job image, built by scripts/build-adapter-sync.mjs): the compiled file is
//     required directly and the `typescript` package is not needed.
//   - otherwise (a checkout): the .ts source is transpiled on the fly with the `typescript` package.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const COMPILED_DIR = ["dist", "adapter-sync"];

export function createHostLibLoader(root) {
  const compiledDir = path.join(root, ...COMPILED_DIR);
  const compiled = existsSync(compiledDir);
  const rootRequire = createRequire(path.join(root, "package.json"));
  const cache = new Map();

  function loadFromSource(name) {
    const ts = rootRequire("typescript");
    const file = path.join(root, "src", "lib", `${name}.ts`);
    const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const mod = { exports: {} };
    cache.set(name, mod.exports);
    const nodeRequire = createRequire(file);
    new Function("require", "module", "exports", output)((id) => (id.startsWith("./") ? loadLib(id.slice(2)) : nodeRequire(id)), mod, mod.exports);
    return mod.exports;
  }

  function loadLib(name) {
    if (compiled) return rootRequire(path.join(compiledDir, `${name}.js`));
    if (cache.has(name)) return cache.get(name);
    return loadFromSource(name);
  }
  return loadLib;
}
