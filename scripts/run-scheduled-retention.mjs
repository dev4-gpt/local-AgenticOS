#!/usr/bin/env node
// Entry point of the scheduled retention job (infra/retention-job, tracker item 9b). A scheduler runs this once a day;
// it runs the existing retention command for one client with every confirmation flag it needs, and names its
// deployment so only the recorded background owner actually purges (QM-6c, item 9c).
//
// Settings come from environment variables; this file never prints their values.
//   CLIENT_SLUG                  required: the client's canonical slug
//   BACKGROUND_DEPLOYMENT_ID     required: must equal the id recorded as the background owner, or the run does nothing
//   RETENTION_APPLY              "true" to delete for real; anything else is a dry run (the default)
//   INCLUDE_ADAPTER_HOST         "true" once the adapter host migrations are installed for this client
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   required, injected from the secret manager
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Every --confirm-retention-* flag the lifecycle command demands on a real run. A test compares this list with the
 * command's own source, so adding a retention step there without adding its flag here fails the build.
 */
export const CONFIRM_FLAGS = [
  "--confirm-retention-records", "--confirm-retention-learning", "--confirm-retention-sources", "--confirm-retention-notebooks",
  "--confirm-retention-research", "--confirm-retention-runtime", "--confirm-retention-support", "--confirm-retention-room",
  "--confirm-retention-pipeline", "--confirm-retention-board-loop", "--confirm-retention-visual-qa", "--confirm-retention-paperclip",
  "--confirm-retention-hermes", "--confirm-retention-ruflo", "--confirm-retention-onboarding-tokens", "--confirm-retention-rate-limits",
  "--confirm-retention-audit-budget", "--confirm-retention-jobs", "--confirm-retention-credit",
];
export const ADAPTER_CONFIRM_FLAG = "--confirm-retention-adapter";
const SLUG = /^[a-z][a-z0-9-]{2,40}$/;
const DEPLOYMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

/** Turns the environment into the lifecycle command's arguments, or says what is wrong. Pure; touches nothing. */
export function buildArgs(env) {
  const slug = env.CLIENT_SLUG ?? "";
  if (!SLUG.test(slug)) return { error: "CLIENT_SLUG must be a canonical client slug" };
  const deploymentId = env.BACKGROUND_DEPLOYMENT_ID ?? "";
  if (!DEPLOYMENT_ID.test(deploymentId)) return { error: "BACKGROUND_DEPLOYMENT_ID must be a valid deployment id" };
  if (!env.SUPABASE_URL) return { error: "SUPABASE_URL is required" };
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return { error: "SUPABASE_SERVICE_ROLE_KEY is required" };
  const flag = (name) => {
    const value = env[name];
    return value === undefined || value === "" || value === "false" ? false : value === "true" ? true : null;
  };
  const apply = flag("RETENTION_APPLY");
  const includeAdapterHost = flag("INCLUDE_ADAPTER_HOST");
  if (apply === null) return { error: 'RETENTION_APPLY must be "true" or "false"' };
  if (includeAdapterHost === null) return { error: 'INCLUDE_ADAPTER_HOST must be "true" or "false"' };
  const args = ["--mode", "retention", "--slug", slug, "--deployment-id", deploymentId];
  if (includeAdapterHost) args.push("--include-adapter-host");
  if (apply) args.push("--apply", ...CONFIRM_FLAGS, ...(includeAdapterHost ? [ADAPTER_CONFIRM_FLAG] : []));
  return { args, apply, includeAdapterHost, slug, deploymentId };
}

async function main() {
  const built = buildArgs(process.env);
  if ("error" in built) {
    console.error(JSON.stringify({ event: "retention-job-refused", reason: built.error }));
    process.exit(2);
  }
  const started = Date.now();
  console.log(JSON.stringify({ event: "retention-job-start", tenant: built.slug, deploymentId: built.deploymentId, apply: built.apply, includeAdapterHost: built.includeAdapterHost }));
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "client-lifecycle.mjs");
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...built.args], { stdio: "inherit", env: process.env });
    child.on("close", (status) => resolve(status ?? 1));
    child.on("error", () => resolve(1));
  });
  console.log(JSON.stringify({ event: "retention-job-end", tenant: built.slug, exitCode: code, ms: Date.now() - started }));
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
