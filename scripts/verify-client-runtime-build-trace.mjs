#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { clientRuntimeArtifactRouteAllowed } from "./lib/client-runtime-artifact-surface.mjs";

const standaloneRoot = path.resolve(valueAfter("--standalone-root") ?? ".next/standalone");
const serverRoot = path.join(standaloneRoot, ".next", "server");
const failures = [];

const appPaths = await readJson(path.join(serverRoot, "app-paths-manifest.json"), "app_paths_manifest_missing");
if (!Object.hasOwn(appPaths, "/api/client-runtime/build-identity/route")) failures.push("build_identity_route_missing");
for (const [entryKey, entryFile] of Object.entries(appPaths)) {
  const route = routePath(entryKey);
  if (!clientRuntimeArtifactRouteAllowed(route)) failures.push("disallowed_route_manifested");
  if (typeof entryFile !== "string" || !(await exists(path.join(serverRoot, entryFile)))) failures.push("manifested_route_file_missing");
}

const functions = await readJsonIfPresent(path.join(serverRoot, "functions-config-manifest.json"));
for (const route of Object.keys(functions?.functions ?? {})) {
  if (!clientRuntimeArtifactRouteAllowed(route)) failures.push("disallowed_function_manifested");
}

for (const traceFile of await findTraceFiles(serverRoot)) {
  const trace = await readJson(traceFile, "trace_invalid");
  for (const entry of trace.files ?? []) {
    if (forbiddenTracePath(String(entry))) failures.push("forbidden_trace_category");
  }
}

if (failures.length) {
  for (const failure of [...new Set(failures)]) console.error(`client runtime artifact failed: ${failure}`);
  process.exit(1);
}

console.log(`client runtime artifact passed (${Object.keys(appPaths).length} route entries)`);

async function findTraceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTraceFiles(entryPath);
    return entry.name.endsWith(".nft.json") ? [entryPath] : [];
  }));
  return nested.flat();
}

function forbiddenTracePath(value) {
  const normalized = value.replaceAll("\\", "/");
  return /(?:^|\/)Users(?:\/|$)|(?:^|\/)home(?:\/|$)|(?:^|\/)\.(?:claude|codex|agentic-os)(?:\/|$)|(?:^|\/)\.env(?:\.|$)/.test(normalized);
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function readJson(file, errorCode) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { throw new Error(errorCode); }
}

async function readJsonIfPresent(file) {
  try { await stat(file); } catch { return null; }
  return readJson(file, "functions_config_manifest_invalid");
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
