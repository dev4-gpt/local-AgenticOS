#!/usr/bin/env node

/**
 * Veloce Local Worker — intentionally small local-first bridge.
 *
 * It binds only to loopback, accepts a one-time user-visible pairing code, and
 * exposes a closed vocabulary of local jobs. It is not a remote shell, does
 * not listen on the network, and never receives cloud credentials.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "0.1.0";
const DEFAULT_PORT = 43851;
const DEFAULT_ORIGIN = "https://app.veloceos.cloud";
const DEFAULT_STATE_DIR = path.join(os.homedir(), ".veloce-local-worker");
const TEXT_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".json", ".yaml", ".yml", ".csv", ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".html", ".css"]);
const SKIP_DIRECTORIES = new Set([".git", ".next", "node_modules", ".cache", ".DS_Store"]);

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] ?? fallback) : fallback;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeId(value) {
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(value);
}

function safeOrigin(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && !url.pathname.replace(/^\/$/, "") && !url.search && !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function json(response, status, body, origin) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
  });
  response.end(JSON.stringify(body));
}

async function requestJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("payload_too_large");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    throw new Error("invalid_json");
  }
}

function statePaths(stateDir) {
  return { stateDir, grants: path.join(stateDir, "grants.json") };
}

async function loadGrants(stateDir) {
  const file = statePaths(stateDir).grants;
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((grant) => grant && typeof grant === "object" && safeId(String(grant.id)) && typeof grant.path === "string" && ["files", "vault", "repository", "project"].includes(String(grant.kind)));
  } catch {
    return [];
  }
}

async function saveGrants(stateDir, grants) {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await writeFile(statePaths(stateDir).grants, `${JSON.stringify(grants, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function publicGrants(grants) {
  return grants.map((grant) => ({ id: grant.id, kind: grant.kind, label: grant.label || path.basename(grant.path) || grant.id }));
}

async function walkTextFiles(root, visit, state = { files: 0, bytes: 0 }) {
  if (state.files >= 100 || state.bytes >= 5 * 1024 * 1024) return;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (state.files >= 100 || state.bytes >= 5 * 1024 * 1024) return;
    if (entry.isSymbolicLink() || SKIP_DIRECTORIES.has(entry.name)) continue;
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkTextFiles(child, visit, state);
      continue;
    }
    if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const info = await stat(child).catch(() => null);
    if (!info || info.size > 512 * 1024) continue;
    const content = await readFile(child, "utf8").catch(() => null);
    if (content === null || content.includes("\0")) continue;
    state.files += 1;
    state.bytes += Buffer.byteLength(content);
    await visit(child, content);
  }
}

async function searchSelectedSources(grants, input) {
  const scopeId = typeof input.scopeId === "string" ? input.scopeId : "";
  const query = typeof input.query === "string" ? input.query.trim().slice(0, 300) : "";
  const grant = grants.find((candidate) => candidate.id === scopeId);
  if (!grant || !query) throw new Error("local_scope_or_query_invalid");
  const root = await realpath(grant.path).catch(() => null);
  if (!root) throw new Error("local_scope_unavailable");
  const matches = [];
  const needle = query.toLocaleLowerCase();
  await walkTextFiles(root, async (file, content) => {
    if (matches.length >= 20) return;
    const index = content.toLocaleLowerCase().indexOf(needle);
    if (index < 0) return;
    const start = Math.max(0, index - 240);
    const end = Math.min(content.length, index + query.length + 360);
    matches.push({ source: path.relative(root, file), excerpt: content.slice(start, end).replace(/\s+/g, " ").trim() });
  });
  return { scopeId, matches, resultPolicy: "local-until-user-shares" };
}

async function listLocalModels() {
  const response = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(3_000) }).catch(() => null);
  if (!response?.ok) throw new Error("ollama_unavailable");
  const payload = await response.json().catch(() => null);
  const models = Array.isArray(payload?.models) ? payload.models.map((model) => typeof model?.name === "string" ? model.name : null).filter(Boolean).slice(0, 100) : [];
  return { models, resultPolicy: "local-until-user-shares" };
}

async function runLocalModel(input) {
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 12_000) : "";
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(model) || !prompt) throw new Error("local_model_input_invalid");
  const response = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (!response?.ok) throw new Error("ollama_execution_failed");
  const payload = await response.json().catch(() => null);
  const output = typeof payload?.response === "string" ? payload.response.slice(0, 24_000) : "";
  if (!output) throw new Error("ollama_execution_failed");
  return { model, output, resultPolicy: "local-until-user-shares" };
}

async function main() {
  const command = process.argv[2] || "help";
  const stateDir = path.resolve(arg("state-dir", DEFAULT_STATE_DIR));
  if (command === "help") {
    console.log("Usage:\n  node workers/local-worker/worker.mjs init\n  node workers/local-worker/worker.mjs grant --id <slug> --kind <files|vault|repository|project> --path <absolute-path> [--label <label>]\n  node workers/local-worker/worker.mjs start [--port 43851] [--origin https://app.veloceos.cloud]");
    return;
  }
  if (command === "init") {
    await saveGrants(stateDir, await loadGrants(stateDir));
    console.log(`VELOCE_LOCAL_WORKER_STATE=${stateDir}`);
    return;
  }
  if (command === "grant") {
    const id = arg("id");
    const kind = arg("kind");
    const requestedPath = arg("path");
    const label = arg("label") || path.basename(requestedPath);
    if (!safeId(id) || !["files", "vault", "repository", "project"].includes(kind) || !path.isAbsolute(requestedPath)) throw new Error("grant_arguments_invalid");
    const resolved = await realpath(requestedPath).catch(() => null);
    const info = resolved ? await stat(resolved).catch(() => null) : null;
    if (!resolved || !info?.isDirectory()) throw new Error("grant_path_unavailable");
    const grants = (await loadGrants(stateDir)).filter((grant) => grant.id !== id);
    grants.push({ id, kind, label: label.slice(0, 120), path: resolved });
    await saveGrants(stateDir, grants);
    console.log(`VELOCE_LOCAL_WORKER_GRANTED=${id}`);
    return;
  }
  if (command !== "start") throw new Error("unknown_command");

  const allowedOrigin = safeOrigin(arg("origin", DEFAULT_ORIGIN));
  const port = Number(arg("port", String(DEFAULT_PORT)));
  if (!allowedOrigin || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("start_arguments_invalid");
  const pairingCode = randomBytes(18).toString("base64url");
  const pairingCodeHash = hash(pairingCode);
  let pairingAvailable = true;
  const sessions = new Map();
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin === allowedOrigin ? allowedOrigin : null;
    if (request.method === "OPTIONS") {
      if (!origin) return json(response, 403, { ok: false, error: "local_origin_denied" });
      response.writeHead(204, { "access-control-allow-origin": origin, vary: "Origin", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "300" });
      return response.end();
    }
    if (!origin) return json(response, 403, { ok: false, error: "local_origin_denied" });
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const grants = await loadGrants(stateDir);
    if (request.method === "GET" && url.pathname === "/v1/status") return json(response, 200, { ok: true, version: VERSION, paired: sessions.size > 0, grants: publicGrants(grants), allowedOrigin }, origin);
    if (request.method === "POST" && url.pathname === "/v1/pair") {
      try {
        const body = await requestJson(request);
        const code = typeof body.code === "string" ? body.code : "";
        if (!pairingAvailable || !code || hash(code) !== pairingCodeHash) return json(response, 401, { ok: false, error: "pairing_code_invalid" }, origin);
        const token = randomBytes(32).toString("base64url");
        pairingAvailable = false;
        sessions.set(hash(token), Date.now() + 30 * 60_000);
        return json(response, 200, { ok: true, sessionToken: token, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), grants: publicGrants(grants) }, origin);
      } catch (error) {
        return json(response, 400, { ok: false, error: error instanceof Error ? error.message : "pairing_failed" }, origin);
      }
    }
    if (request.method === "POST" && url.pathname === "/v1/jobs") {
      const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
      const expiresAt = sessions.get(hash(token));
      if (!expiresAt || expiresAt < Date.now()) return json(response, 401, { ok: false, error: "local_session_invalid" }, origin);
      try {
        const body = await requestJson(request);
        const type = typeof body.type === "string" ? body.type : "";
        const result = type === "search-selected-sources" ? await searchSelectedSources(grants, body)
          : type === "list-local-models" ? await listLocalModels()
            : type === "run-local-model" ? await runLocalModel(body)
              : null;
        if (!result) return json(response, 400, { ok: false, error: "local_job_type_invalid" }, origin);
        return json(response, 200, { ok: true, type, result }, origin);
      } catch (error) {
        return json(response, 400, { ok: false, error: error instanceof Error ? error.message : "local_job_failed" }, origin);
      }
    }
    return json(response, 404, { ok: false, error: "local_route_not_found" }, origin);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`VELOCE_LOCAL_WORKER_LISTENING=http://127.0.0.1:${port}`);
    console.log(`VELOCE_LOCAL_WORKER_PAIR_CODE=${pairingCode}`);
    console.log("Pairing codes are shown only in this local terminal and sessions expire after 30 minutes.");
  });
  process.on("SIGINT", () => server.close(() => process.exit(0)));
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
}

main().catch((error) => {
  console.error(`VELOCE_LOCAL_WORKER_ERROR=${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 1;
});
