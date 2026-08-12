#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const envFile = valueAfter("--env-file");
const port = valueAfter("--port") || "3939";
const env = { ...process.env };

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
env.VELOCE_DIST_DIR = env.VELOCE_DIST_DIR || ".next-client";
env.VELOCE_CLIENT_EDITION = "1";
env.AGENTIC_OS_DISABLE_LOCAL_CLI = env.AGENTIC_OS_DISABLE_LOCAL_CLI || "1";
env.AGENTIC_OS_DISABLE_LOCAL_FILES = env.AGENTIC_OS_DISABLE_LOCAL_FILES || "1";
env.AGENTIC_OS_REQUIRE_APPROVALS = env.AGENTIC_OS_REQUIRE_APPROVALS || "1";
env.AGENTIC_OS_LOCATION = env.AGENTIC_OS_LOCATION || "Client runtime";
env.CLIENT_RUNTIME_ENFORCE_AUTH = env.CLIENT_RUNTIME_ENFORCE_AUTH || "1";
env.CLIENT_RUNTIME_BASE_URL = env.CLIENT_RUNTIME_BASE_URL || `http://127.0.0.1:${port}`;
env.CLIENT_ALLOWED_ROUTES = env.CLIENT_ALLOWED_ROUTES || "/,/context,/orchestrate,/create,/credentials,/capabilities,/deliver,/paperclip,/room,/pipeline,/claude,/openclaw,/hermes,/antigravity,/codex,/kimi,/glm,/glm-code,/grok,/freeclaude,/fusion,/sakana,/local,/engine,/agent-kanban,/loop,/ruflo,/goals,/journal,/seo,/seo-guide,/opendesign,/web-studio,/flow-lab,/integrations,/video,/studio,/openmontage,/music,/games,/thumbnails,/notebook,/kanban,/memory,/leads,/radar,/guide";
env.CLIENT_ALLOWED_API_ROUTES = env.CLIENT_ALLOWED_API_ROUTES || "/api/capabilities,/api/speech/transcribe,/api/client-runtime/credentials,/api/client-runtime/credential-submissions,/api/client-runtime/requests,/api/client-runtime/artifacts,/api/client-runtime/visual-qa,/api/client-runtime/hosted-jobs,/api/client-runtime/executions,/api/client-runtime/intent,/api/client-runtime/delivery,/api/client-runtime/memory-import,/api/client-runtime/memory-graph,/api/client-runtime/provider-history,/api/client-runtime/telemetry,/api/client-runtime/observability,/api/client-runtime/records,/api/client-runtime/research,/api/client-runtime/notebooks,/api/client-runtime/notebook-sources,/api/client-runtime/budget,/api/client-runtime/skills,/api/client-runtime/workflows,/api/client-runtime/paperclip,/api/client-runtime/room,/api/client-runtime/pipeline,/api/client-runtime/boards,/api/client-runtime/loop,/api/client-runtime/ruflo,/api/client-runtime/hermes-content-factory,/api/client-runtime/jobs,/api/internal/client-runtime/jobs,/api/internal/client-runtime/delivery,/api/internal/client-runtime/visual-qa-dispatch,/api/client-auth/session";
env.CLIENT_ENABLED_CAPABILITIES = env.CLIENT_ENABLED_CAPABILITIES || "web-studio,design-intelligence,immersive-scroll-site,asset-sequencing,flow-lab,knowledge,delivery,quality,visual-qa,text-agents,research,notebook,orchestration";
env.CLIENT_PROVIDER_ALLOWLIST = env.CLIENT_PROVIDER_ALLOWLIST || "ANTHROPIC_API_KEY,OPENAI_API_KEY,OPENROUTER_API_KEY,GEMINI_API_KEY,MOONSHOT_API_KEY,ELEVENLABS_API_KEY,ELEVENLABS_MUSIC_API_KEY,HEYGEN_API_KEY,SUNO_API_KEY,GLM_API_KEY,XAI_API_KEY,SAKANA_API_KEY,GROQ_API_KEY,FIRECRAWL_API_KEY,HUNTER_API_KEY,SUPABASE_URL,SUPABASE_ANON_KEY";
env.CLIENT_PROVIDER_CALLS_ENABLED = env.CLIENT_PROVIDER_CALLS_ENABLED || "1";
env.CLIENT_ENABLED_TRAITS = env.CLIENT_ENABLED_TRAITS || "context-compression";
env.CLIENT_INTENT_ROUTING_ENABLED = env.CLIENT_INTENT_ROUTING_ENABLED || "1";

console.log(`Starting Veloce client-runtime local test on http://127.0.0.1:${port}`);
console.log("Loaded credential names only; secret values are not printed.");

const child = spawn(process.execPath, ["scripts/run-next-dev.mjs"], {
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
