import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { scanMemoryContent } from "../src/lib/adapterMemoryGuard";
import { applyIngest, planIngest } from "../scripts/knowledge-unify/ingest.mjs";
import { applyPromote, planPromote } from "../scripts/knowledge-unify/promote.mjs";
import { createEventsHandler, MAX_RESPONSE_BYTES, pageOf } from "../scripts/knowledge-unify/serve-events.mjs";
import { loadReviewModule } from "./helpers/load-review-module";

// The feed service is exercised with the host's own token code and the host's real puller. Keys are made here and thrown away.
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const guard = loadReviewModule("src/lib/adapterMemoryGuard.ts", { "./adapterContracts": contracts });
const tokens = loadReviewModule("src/lib/adapterTokens.ts", { "./adapterContracts": contracts });
const puller = loadReviewModule("src/lib/adapterEventsPuller.ts", { "./adapterContracts": contracts, "./adapterMemoryGuard": guard });
const pair = generateKeyPairSync("ed25519");
const PRIVATE_PEM = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const PUBLIC_PEM = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
const TENANT = "tenant-a";
const ADAPTER = "knowledge";
const NOW = new Date("2026-10-29T09:00:00Z");

const created: string[] = [];
const tempDir = (prefix: string) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  created.push(dir);
  return dir;
};
test.afterAll(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

const mint = (over: Record<string, unknown> = {}) =>
  tokens.mintAdapterToken({ privateKey: PRIVATE_PEM, tenant: TENANT, adapterId: ADAPTER, scope: ["events"], ttlSeconds: 60, ...over }).token as string;
const verify = (token: string, now?: number) => {
  const result = tokens.verifyAdapterToken({ token, publicKey: pair.publicKey, expectedTenant: TENANT, expectedAdapterId: ADAPTER, requiredOperation: "events", now });
  return result.ok ? result.claims : null;
};

/** An outbox of `count` real proposals made by the real promote step from synthetic pages. */
function makeOutbox(count: number): string {
  const from = tempDir("ke-from-");
  for (let i = 1; i <= count; i++) fs.writeFileSync(path.join(from, `p${i}.md`), `---\nsources:\n  - https://example.com/p${i}\n---\nSynthetic fact number ${i} about gardening tools and their upkeep.\n`);
  const vault = tempDir("ke-vault-");
  const outbox = tempDir("ke-out-");
  const stores = [{ label: "v", root: vault }];
  applyIngest({ plan: planIngest({ from, store: stores[0], scan: scanMemoryContent, now: NOW, device: "laptop" }), quarantineDir: tempDir("ke-q-") });
  const scan = (text: string, o?: { sourceUrl?: string }) => ({ verdict: scanMemoryContent(text, o).verdict });
  applyPromote({ plan: planPromote({ stores, outbox, adapterId: ADAPTER, scan, now: NOW }), now: NOW });
  return outbox;
}

async function serve(outbox: string, now?: () => number) {
  const server = http.createServer(createEventsHandler({ outbox, verify: (token: string) => verify(token, now?.()), now }));
  const port = await new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
  return { server, base: `http://127.0.0.1:${port}` };
}
const get = (base: string, query: string, token?: string, method = "GET") => fetch(`${base}/h1/events${query}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });

function runService(script: string, env: Record<string, string>) {
  return new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [script], { env });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

test("ROUND TRIP: pages promoted by the Knowledge step are pulled by the host's real puller and handed to its ingest, once", async () => {
  const outbox = makeOutbox(3);
  const { server, base } = await serve(outbox);
  try {
    const ingested: Record<string, unknown>[] = [];
    let cursor = 0;
    const rpc = async (name: string, body: Record<string, unknown>) => {
      if (name === "client_adapter_events_cursor_get") return { ok: true, status: 200, value: cursor };
      if (name === "client_adapter_events_cursor_advance") { cursor = body.p_next as number; return { ok: true, status: 200, value: true }; }
      if (name === "client_adapter_ingest_memory_proposal") { ingested.push(body); return { ok: true, status: 200, value: { status: "created", item_id: "i", promotion_id: "p" } }; }
      return { ok: false, status: 404, value: null };
    };
    const config = { tenantSlug: TENANT, adapterId: ADAPTER, baseUrl: base, allowInsecureLoopback: true };
    const first = await puller.pullAdapterEvents(config, { rpc, mintToken: () => mint() });
    expect(first).toMatchObject({ events: 3, created: 3, stopped: null, cursor: 3 });
    expect(ingested.map((body) => body.p_adapter_id)).toEqual([ADAPTER, ADAPTER, ADAPTER]);
    expect(JSON.stringify(ingested)).toContain("Synthetic fact number 2");
    const second = await puller.pullAdapterEvents(config, { rpc, mintToken: () => mint() });
    expect(second).toMatchObject({ events: 0, created: 0, stopped: null });
  } finally {
    server.close();
  }
});

test("every refusal is a bare 401: no token, a forged token, another tenant, another adapter, the wrong scope, an expired token, and a token used twice", async () => {
  const outbox = makeOutbox(1);
  const clock = { t: Math.floor(NOW.getTime() / 1000) };
  const { server, base } = await serve(outbox, () => clock.t);
  try {
    const at = (over: Record<string, unknown> = {}) => mint({ now: clock.t, ...over });
    const attempts: [string, string | undefined][] = [
      ["none", undefined],
      ["garbage", "not-a-token"],
      ["forged", `${at().split(".")[0]}.${Buffer.alloc(64).toString("base64url")}`],
      ["tenant", at({ tenant: "tenant-b" })],
      ["adapter", at({ adapterId: "someone-else" })],
      ["scope", at({ scope: ["health"] })],
      ["expired", at({ now: clock.t - 120 })],
    ];
    for (const [name, token] of attempts) {
      const res = await get(base, "", token);
      expect([name, res.status, await res.text()]).toEqual([name, 401, ""]);
    }
    const once = at();
    expect((await get(base, "", once)).status).toBe(200);
    const again = await get(base, "", once);
    expect([again.status, await again.text()]).toEqual([401, ""]); // the same token cannot be used twice
  } finally {
    server.close();
  }
});

test("paging: after and limit are honoured, bad values are refused, and other routes and methods are not served", async () => {
  const outbox = makeOutbox(5);
  const { server, base } = await serve(outbox);
  try {
    const page = async (query: string) => (await get(base, query, mint())).json();
    expect(await page("?after=0&limit=2")).toMatchObject({ ok: true, next: 2, hasMore: true });
    expect((await page("?after=2&limit=2")).events.map((e: { seq: number }) => e.seq)).toEqual([3, 4]);
    expect(await page("?after=4&limit=2")).toMatchObject({ next: 5, hasMore: false });
    expect(await page("?after=5&limit=2")).toMatchObject({ events: [], next: 5, hasMore: false });
    for (const bad of ["?after=-1", "?after=x", "?limit=0", "?limit=51", "?limit=1.5", "?after=99999999999999"]) {
      expect([bad, (await get(base, bad, mint())).status]).toEqual([bad, 400]);
    }
    expect((await fetch(`${base}/h1/other`, { headers: { authorization: `Bearer ${mint()}` } })).status).toBe(404);
    expect((await get(base, "", mint(), "POST")).status).toBe(405);
  } finally {
    server.close();
  }
});

test("a malformed or gapped outbox fails closed with a bare 500, and a page never passes the host's size cap", async () => {
  const outbox = tempDir("ke-bad-");
  fs.writeFileSync(path.join(outbox, "events.json"), JSON.stringify({ events: [{ seq: 2, data: { secret: "do-not-leak" } }] }));
  const { server, base } = await serve(outbox);
  try {
    const res = await get(base, "", mint());
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("do-not-leak");
    expect(text).not.toContain("numbers");
  } finally {
    server.close();
  }
  const big = Array.from({ length: 50 }, (_, i) => ({ seq: i + 1, id: "a".repeat(32), at: "t", kind: "memory.propose", taskId: "x", data: { content: "x".repeat(30_000) } }));
  const cut = pageOf(big, 0, 50);
  expect(Buffer.byteLength(JSON.stringify(cut))).toBeLessThanOrEqual(MAX_RESPONSE_BYTES);
  expect(cut.events.length).toBeGreaterThan(0);
  expect(cut).toMatchObject({ hasMore: true, next: cut.events.length });
});

test("the service as a separate process: it starts from its settings, serves a token once, and refuses to start without them", async () => {
  const outbox = makeOutbox(2);
  const probe = http.createServer();
  const port = await new Promise<number>((resolve) => probe.listen(0, "127.0.0.1", () => resolve((probe.address() as AddressInfo).port)));
  await new Promise((resolve) => probe.close(resolve));
  const script = path.join(__dirname, "..", "scripts", "knowledge-unify", "serve-events.mjs");
  const env = { PATH: process.env.PATH ?? "", ADAPTER_PUBLIC_KEY_PEM: PUBLIC_PEM, CLIENT_SLUG: TENANT, ADAPTER_ID: ADAPTER, KNOWLEDGE_OUTBOX_DIR: outbox, PORT: String(port) };
  const child = spawn(process.execPath, [script], { env });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  try {
    await expect.poll(() => output, { timeout: 15_000 }).toContain("listening");
    const base = `http://127.0.0.1:${port}`;
    const token = mint();
    const ok = await get(base, "?after=0&limit=10", token);
    expect(ok.status).toBe(200);
    expect((await ok.json()).events.length).toBe(2);
    expect((await get(base, "", token)).status).toBe(401);
    expect((await get(base, "", mint({ tenant: "tenant-b" }))).status).toBe(401);
  } finally {
    child.kill();
  }
  expect(output).not.toContain("PRIVATE KEY");
  for (const name of ["ADAPTER_PUBLIC_KEY_PEM", "CLIENT_SLUG", "ADAPTER_ID", "KNOWLEDGE_OUTBOX_DIR"]) {
    const out = await runService(script, { ...env, [name]: "" });
    expect([name, out.code]).toEqual([name, 2]);
    expect(out.stderr).toContain(`REFUSED: ${name} is not set`);
  }
  const badKey = await runService(script, { ...env, ADAPTER_PUBLIC_KEY_PEM: "not a key" });
  expect(badKey.code).toBe(2);
  expect(badKey.stderr).toContain("Ed25519 public key");
  expect((await runService(script, { ...env, PORT: "0" })).code).toBe(2);
});
