#!/usr/bin/env node
// Stands up the empty infrastructure shell for one AGPL adapter candidate (ADR-010, X-10): its own
// container, its own health check, no AGPL source, no live traffic from the app. This is the only script
// allowed to build infra/agpl-candidates/<id>/. It refuses outright if the shell directory contains
// anything that looks like a real adapter was added, so this cannot silently turn into a real deployment.
//
// Usage: node scripts/provision-agpl-candidate-shell.mjs --id trypost [--build] [--run]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const id = valueAfter("--id");
const build = args.includes("--build");
const run = args.includes("--run");

if (!id || !/^[a-z][a-z0-9-]{1,40}$/.test(id)) fail("--id is required and must be a lowercase candidate id");

const dir = path.resolve(process.cwd(), "infra/agpl-candidates", id);
if (!existsSync(dir)) fail(`No shell directory for ${id}: ${dir}`);

const manifestPath = path.join(dir, "manifest.json");
if (!existsSync(manifestPath)) fail(`${id} has no manifest.json`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.state !== "blocked-legal-review") {
  fail(`${id}'s manifest state is "${manifest.state}", not "blocked-legal-review". This script only builds blocked shells; a cleared candidate's real deploy script is a separate, deliberate change.`);
}

// The guard: anything beyond the known shell files means a real adapter checkout has landed here.
const ALLOWED = new Set(["Dockerfile", "health-server.mjs", "manifest.json", ".dockerignore"]);
for (const entry of listFilesRecursively(dir)) {
  const top = path.relative(dir, entry).split(path.sep)[0];
  if (!ALLOWED.has(top)) {
    fail(`${id}'s shell contains "${top}", which is not one of the known empty-shell files. If this is the real AGPL project's source, stop: it must not be built until legal sign-off is recorded in docs/architecture/adr-010-agpl-candidate-adapter-separation.md.`);
  }
}
const dockerfile = readFileSync(path.join(dir, "Dockerfile"), "utf8");
if (/COPY\s+(?!health-server\.mjs)|ADD\s|git clone|npm install (?!-g)/.test(dockerfile.replace(/#.*$/gm, ""))) {
  fail(`${id}'s Dockerfile copies or installs something beyond the placeholder health server. Refusing to build.`);
}

console.log(`${id}: shell verified empty (state=blocked-legal-review, no AGPL source present).`);

if (build) {
  const result = spawnSync("docker", ["build", "-t", `agpl-candidate-shell-${id}`, dir], { stdio: "inherit" });
  if (result.status !== 0) fail(`docker build failed for ${id}`);
}
if (run) {
  if (!build) fail("--run requires --build in the same invocation");
  const result = spawnSync("docker", ["run", "--rm", "-d", "-p", "8080:8080", `agpl-candidate-shell-${id}`], { stdio: "inherit" });
  if (result.status !== 0) fail(`docker run failed for ${id}`);
  console.log(`${id} shell running at http://localhost:8080/health (no AGPL code, not reachable from the app).`);
}

function listFilesRecursively(root) {
  const out = [];
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) out.push(...listFilesRecursively(full));
    else out.push(full);
  }
  return out;
}
function valueAfter(flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
