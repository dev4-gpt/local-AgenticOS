#!/usr/bin/env node
// Serves the promote outbox as the adapter feed `GET /h1/events?after=&limit=` that the host's puller reads (ADR-013,
// ADR-024). Read-only: it never writes the outbox, and it holds no host credential, only the host's PUBLIC key (ADR-012).
// A request must carry a host-signed token for this tenant and this adapter with scope `events`; a token is accepted once
// (its id is remembered until it expires). Every refusal is a bare 401 with no reason, so a caller learns nothing.
// It listens on 127.0.0.1 by default; put TLS in front of it for anything else, because the puller needs https off loopback.
// Settings (environment): ADAPTER_PUBLIC_KEY_PEM, CLIENT_SLUG, ADAPTER_ID, KNOWLEDGE_OUTBOX_DIR, optional PORT, HOST.
// Usage: node scripts/knowledge-unify/serve-events.mjs
import http from "node:http";
import { registerHooks } from "node:module";
import { readOutbox } from "./promote.mjs";

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

/**
 * The request handler. `verify(token)` returns the token's claims or null (the CLI wires the host's own verifier in);
 * `now()` is in seconds. A token id is remembered until its expiry, so the same token cannot be used twice.
 */
export function createEventsHandler({ outbox, verify, now = () => Math.floor(Date.now() / 1000) }) {
  const seen = new Map();
  return function handle(req, res) {
    const send = (status, value) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(value === undefined ? "" : JSON.stringify(value));
    };
    if ((req.url ?? "").length > MAX_URL_CHARS) return send(414);
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/h1/events") return send(404);
    if (req.method !== "GET") return send(405);
    const header = req.headers.authorization ?? "";
    const claims = /^Bearer \S+$/.test(header) ? verify(header.slice(7)) : null;
    const t = now();
    for (const [jti, exp] of seen) if (exp <= t) seen.delete(jti);
    if (!claims || seen.has(claims.jti)) return send(401);
    seen.set(claims.jti, claims.exp);
    const after = whole(url.searchParams.get("after"), 0, Number.MAX_SAFE_INTEGER);
    const limit = whole(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
    if (after === null || limit === null || limit < 1) return send(400, { ok: false });
    try {
      return send(200, pageOf(readOutbox(outbox).events, after, limit));
    } catch {
      return send(500, { ok: false }); // a malformed or gapped outbox fails closed, and says nothing about it
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
  const verify = (token) => {
    try {
      const result = verifyAdapterToken({ token, publicKey, expectedTenant: tenant, expectedAdapterId: adapterId, requiredOperation: "events" });
      return result.ok ? result.claims : null;
    } catch {
      return null;
    }
  };
  http.createServer(createEventsHandler({ outbox, verify })).listen(port, process.env.HOST ?? "127.0.0.1", () => console.log(`knowledge events feed listening on port ${port}`));
}

if (process.argv[1]?.endsWith("/knowledge-unify/serve-events.mjs")) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
}
