#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const envFile = valueAfter("--env-file");
const port = valueAfter("--port") || "3939";
const publicBaseUrl = valueAfter("--public-base-url");
const gcpAuth = args.includes("--gcp-auth");
const checkConfig = args.includes("--check-config");
const buildProduction = args.includes("--build-production");
const production = args.includes("--production");
const env = { ...process.env };

const localSourceCommit = cleanLocalSourceCommit();
if (localSourceCommit) env.VELOCE_BUILD_SOURCE_COMMIT = localSourceCommit;
else delete env.VELOCE_BUILD_SOURCE_COMMIT;

if ((checkConfig && (buildProduction || production)) || (buildProduction && production)) {
  console.error("Choose one of --check-config, --build-production, or --production.");
  process.exit(1);
}

if (envFile) {
  const absolute = path.resolve(process.cwd(), envFile);
  if (!existsSync(absolute)) {
    console.error(`Env file not found: ${absolute}`);
    process.exit(1);
  }
  const mode = statSync(absolute).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    console.error(`Refusing to load ${absolute}: set permissions to 600 so only you can read it.`);
    console.error(`Run: chmod 600 ${JSON.stringify(absolute)}`);
    process.exit(1);
  }
  Object.assign(env, parseEnv(readFileSync(absolute, "utf8")));
}

env.PORT = port;
// Keep the client edition's Turbopack lock and generated route types separate
// from the owner/operator dev server when both are opened from this checkout.
env.VELOCE_DIST_DIR = env.VELOCE_DIST_DIR || (buildProduction || production ? ".next-client-prod" : ".next-client");
env.VELOCE_CLIENT_EDITION = "1";
env.AGENTIC_OS_DISABLE_LOCAL_CLI = env.AGENTIC_OS_DISABLE_LOCAL_CLI || "1";
env.AGENTIC_OS_DISABLE_LOCAL_FILES = env.AGENTIC_OS_DISABLE_LOCAL_FILES || "1";
env.AGENTIC_OS_REQUIRE_APPROVALS = env.AGENTIC_OS_REQUIRE_APPROVALS || "1";
env.AGENTIC_OS_LOCATION = env.AGENTIC_OS_LOCATION || "Client runtime";
env.CLIENT_RUNTIME_ENFORCE_AUTH = env.CLIENT_RUNTIME_ENFORCE_AUTH || "1";
if (publicBaseUrl) {
  let parsed;
  try { parsed = new URL(publicBaseUrl); } catch { parsed = null; }
  if (!parsed || parsed.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    console.error("Refusing --public-base-url: provide a public HTTPS tunnel URL.");
    process.exit(1);
  }
  env.CLIENT_RUNTIME_BASE_URL = parsed.toString().replace(/\/$/, "");
} else {
  env.CLIENT_RUNTIME_BASE_URL = env.CLIENT_RUNTIME_BASE_URL || `http://127.0.0.1:${port}`;
}
if (gcpAuth) env.CLIENT_RUNTIME_LOCAL_GCLOUD_AUTH = "1";
env.CLIENT_ALLOWED_ROUTES = env.CLIENT_ALLOWED_ROUTES || "/,/context,/orchestrate,/create,/credentials,/capabilities,/deliver,/paperclip,/room,/pipeline,/claude,/openclaw,/hermes,/antigravity,/codex,/kimi,/glm,/glm-code,/grok,/freeclaude,/fusion,/sakana,/local,/engine,/agent-kanban,/loop,/ruflo,/goals,/journal,/seo,/seo-guide,/opendesign,/web-studio,/flow-lab,/integrations,/video,/studio,/openmontage,/music,/games,/thumbnails,/notebook,/kanban,/memory,/leads,/radar,/guide";
env.CLIENT_ALLOWED_API_ROUTES = env.CLIENT_ALLOWED_API_ROUTES || "/api/capabilities,/api/speech/transcribe,/api/client-runtime/credentials,/api/client-runtime/credentials/revoke,/api/client-runtime/credits,/api/client-runtime/credits/checkout,/api/client-runtime/manifest-proposals,/api/client-runtime/credential-submissions,/api/client-runtime/requests,/api/client-runtime/artifacts,/api/client-runtime/visual-qa,/api/client-runtime/hosted-jobs,/api/client-runtime/executions,/api/client-runtime/intent,/api/client-runtime/delivery,/api/client-runtime/memory-import,/api/client-runtime/source-import,/api/client-runtime/memory-graph,/api/client-runtime/provider-history,/api/client-runtime/telemetry,/api/client-runtime/observability,/api/client-runtime/build-identity,/api/client-runtime/records,/api/client-runtime/research,/api/client-runtime/notebooks,/api/client-runtime/notebook-sources,/api/client-runtime/budget,/api/client-runtime/skills,/api/client-runtime/learning,/api/client-runtime/ecc,/api/client-runtime/workflows,/api/client-runtime/paperclip,/api/client-runtime/room,/api/client-runtime/pipeline,/api/client-runtime/boards,/api/client-runtime/loop,/api/client-runtime/ruflo,/api/client-runtime/hermes-content-factory,/api/client-runtime/jobs,/api/internal/client-runtime/jobs,/api/internal/client-runtime/delivery,/api/internal/client-runtime/visual-qa-dispatch,/api/client-auth/session";
// tenant-data and artifacts are the record and artifact lanes. They exist in
// both environments, but were missing from this default while the cloud
// manifest enabled them, so every local tenant record answered 403
// capability_not_enabled while the same call succeeded in cloud. That is a
// parity defect in the launcher, not in the runtime.
env.CLIENT_ENABLED_CAPABILITIES = env.CLIENT_ENABLED_CAPABILITIES || "tenant-data,artifacts,web-studio,design-intelligence,immersive-scroll-site,asset-sequencing,flow-lab,knowledge,delivery,quality,visual-qa,text-agents,research,notebook,orchestration";
env.CLIENT_PROVIDER_ALLOWLIST = env.CLIENT_PROVIDER_ALLOWLIST || "ANTHROPIC_API_KEY,OPENAI_API_KEY,OPENROUTER_API_KEY,GEMINI_API_KEY,MOONSHOT_API_KEY,ELEVENLABS_API_KEY,ELEVENLABS_MUSIC_API_KEY,HEYGEN_API_KEY,SUNO_API_KEY,GLM_API_KEY,XAI_API_KEY,SAKANA_API_KEY,GROQ_API_KEY,FIRECRAWL_API_KEY,BRAVE_API_KEY,HUNTER_API_KEY,SUPABASE_URL,SUPABASE_ANON_KEY";
env.CLIENT_PROVIDER_CALLS_ENABLED = env.CLIENT_PROVIDER_CALLS_ENABLED || "0";
if (!["0", "1"].includes(env.CLIENT_PROVIDER_CALLS_ENABLED)) {
  console.error("CLIENT_PROVIDER_CALLS_ENABLED must be 0 or 1.");
  process.exit(1);
}
env.CLIENT_ENABLED_TRAITS = env.CLIENT_ENABLED_TRAITS || "context-compression";
env.CLIENT_INTENT_ROUTING_ENABLED = env.CLIENT_INTENT_ROUTING_ENABLED || "1";

// Authenticated local parity needs three things the launcher cannot invent: a
// Supabase project to validate the session against, the tenant slug, and the
// email allowlist. Without them the runtime starts happily and then answers 401
// to everything, because clientAuth returns false for every user when the
// allowlist is empty under client edition. That silence is expensive to debug,
// so say it once, up front. These are checks, not defaults -- the launcher must
// not guess a tenant or an operator identity.
const parityBlockers = [];
if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) parityBlockers.push("SUPABASE_URL and SUPABASE_ANON_KEY (pass --env-file; values are never printed)");
if (!env.CLIENT_SLUG?.trim()) parityBlockers.push("CLIENT_SLUG (non-secret, e.g. the tenant slug you are dogfooding)");
if (!env.CLIENT_ALLOWED_USER_EMAILS?.trim()) parityBlockers.push("CLIENT_ALLOWED_USER_EMAILS (non-secret, comma separated)");
if (env.CLIENT_PROVIDER_CALLS_ENABLED === "1" && !env.CLIENT_MODEL_ALLOWLIST?.trim()) parityBlockers.push("CLIENT_MODEL_ALLOWLIST (non-secret; required only for provider work)");

console.log(`${checkConfig ? "Checking" : buildProduction ? "Building" : "Starting"} Veloce client-runtime local test on http://127.0.0.1:${port}`);
if (publicBaseUrl) console.log("Public HTTPS callback configured for Cloud Tasks parity; tunnel lifecycle remains manual.");
if (env.CLIENT_RUNTIME_LOCAL_GCLOUD_AUTH === "1") console.log("Local development storage and Cloud Tasks identity enabled through the explicit gcloud auth path; the access token is never printed.");
if (publicBaseUrl && env.CLIENT_RUNTIME_LOCAL_GCLOUD_AUTH !== "1") console.log("Full tunnel parity also needs --gcp-auth (or CLIENT_RUNTIME_LOCAL_GCLOUD_AUTH=1) so Cloud Tasks can authenticate from this laptop.");
console.log("Loaded credential names only; secret values are not printed.");
console.log(`Local source identity: ${localSourceCommit ?? "unverified (dirty checkout or Git metadata unavailable)"}.`);
console.log(`Provider calls ${env.CLIENT_PROVIDER_CALLS_ENABLED === "1" ? "enabled by explicit configuration" : "disabled"}.`);
if (parityBlockers.length) {
  console.log("");
  console.log("Unauthenticated browsing will work. Authenticated local parity will NOT, because:");
  for (const blocker of parityBlockers) console.log(`  - missing ${blocker}`);
  console.log("See docs/V96-EXTERNAL-CORPUS-INTEGRATION.md (Wave 2) for the exact command.");
  console.log("");
}

if (checkConfig) process.exit(0);

const command = buildProduction
  ? ["node_modules/next/dist/bin/next", "build", "--webpack"]
  : production
    ? ["node_modules/next/dist/bin/next", "start", "-p", port, "-H", "127.0.0.1"]
    : ["scripts/run-next-dev.mjs"];
const node24 = "/opt/homebrew/opt/node@24/bin/node";
const nodeMajor = Number(process.versions.node.split(".")[0]);
const supportedNode = nodeMajor >= 22 && nodeMajor < 26
  ? process.execPath : existsSync(node24) ? node24 : null;
if (!supportedNode) {
  console.error(`Veloce AgenticOS requires Node 22 or 24. Current runtime: ${process.version}.`);
  process.exit(1);
}
const child = spawn(buildProduction || production ? supportedNode : process.execPath, command, {
  cwd: process.cwd(),
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function parseEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (key && value) out[key] = value;
  }
  return out;
}

function cleanLocalSourceCommit() {
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: process.cwd(), encoding: "utf8" });
  if (status.status !== 0 || status.stdout.trim()) return null;
  const head = spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: process.cwd(), encoding: "utf8" });
  const commit = head.status === 0 ? head.stdout.trim() : "";
  return /^[0-9a-f]{40}$/i.test(commit) ? commit.toLowerCase() : null;
}
