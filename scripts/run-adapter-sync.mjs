#!/usr/bin/env node
// Entry point of the scheduled adapter sync job (infra/adapter-sync-job, Veloce phase 2 slice 2d, ADR-015). One run, for
// one tenant and one adapter, does two things in order:
//
//   1. the events puller    (scripts/run-adapter-events-puller.mjs)    adapter -> host: proposals become private notes
//   2. the tombstone dispatcher (scripts/run-adapter-tombstones.mjs)   host -> adapter: erase what the host erased
//
// The steps are independent: the second runs even if the first failed, and a failure in one never hides the other. Each
// step already refuses to act unless this deployment is the recorded background owner (BACKGROUND_DEPLOYMENT_ID).
// The settings are the environment variables those two commands document; this file reads none of them and prints no value.
//
// Exit code: 2 if either step refused to start (a setting is wrong), else 1 if either needs a look, else 0. Cloud Run marks
// a job execution failed on a non-zero exit, which is what the alert policy watches.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** True when this file is the one node was started with. Real paths on both sides: a temp folder may sit behind a symlink. */
function isEntryPoint() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? "");
  } catch {
    return false;
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const STEPS = [
  { name: "events-puller", script: "run-adapter-events-puller.mjs" },
  { name: "tombstones", script: "run-adapter-tombstones.mjs" },
];

/** Worst exit code wins, in the order 2 (refused), 1 (needs a look), 0. Pure. */
export function combineExitCodes(codes) {
  if (codes.some((code) => code === 2)) return 2;
  return codes.every((code) => code === 0) ? 0 : 1;
}

function main() {
  const started = Date.now();
  const results = STEPS.map((step) => {
    const run = spawnSync(process.execPath, [path.join(here, step.script)], { stdio: "inherit", env: process.env });
    // A step killed by a signal or that could not start has no status; treat it as needing a look.
    return { step: step.name, exitCode: typeof run.status === "number" ? run.status : 1 };
  });
  const exitCode = combineExitCodes(results.map((r) => r.exitCode));
  console.log(JSON.stringify({ event: "adapter-sync-end", steps: results, exitCode, ms: Date.now() - started }));
  process.exit(exitCode);
}

if (isEntryPoint()) main();
