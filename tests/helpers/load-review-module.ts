import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";

// Execute the real module with explicit boundary doubles, no app server/cloud.
export function loadReviewModule(file: string, mocks: Record<string, unknown>) {
  const filename = resolve(file);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  const realRequire = createRequire(filename);
  new Function("require", "module", "exports", compiled)((id: string) => id in mocks ? mocks[id] : realRequire(id), module, module.exports);
  return module.exports;
}
