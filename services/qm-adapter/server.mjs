#!/usr/bin/env node
// Veloce h1 shim in front of one QM instance (ADR-011). A separate process: it shares no code with the host. The token
// format and rules below mirror src/lib/adapterTokens.ts and are tested against tokens minted by that module.
// Every route needs a host token. The adapter stays "disabled" in the host registry until metering and retention exist.
import { createHash, createPublicKey, verify } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createQmClient } from "./qm-client.mjs";

export const TOKEN_ISSUER = "veloce-host";
export const MAX_TOKEN_TTL_SECONDS = 300;
export const MAX_CLOCK_SKEW_SECONDS = 30;
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_PROMPT_CHARS = 20_000;
const MAX_TOKEN_CHARS = 4096;
const MAX_TRACKED = 10_000;
const IDEMPOTENCY_TTL_MS = 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,179}$/;
const TENANT_SLUG = /^[a-z][a-z0-9-]{2,40}$/;

/** Checks signature first, then every claim. Returns the claims or null; the reason is deliberately not exposed. */
export function verifyHostToken({ token, publicKey, tenant, adapterId, operation, now = Math.floor(Date.now() / 1000) }) {
  if (typeof token !== "string" || token.length > MAX_TOKEN_CHARS) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const signature = Buffer.from(parts[1], "base64url");
  if (signature.length !== 64) return null;
  if (!verify(null, Buffer.from(parts[0], "utf8"), publicKey, signature)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;
  const { v, iss, aud, scope, jti, iat, exp } = claims;
  if (v !== "h1" || iss !== TOKEN_ISSUER || claims.tenant !== tenant || aud !== adapterId) return null;
  if (!Array.isArray(scope) || !scope.every((op) => typeof op === "string") || !scope.includes(operation)) return null;
  if (typeof jti !== "string" || !UUID.test(jti) || !Number.isInteger(iat) || !Number.isInteger(exp)) return null;
  if (exp <= iat || exp - iat > MAX_TOKEN_TTL_SECONDS || iat > now + MAX_CLOCK_SKEW_SECONDS || exp <= now) return null;
  return claims;
}

/** Single-use token ids, kept in memory until they expire. Full means "refuse", never "forget". */
export function createJtiStore(now = () => Math.floor(Date.now() / 1000)) {
  const seen = new Map();
  return {
    consume(claims) {
      const t = now();
      for (const [jti, exp] of seen) if (exp <= t) seen.delete(jti);
      if (seen.has(claims.jti) || seen.size >= MAX_TRACKED) return false;
      seen.set(claims.jti, claims.exp);
      return true;
    },
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        if (!tooLarge) resolve({ tooLarge: true }); // the caller answers 413, then closes the connection
        tooLarge = true;
        chunks.length = 0; // nothing more is kept
      } else if (!tooLarge) chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolve({ json: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      } catch {
        resolve({ json: undefined });
      }
    });
    req.on("error", () => resolve({ json: undefined }));
  });
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export function createQmAdapterHandler({ manifest, publicKey, tenantSlug, qm, consumeJti, now = () => Date.now() }) {
  const tasks = new Map(); // idempotency key -> { bodyHash, taskId, at }

  function send(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "content-length": Buffer.byteLength(text) });
    res.end(text);
  }
  const fail = (res, status, error) => send(res, status, { ok: false, error });

  async function taskRun(res, body) {
    if (!isObject(body)) return fail(res, 400, "invalid_input");
    if (body.tenantSlug !== tenantSlug) return fail(res, 403, "forbidden");
    if (body.adapterId !== manifest.adapterId) return fail(res, 403, "forbidden");
    if (body.task !== "agent.run") return fail(res, 400, "unknown_task");
    if (typeof body.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(body.idempotencyKey)) return fail(res, 400, "invalid_input");
    if (!Number.isSafeInteger(body.budgetMaxMicros) || body.budgetMaxMicros < 1) return fail(res, 400, "invalid_input");
    const text = isObject(body.input) ? body.input.text : undefined;
    if (typeof text !== "string" || !text.trim() || text.length > MAX_PROMPT_CHARS) return fail(res, 400, "invalid_input");

    const bodyHash = sha256(JSON.stringify([text, body.budgetMaxMicros]));
    const t = now();
    for (const [key, entry] of tasks) if (t - entry.at > IDEMPOTENCY_TTL_MS) tasks.delete(key);
    const prior = tasks.get(body.idempotencyKey);
    if (prior) {
      if (prior.bodyHash !== bodyHash) return fail(res, 409, "idempotency_conflict");
      return send(res, 200, { ok: true, taskId: prior.taskId, state: "queued", replay: true });
    }
    if (tasks.size >= MAX_TRACKED) return fail(res, 503, "busy");
    const submitted = await qm.submit({ text, threadRef: `h1-${sha256(body.idempotencyKey).slice(0, 32)}` });
    if (!submitted.ok) return fail(res, 502, "upstream_unavailable");
    tasks.set(body.idempotencyKey, { bodyHash, taskId: submitted.runId, at: t });
    return send(res, 202, { ok: true, taskId: submitted.runId, state: "queued" });
  }

  async function taskGet(res, url) {
    const id = url.searchParams.get("id") ?? "";
    if (!UUID.test(id)) return fail(res, 400, "invalid_input");
    const run = await qm.getRun(id);
    if (run.notFound) return fail(res, 404, "not_found");
    if (!run.ok) return fail(res, 502, "upstream_unavailable");
    return send(res, 200, { ok: true, taskId: id, state: run.state, ...(run.reply !== undefined ? { reply: run.reply } : {}) });
  }

  async function taskCancel(res, body) {
    const id = isObject(body) ? body.id : undefined;
    if (typeof id !== "string" || !UUID.test(id)) return fail(res, 400, "invalid_input");
    const result = await qm.abort(id);
    if (result.notFound) return fail(res, 404, "not_found");
    if (!result.ok) return fail(res, 502, "upstream_unavailable");
    return send(res, 200, { ok: true, taskId: id, cancelled: result.accepted });
  }

  const ROUTES = {
    "GET /h1/manifest": "manifest",
    "GET /h1/health": "health",
    "POST /h1/task.run": "task.run",
    "GET /h1/task.get": "task.get",
    "POST /h1/task.cancel": "task.cancel",
  };

  return async function handle(req, res) {
    try {
      const url = new URL(req.url ?? "/", "http://shim.local");
      const operation = ROUTES[`${req.method} ${url.pathname}`];
      if (!operation) return fail(res, 404, "not_found");
      const header = req.headers.authorization;
      const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : undefined;
      const claims = verifyHostToken({ token, publicKey, tenant: tenantSlug, adapterId: manifest.adapterId, operation, now: Math.floor(now() / 1000) });
      if (!claims || !consumeJti(claims)) return fail(res, 401, "unauthorized"); // one answer for every reason
      if (operation === "manifest") return send(res, 200, manifest);
      if (operation === "health") {
        const healthy = await qm.health();
        return send(res, healthy ? 200 : 503, { ok: healthy });
      }
      if (operation === "task.get") return await taskGet(res, url);
      const parsed = await readBody(req);
      if (parsed.tooLarge) {
        res.setHeader("connection", "close");
        res.on("finish", () => req.destroy()); // stop reading the rest only after the answer has gone out
        return fail(res, 413, "too_large");
      }
      if (parsed.json === undefined) return fail(res, 400, "invalid_input");
      return operation === "task.run" ? await taskRun(res, parsed.json) : await taskCancel(res, parsed.json);
    } catch {
      return fail(res, 500, "internal_error"); // the cause is not echoed
    }
  };
}

function main() {
  const env = process.env;
  const need = (name) => {
    const value = env[name];
    if (!value || !value.trim()) {
      console.error(`${name} is required`);
      process.exit(2);
    }
    return value;
  };
  const tenantSlug = need("ADAPTER_TENANT_SLUG");
  if (!TENANT_SLUG.test(tenantSlug)) {
    console.error("ADAPTER_TENANT_SLUG is not a valid tenant slug");
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "manifest.json"), "utf8"));
  let publicKey;
  try {
    publicKey = createPublicKey(need("ADAPTER_PUBLIC_KEY_PEM"));
    if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("not ed25519");
  } catch {
    console.error("ADAPTER_PUBLIC_KEY_PEM must be an Ed25519 public key");
    process.exit(2);
  }
  const qm = createQmClient({ baseUrl: need("QM_BASE_URL"), signingSecret: need("QM_SIGNING_SECRET") });
  const jtiStore = createJtiStore();
  const handle = createQmAdapterHandler({ manifest, publicKey, tenantSlug, qm, consumeJti: (claims) => jtiStore.consume(claims) });
  const host = env.HOST ?? "127.0.0.1";
  const port = Number(env.PORT ?? 8090);
  createServer((req, res) => void handle(req, res)).listen(port, host, () => console.log(`qm-adapter shim listening on ${host}:${port} (tenant ${tenantSlug}, adapter ${manifest.adapterId})`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
