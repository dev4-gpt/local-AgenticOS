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
const NOTE = "Customer Jane Doe pays 4111 1111 1111 1111 every month.";
const TENANT = "tenant-a";
const ADAPTER = "creator-os";
const TASK = "h1-aaaaaaaaaaaaaaaaaaaaaaaa";

const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
const bodyOf = (req: IncomingMessage) => new Promise<string>((resolve) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => resolve(s)); });

function startStubs(o: { owner?: boolean; ownerStatus?: number; adapterStatus?: number } = {}) {
  const seen = { rpc: [] as { name: string; body: Record<string, unknown>; auth: string | undefined }[], adapter: [] as { url: string; verified: boolean }[] };
  let cursor = 0;
  const db = createServer(async (req, res) => {
    const name = (req.url ?? "").replace("/rest/v1/rpc/", "");
    const body = JSON.parse((await bodyOf(req)) || "{}") as Record<string, unknown>;
    seen.rpc.push({ name, body, auth: req.headers.authorization });
    const send = (status: number, value: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    if (name === "client_adapter_background_owner_may_run") return send(o.ownerStatus ?? 200, o.owner ?? true);
    if (name === "client_adapter_events_cursor_get") return send(200, cursor);
    if (name === "client_adapter_events_cursor_advance") { if (body.p_expected === cursor) { cursor = body.p_next as number; return send(200, true); } return send(200, false); }
    if (name === "client_adapter_ingest_memory_proposal") return send(200, { status: "created", item_id: "i", promotion_id: "p" });
    return send(404, { message: "unknown" });
  });
  const adapter = createServer((req, res) => {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const verified = tokens.verifyAdapterToken({ token, publicKey: pair.publicKey, expectedTenant: TENANT, expectedAdapterId: ADAPTER, requiredOperation: "events" }).ok === true;
    seen.adapter.push({ url: req.url ?? "", verified });
    if (o.adapterStatus && o.adapterStatus !== 200) { res.writeHead(o.adapterStatus); return res.end(); }
    if (!verified) { res.writeHead(401); return res.end(); }
    const after = Number(new URL(req.url ?? "", "http://x").searchParams.get("after"));
    const all = [
      { seq: 1, id: "a".repeat(32), at: "2026-10-21T20:00:00.000Z", kind: "task.state", taskId: TASK, data: { state: "succeeded" } },
      { seq: 2, id: "b".repeat(32), at: "2026-10-21T20:00:00.000Z", kind: "memory.propose", taskId: TASK, data: { content: NOTE, sourceUrl: "https://example.test/x", citationId: "c1", retrievedAt: "2026-10-20T10:00:00.000Z", sourceTaskId: TASK, adapterVersion: "0.1.0", agentPrincipal: ADAPTER } },
    ];
    const events = all.filter((e) => e.seq > after);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, events, next: events.length ? events[events.length - 1]!.seq : after, hasMore: false }));
  });
  return { db, adapter, seen };
}

type Run = { code: number | null; stdout: string; stderr: string };
const runCli = (env: Record<string, string>): Promise<Run> =>
  new Promise((resolve) => {
    const child = execFile("node", ["scripts/run-adapter-events-puller.mjs"], { env: { PATH: process.env.PATH ?? "", ...env }, timeout: 60_000 }, (error, stdout, stderr) => {
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

test("a run pulls the feed with tokens the host's own verifier accepts, stores the proposal, and prints counts only", async () => {
  await withStubs({}, async ({ env, seen }) => {
    const out = await runCli(env);
    expect(out.code).toBe(0);
    const report = JSON.parse(out.stdout.trim().split("\n").pop()!);
    expect(report).toMatchObject({ event: "events-puller-end", tenant: TENANT, adapterId: ADAPTER, startCursor: 0, cursor: 2, created: 1, tasksSeen: 1, stopped: null });
    expect(seen.adapter.every((r) => r.verified)).toBe(true); // a real single-use token with scope events for this tenant and adapter
    const ingest = seen.rpc.find((r) => r.name === "client_adapter_ingest_memory_proposal")!;
    expect(ingest.body).toMatchObject({ p_tenant_slug: TENANT, p_adapter_id: ADAPTER, p_idempotency_key: "b".repeat(32), p_confidence: null });
    expect(seen.rpc.every((r) => r.auth === `Bearer ${SERVICE_KEY}`)).toBe(true);
    for (const text of [out.stdout, out.stderr]) {
      expect(text).not.toContain(SERVICE_KEY);
      expect(text).not.toContain("PRIVATE KEY");
      expect(text).not.toContain("Jane Doe");
      expect(text).not.toContain("4111");
    }
  });
});

test("a second run starts where the first stopped and finds nothing new", async () => {
  await withStubs({}, async ({ env }) => {
    expect((await runCli(env)).code).toBe(0);
    const second = JSON.parse((await runCli(env)).stdout.trim().split("\n").pop()!);
    expect(second).toMatchObject({ startCursor: 2, cursor: 2, events: 0, created: 0, stopped: null });
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

test("an adapter that refuses the host exits 1 with the reason and no cursor movement", async () => {
  await withStubs({ adapterStatus: 401 }, async ({ env, seen }) => {
    const out = await runCli(env);
    expect(out.code).toBe(1);
    expect(JSON.parse(out.stdout.trim().split("\n").pop()!)).toMatchObject({ stopped: "adapter_refused", cursor: 0, created: 0 });
    expect(seen.rpc.some((r) => r.name === "client_adapter_events_cursor_advance")).toBe(false);
  });
});
