import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { loadReviewModule } from "./helpers/load-review-module";

// The real CLI, run as a separate process against a stub database and a stub adapter on loopback. The tokens it mints
// are checked by the host's own verifier. Keys are made here and thrown away.
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const tokens = loadReviewModule("src/lib/adapterTokens.ts", { "./adapterContracts": contracts });
const pair = generateKeyPairSync("ed25519");
const PRIVATE_PEM = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const SERVICE_KEY = "service-role-key-for-the-test-0123456789";
const TENANT = "tenant-a";
const ADAPTER = "creator-os";
const EVENT = "11111111-1111-4111-8111-111111111111";
const RECEIPT_HASH = "c".repeat(64);

const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
const bodyOf = (req: IncomingMessage) => new Promise<string>((resolve) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => resolve(s)); });

function startStubs(o: { owner?: boolean; ownerStatus?: number; adapterStatus?: number; gaveUp?: number; due?: boolean } = {}) {
  const seen = { rpc: [] as { name: string; body: Record<string, unknown>; auth: string | undefined }[], adapter: [] as { url: string; verified: boolean; body: Record<string, unknown> }[] };
  const db = createServer(async (req, res) => {
    const name = (req.url ?? "").replace("/rest/v1/rpc/", "");
    const body = JSON.parse((await bodyOf(req)) || "{}") as Record<string, unknown>;
    seen.rpc.push({ name, body, auth: req.headers.authorization });
    const send = (status: number, value: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    if (name === "client_adapter_background_owner_may_run") return send(o.ownerStatus ?? 200, o.owner ?? true);
    if (name === "client_adapter_tombstones_pending") return send(200, o.due === false ? [] : [{ event_id: EVENT, item_id: "i", adapter_event_id: "a".repeat(32), content_sha256: "b".repeat(64), attempts: 0 }]);
    if (name === "client_adapter_tombstone_attempt") return send(200, 1);
    if (name === "client_adapter_tombstone_ack") return send(200, true);
    if (name === "client_adapter_tombstone_summary") return send(200, { pending: 0, gave_up: o.gaveUp ?? 0, acknowledged: 1, exposures: 2 });
    return send(404, { message: "unknown" });
  });
  const adapter = createServer(async (req, res) => {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const verified = tokens.verifyAdapterToken({ token, publicKey: pair.publicKey, expectedTenant: TENANT, expectedAdapterId: ADAPTER, requiredOperation: "memory.tombstone" }).ok === true;
    const body = JSON.parse((await bodyOf(req)) || "{}") as Record<string, unknown>;
    seen.adapter.push({ url: req.url ?? "", verified, body });
    if (o.adapterStatus && o.adapterStatus !== 200) { res.writeHead(o.adapterStatus, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: "forbidden" })); }
    if (!verified) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, receipt: { tenantSlug: TENANT, adapterId: ADAPTER, eventId: EVENT, receiptSha256: RECEIPT_HASH, deletedCount: 3 } }));
  });
  return { db, adapter, seen };
}

type Run = { code: number | null; stdout: string; stderr: string };
const runCli = (env: Record<string, string>): Promise<Run> =>
  new Promise((resolve) => {
    const child = execFile("node", ["scripts/run-adapter-tombstones.mjs"], { env: { PATH: process.env.PATH ?? "", ...env }, timeout: 60_000 }, (error, stdout, stderr) => {
      resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, stdout, stderr });
    });
    child.stdin?.end();
  });

async function withStubs<T>(o: Parameters<typeof startStubs>[0], fn: (ctx: { env: Record<string, string>; seen: ReturnType<typeof startStubs>["seen"] }) => Promise<T>) {
  const stubs = startStubs(o);
  const dbPort = await listen(stubs.db);
  const adapterPort = await listen(stubs.adapter);
  const env = {
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    CLIENT_SLUG: TENANT,
    ADAPTER_ID: ADAPTER,
    ADAPTER_ENDPOINTS: JSON.stringify({ [ADAPTER]: `http://127.0.0.1:${adapterPort}` }),
    ADAPTER_TOKEN_SIGNING_KEY_PEM: PRIVATE_PEM,
    ADAPTER_ALLOW_LOOPBACK: "true",
  };
  try {
    return await fn({ env, seen: stubs.seen });
  } finally {
    stubs.db.close();
    stubs.adapter.close();
  }
}

const lastLine = (s: string) => JSON.parse(s.trim().split("\n").pop()!);

test("a run sends the erase request with a token the host's own verifier accepts, records the receipt, and prints counts only", async () => {
  await withStubs({}, async ({ env, seen }) => {
    const out = await runCli(env);
    expect(out.code).toBe(0);
    expect(lastLine(out.stdout)).toMatchObject({ event: "tombstones-dispatch-end", tenant: TENANT, adapterId: ADAPTER, due: 1, acknowledged: 1, stopped: null, summary: { pending: 0, gaveUp: 0, acknowledged: 1, exposures: 2 } });
    expect(seen.adapter).toHaveLength(1);
    expect(seen.adapter[0]).toMatchObject({ url: "/h1/memory.tombstone", verified: true });
    expect(seen.adapter[0]!.body).toEqual({ tenantSlug: TENANT, adapterId: ADAPTER, eventId: EVENT, targets: [{ adapterEventId: "a".repeat(32), contentSha256: "b".repeat(64) }] });
    const ack = seen.rpc.find((r) => r.name === "client_adapter_tombstone_ack")!;
    expect(ack.body).toEqual({ p_event_id: EVENT, p_receipt_sha256: RECEIPT_HASH, p_deleted_count: 3 });
    expect(seen.rpc.every((r) => r.auth === `Bearer ${SERVICE_KEY}`)).toBe(true);
    for (const text of [out.stdout, out.stderr]) {
      expect(text).not.toContain(SERVICE_KEY);
      expect(text).not.toContain("PRIVATE KEY");
    }
  });
});

test("nothing due is a clean run that contacts no adapter", async () => {
  await withStubs({ due: false }, async ({ env, seen }) => {
    const out = await runCli(env);
    expect(out.code).toBe(0);
    expect(lastLine(out.stdout)).toMatchObject({ due: 0, acknowledged: 0, stopped: null });
    expect(seen.adapter).toHaveLength(0);
  });
});

test("it refuses to start without its settings, naming the setting and never a value", async () => {
  await withStubs({}, async ({ env }) => {
    for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CLIENT_SLUG", "ADAPTER_ID", "ADAPTER_ENDPOINTS", "ADAPTER_TOKEN_SIGNING_KEY_PEM"]) {
      const rest = { ...env };
      delete rest[name];
      const out = await runCli(rest);
      expect([name, out.code]).toEqual([name, 2]);
      expect(out.stderr).toContain(`REFUSED: ${name} is not set`);
    }
    const bad: Record<string, Record<string, string>> = {
      "valid JSON": { ADAPTER_ENDPOINTS: "{nope" },
      "a JSON object": { ADAPTER_ENDPOINTS: "[]" },
      "has no address for": { ADAPTER_ENDPOINTS: JSON.stringify({ "someone-else": "https://x.example.test" }) },
      "a valid id": { CLIENT_SLUG: "Bad Tenant" },
      "an Ed25519 private key": { ADAPTER_TOKEN_SIGNING_KEY_PEM: "not a key" },
      "must be https": { SUPABASE_URL: "http://db.example.test" },
      "is not a url": { SUPABASE_URL: "nonsense" },
    };
    for (const [phrase, over] of Object.entries(bad)) {
      const out = await runCli({ ...env, ...over });
      expect([phrase, out.code]).toEqual([phrase, 2]);
      expect(out.stderr, phrase).toContain(phrase);
      expect(out.stderr).not.toContain(SERVICE_KEY);
    }
    // plain http to the adapter is refused unless loopback is allowed, and never to a name on the internet
    const noLoopback = { ...env };
    delete noLoopback.ADAPTER_ALLOW_LOOPBACK;
    expect((await runCli(noLoopback)).code).toBe(2);
    expect((await runCli({ ...env, ADAPTER_ENDPOINTS: JSON.stringify({ [ADAPTER]: "http://creator.example.test" }) })).code).toBe(2);
  });
});

test("when a background owner is named, only that deployment runs; the others do nothing and ask the adapter nothing", async () => {
  await withStubs({ owner: false }, async ({ env, seen }) => {
    const out = await runCli({ ...env, BACKGROUND_DEPLOYMENT_ID: "veloce-other-main" });
    expect(out.code).toBe(0);
    expect(JSON.parse(out.stdout.trim())).toMatchObject({ skipped: true, reason: "this deployment is not the background owner" });
    expect(seen.adapter).toHaveLength(0);
    expect(seen.rpc.some((r) => r.name === "client_adapter_tombstones_pending")).toBe(false);
  });
  await withStubs({ owner: true }, async ({ env }) => {
    expect((await runCli({ ...env, BACKGROUND_DEPLOYMENT_ID: "veloce-this-main" })).code).toBe(0);
  });
  await withStubs({ ownerStatus: 500 }, async ({ env, seen }) => {
    const out = await runCli({ ...env, BACKGROUND_DEPLOYMENT_ID: "veloce-this-main" });
    expect(out.code).toBe(1); // an unanswered check stops the run; it never guesses
    expect(seen.adapter).toHaveLength(0);
  });
});

test("an adapter that refuses exits 1 with the reason; a note given up on exits 1 even when the run was clean", async () => {
  await withStubs({ adapterStatus: 403 }, async ({ env }) => {
    const out = await runCli(env);
    expect(out.code).toBe(1);
    expect(lastLine(out.stdout)).toMatchObject({ acknowledged: 0, failed: { forbidden: 1 } });
  });
  await withStubs({ due: false, gaveUp: 1 }, async ({ env }) => {
    const out = await runCli(env);
    expect(out.code).toBe(1);
    expect(lastLine(out.stdout)).toMatchObject({ summary: { gaveUp: 1 } });
  });
});
