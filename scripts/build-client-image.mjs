#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { clientImageBuildArgs } from "./lib/client-image-build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Git ${args[0]} failed; client image build cannot establish source identity`);
  return result.stdout.trim();
}

try {
  const commit = git(["rev-parse", "HEAD"]);
  const clean = git(["status", "--porcelain", "--untracked-files=all"]) === "";
  const args = clientImageBuildArgs(process.env.CLIENT_IMAGE, commit, clean);
  const build = spawnSync("gcloud", args, { cwd: root, stdio: "inherit" });
  if (build.error) throw build.error;
  process.exitCode = build.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Client image build failed");
  process.exitCode = 1;
}
