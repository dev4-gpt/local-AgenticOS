#!/usr/bin/env node
// Entry point of the scheduled adapter sync job (infra/adapter-sync-job, Veloce phase 2 slice 2d, ADR-015). One run, for
// one tenant and one adapter, does two things in order:
//
//   1. the events puller    (scripts/run-adapter-events-puller.mjs)    adapter -> host: proposals become private notes
//   2. the tombstone dispatcher (scripts/run-adapter-tombstones.mjs)   host -> adapter: erase what the host erased
//
// The steps are independent: the second runs even if the first failed, and a failure in one never hides the other. Each
// step already refuses to act unless this deployment is the recorded background owner (BACKGROUND_DEPLOYMENT_ID).
// The settings are the environment variables those two commands document; this file prints no value. It reads them only for
// the sync switch check below (ADAPTER_SYNC_USES_SWITCH, ADR-019), which can end the run before either step starts.
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

/**
 * The sync switch (ADR-019). With ADAPTER_SYNC_USES_SWITCH=true the run first asks the host whether it may go ahead, and
 * when the answer is no it does nothing and never calls the adapter, so a paid adapter service can scale to zero between
 * uses. Without the setting every run goes ahead, as before. The background-owner check comes first so that a deployment
 * that is not the owner never uses up a "sync now" request. Any failure to get an answer is an error, never a silent "go".
 * Returns { action: "run" | "skip" | "error", reason }. The settings it reads are named in the reason, never their values.
 */
export async function syncDecision(env, fetchImpl = fetch) {
  if ((env.ADAPTER_SYNC_USES_SWITCH ?? "").trim() !== "true") return { action: "run", reason: "no switch configured" };
  const get = (name) => (env[name] ?? "").trim();
  const missing = ["CLIENT_SLUG", "ADAPTER_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((name) => !get(name));
  if (missing.length > 0) return { action: "error", reason: `${missing[0]} is not set`, refused: true };
  const base = get("SUPABASE_URL").replace(/\/$/, "");
  const key = get("SUPABASE_SERVICE_ROLE_KEY");
  const ask = async (name, body) => {
    const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!response || !response.ok) return { ok: false, value: null };
    return { ok: true, value: await response.json().catch(() => null) };
  };
  const deployment = get("BACKGROUND_DEPLOYMENT_ID");
  if (deployment) {
    const owner = await ask("client_adapter_background_owner_may_run", { p_deployment_id: deployment });
    if (!owner.ok) return { action: "error", reason: "the background owner check failed" };
    if (owner.value !== true) return { action: "skip", reason: "this deployment is not the background owner" };
  }
  const answer = await ask("client_adapter_sync_switch_job_check", { p_tenant_slug: get("CLIENT_SLUG"), p_adapter_id: get("ADAPTER_ID") });
  if (!answer.ok) return { action: "error", reason: "the sync switch check failed; verify the sync-switch migration" };
  if (answer.value === "skip") return { action: "skip", reason: "the sync switch is off" };
  if (answer.value === "run_on" || answer.value === "run_now" || answer.value === "run_deletions_owed") return { action: "run", reason: answer.value };
  return { action: "error", reason: "the sync switch gave an answer this job does not know" };
}

async function main() {
  const started = Date.now();
  const decision = await syncDecision(process.env);
  if (decision.action !== "run") {
    const exitCode = decision.action === "skip" ? 0 : decision.refused ? 2 : 1;
    if (decision.action === "error") console.error(`${decision.refused ? "REFUSED: " : ""}${decision.reason}`);
    console.log(JSON.stringify({ event: "adapter-sync-end", ...(decision.action === "skip" ? { skipped: true } : {}), reason: decision.reason, steps: [], exitCode, ms: Date.now() - started }));
    process.exit(exitCode);
  }
  if (decision.reason !== "no switch configured") console.log(JSON.stringify({ event: "adapter-sync-switch", run: decision.reason }));
  const results = STEPS.map((step) => {
    const run = spawnSync(process.execPath, [path.join(here, step.script)], { stdio: "inherit", env: process.env });
    // A step killed by a signal or that could not start has no status; treat it as needing a look.
    return { step: step.name, exitCode: typeof run.status === "number" ? run.status : 1 };
  });
  const exitCode = combineExitCodes(results.map((r) => r.exitCode));
  console.log(JSON.stringify({ event: "adapter-sync-end", steps: results, exitCode, ms: Date.now() - started }));
  process.exit(exitCode);
}

if (isEntryPoint()) await main();
