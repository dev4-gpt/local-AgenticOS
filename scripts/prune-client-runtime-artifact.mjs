#!/usr/bin/env node
import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { clientRuntimeArtifactRouteAllowed } from "./lib/client-runtime-artifact-surface.mjs";

const distDir = resolveDistDir(valueAfter("--dist-dir") ?? process.env.VELOCE_DIST_DIR ?? ".next");
const standaloneRoot = path.resolve(valueAfter("--standalone-root") ?? path.join(distDir, "standalone"));

const result = await pruneClientRuntimeArtifact(standaloneRoot);
console.log(`client runtime artifact pruned (${result.removed} disabled route entries removed, ${result.retained} retained)`);

export async function pruneClientRuntimeArtifact(root) {
  const serverRoot = path.resolve(root, distDir, "server");
  const appPathsFile = path.join(serverRoot, "app-paths-manifest.json");
  const appPaths = await readJson(appPathsFile, "app_paths_manifest_missing");
  let removed = 0;
  let retained = 0;

  for (const [entryKey, entryFile] of Object.entries(appPaths)) {
    if (typeof entryFile !== "string") throw new Error("app_paths_manifest_invalid");
    if (clientRuntimeArtifactRouteAllowed(routePath(entryKey))) {
      retained += 1;
      continue;
    }
    await removeEntrypointFiles(path.join(serverRoot, entryFile));
    delete appPaths[entryKey];
    removed += 1;
  }
  await writeJson(appPathsFile, appPaths);
  await pruneFunctionConfig(path.join(serverRoot, "functions-config-manifest.json"));
  return { removed, retained };
}

async function pruneFunctionConfig(file) {
  const manifest = await readJsonIfPresent(file);
  if (!manifest || !manifest.functions || typeof manifest.functions !== "object" || Array.isArray(manifest.functions)) return;
  for (const key of Object.keys(manifest.functions)) {
    if (!clientRuntimeArtifactRouteAllowed(key)) delete manifest.functions[key];
  }
  await writeJson(file, manifest);
}

async function removeEntrypointFiles(file) {
  const directory = path.dirname(file);
  const filename = path.basename(file);
  const stem = filename.replace(/\.js$/, "");
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && (entry.name === filename || entry.name.startsWith(`${stem}.`) || entry.name.startsWith(`${stem}_`)))
    .map((entry) => rm(path.join(directory, entry.name), { force: true })));
}

async function readJson(file, errorCode) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new Error(errorCode);
  }
}

async function readJsonIfPresent(file) {
  try {
    await stat(file);
  } catch {
    return null;
  }
  return readJson(file, "functions_config_manifest_invalid");
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function routePath(entryKey) {
  if (entryKey.endsWith("/page")) return entryKey.slice(0, -5) || "/";
  if (entryKey.endsWith("/route")) return entryKey.slice(0, -6) || "/";
  throw new Error("app_paths_manifest_entry_invalid");
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function resolveDistDir(value) {
  const absolute = path.resolve(value);
  const relative = path.relative(process.cwd(), absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) throw new Error("client_dist_dir_invalid");
  return relative || ".";
}
