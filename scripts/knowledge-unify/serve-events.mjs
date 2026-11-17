#!/usr/bin/env node
// Serves the promote outbox as the adapter feed `GET /h1/events?after=&limit=` that the host's puller reads (ADR-013,
// ADR-024), plus `/h1/manifest`, `/h1/health` and `POST /h1/memory.tombstone` (ADR-025). Only the tombstone route writes
// (it erases proposed page text); the feed is read-only. It holds no host credential, only the host's PUBLIC key (ADR-012).
// A request must carry a host-signed token for this tenant and this adapter with the scope of the route; a token is accepted once
// (its id is remembered until it expires). Every refusal is a bare 401 with no reason, so a caller learns nothing.
// It listens on 127.0.0.1 by default; put TLS in front of it for anything else, because the puller needs https off loopback.
// Settings (environment): ADAPTER_PUBLIC_KEY_PEM, CLIENT_SLUG, ADAPTER_ID, KNOWLEDGE_OUTBOX_DIR, optional PORT, HOST.
// Usage: node scripts/knowledge-unify/serve-events.mjs
import http from "node:http";
import { registerHooks } from "node:module";
import { ADAPTER_VERSION, eraseEvents, OutboxBusyError, readOutbox } from "./promote.mjs";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 50;
export const MAX_RESPONSE_BYTES = 1_048_576; // the host's cap on one feed page (adapterEventsPuller.ts)
const MAX_URL_CHARS = 200;

const whole = (raw, fallback, max) => {
  if (raw === null) return fallback;
  if (!/^\d{1,12}$/.test(raw)) return null;
  const value = Number(raw);
  return value <= max ? value : null;
};

/** The events a caller has not seen, cut so the JSON stays under the host's page cap. Pure. */
export function pageOf(events, after, limit) {
  const unseen = events.filter((event) => event.seq > after);
  const body = (list) => ({ ok: true, events: list, next: list.length ? list[list.length - 1].seq : after, hasMore: unseen.length > list.length });
  let take = unseen.slice(0, limit);
  while (take.length > 1 && Buffer.byteLength(JSON.stringify(body(take))) > MAX_RESPONSE_BYTES) take = take.slice(0, Math.ceil(take.length / 2));
  return body(take);
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_TARGETS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX32 = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** What this adapter tells the host about itself. Deletion limits are stated, not implied (ADR-025). */
export function manifestOf(adapterId) {
  return {
    contractVersion: "h1",
    adapterId,
    displayName: "Knowledge",
    adapterVersion: ADAPTER_VERSION,
    publisher: "Veloce",
    license: "Proprietary",
    operations: ["manifest", "health", "events", "memory.propose", "memory.tombstone"],
    tasks: [],
    sideEffectCeiling: "read",
    deletionGuarantee: "receipt",
    deletionScope: "The receipt covers this adapter's outbox of proposed pages only. It does not cover the owner's vault pages, host backups taken before withdrawal, or anything published elsewhere.",
  };
}

const ROUTES = {
  "/h1/events": { method: "GET", operation: "events" },
  "/h1/manifest": { method: "GET", operation: "manifest" },
  "/h1/health": { method: "GET", operation: "health" },
  "/h1/memory.tombstone": { method: "POST", operation: "memory.tombstone" },
};

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

/** The tombstone request body, or null if it is not exactly the contract's shape for this tenant and adapter. */
function parseTombstone(body, tenantSlug, adapterId) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (body.tenantSlug !== tenantSlug || body.adapterId !== adapterId || typeof body.eventId !== "string" || !UUID.test(body.eventId)) return null;
  const { targets } = body;
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > MAX_TARGETS) return null;
  for (const target of targets) {
    if (!target || typeof target !== "object" || !HEX32.test(target.adapterEventId) || !HEX64.test(target.contentSha256)) return null;
  }
  return { eventId: body.eventId, targets: targets.map((target) => ({ adapterEventId: target.adapterEventId, contentSha256: target.contentSha256 })) };
}

/**
 * The request handler. `verify(token, operation)` returns the token's claims or null (the CLI wires the host's own verifier
 * in); `now()` is in seconds. A token id is remembered until its expiry, so the same token cannot be used twice.
 */
export function createEventsHandler({ outbox, verify, tenantSlug, adapterId, now = () => Math.floor(Date.now() / 1000) }) {
  const seen = new Map();
  return async function handle(req, res) {
    const send = (status, value) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(value === undefined ? "" : JSON.stringify(value));
    };
    try {
      if ((req.url ?? "").length > MAX_URL_CHARS) return send(414);
      const url = new URL(req.url ?? "/", "http://localhost");
      const route = Object.hasOwn(ROUTES, url.pathname) ? ROUTES[url.pathname] : null;
      if (!route) return send(404);
      if (req.method !== route.method) return send(405);
      const header = req.headers.authorization ?? "";
      const claims = /^Bearer \S+$/.test(header) ? verify(header.slice(7), route.operation) : null;
      const t = now();
      for (const [jti, exp] of seen) if (exp <= t) seen.delete(jti);
      if (!claims || seen.has(claims.jti)) return send(401);
      seen.set(claims.jti, claims.exp);
      if (route.operation === "manifest") return send(200, manifestOf(adapterId));
      if (route.operation === "health") {
        try {
          readOutbox(outbox);
          return send(200, { ok: true });
        } catch {
          return send(503, { ok: false });
        }
      }
      if (route.operation === "memory.tombstone") {
        const request = parseTombstone(await readJson(req), tenantSlug, adapterId);
        if (!request) return send(400, { ok: false, error: "invalid_input" });
        try {
          const result = eraseEvents({ outbox, tenantSlug, adapterId, ...request });
          return result.ok ? send(200, result) : send(409, { ok: false, error: result.error });
        } catch (error) {
          return error instanceof OutboxBusyError ? send(503, { ok: false, error: "busy" }) : send(500, { ok: false });
        }
      }
      const after = whole(url.searchParams.get("after"), 0, Number.MAX_SAFE_INTEGER);
      const limit = whole(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
      if (after === null || limit === null || limit < 1) return send(400, { ok: false });
      try {
        return send(200, pageOf(readOutbox(outbox).events, after, limit));
      } catch {
        return send(500, { ok: false }); // a malformed or gapped outbox fails closed, and says nothing about it
      }
    } catch {
      return send(500, { ok: false });
    }
  };
}

/** Loads the host's own token verifier. Its source imports siblings without a file extension, so add `.ts` when needed. */
async function loadVerifier() {
  registerHooks({
    resolve(specifier, context, next) {
      try {
        return next(specifier, context);
      } catch (error) {
        if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) return next(`${specifier}.ts`, context);
        throw error;
      }
    },
  });
  return import("../../src/lib/adapterTokens.ts").catch(() => {
    throw new Error("run this with a Node that can load TypeScript files (Node 22.18 or newer)");
  });
}

async function main() {
  const need = (name) => {
    const value = (process.env[name] ?? "").trim();
    if (!value) throw new Error(`REFUSED: ${name} is not set`);
    return value;
  };
  const publicKey = need("ADAPTER_PUBLIC_KEY_PEM").replace(/\\n/g, "\n");
  const tenant = need("CLIENT_SLUG");
  const adapterId = need("ADAPTER_ID");
  const outbox = need("KNOWLEDGE_OUTBOX_DIR");
  const port = Number(process.env.PORT ?? 3946);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("REFUSED: PORT must be a whole number from 1 to 65535");
  const { verifyAdapterToken } = await loadVerifier();
  readOutbox(outbox); // fail at start, not on the first request, if the outbox is unreadable
  try {
    verifyAdapterToken({ token: "x", publicKey, expectedTenant: tenant, expectedAdapterId: adapterId, requiredOperation: "events" });
  } catch {
    throw new Error("REFUSED: ADAPTER_PUBLIC_KEY_PEM is not an Ed25519 public key");
  }
  const verify = (token, operation) => {
    try {
      const result = verifyAdapterToken({ token, publicKey, expectedTenant: tenant, expectedAdapterId: adapterId, requiredOperation: operation });
      return result.ok ? result.claims : null;
    } catch {
      return null;
    }
  };
  http.createServer(createEventsHandler({ outbox, verify, tenantSlug: tenant, adapterId })).listen(port, process.env.HOST ?? "127.0.0.1", () => console.log(`knowledge events feed listening on port ${port}`));
}

if (process.argv[1]?.endsWith("/knowledge-unify/serve-events.mjs")) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
}
