import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { loadReviewModule } from "./helpers/load-review-module";

// The scheduled adapter sync job (phase 2 slice 2d, ADR-015): the compiled libraries, the combined runner, and the image
// recipe. The image is simulated by copying exactly what its final stage copies into a folder with no node_modules above
// it, so `typescript` cannot be found there; if the commands still run, the image does not need it.
const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const tokens = loadReviewModule("src/lib/adapterTokens.ts", { "./adapterContracts": contracts });
const pair = generateKeyPairSync("ed25519");
const PRIVATE_PEM = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const SERVICE_KEY = "service-role-key-for-the-test-0123456789";
const TENANT = "tenant-a";
const ADAPTER = "creator-os";
const TASK = "h1-aaaaaaaaaaaaaaaaaaaaaaaa";
const EVENT = "11111111-1111-4111-8111-111111111111";

const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
const bodyOf = (req: IncomingMessage) => new Promise<string>((resolve) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => resolve(s)); });

function startStubs(o: { adapterStatus?: number } = {}) {
  const seen = { rpc: [] as string[], adapter: [] as { url: string; verified: boolean }[] };
  let cursor = 0;
  const db = createServer(async (req, res) => {
    const name = (req.url ?? "").replace("/rest/v1/rpc/", "");
    const body = JSON.parse((await bodyOf(req)) || "{}") as Record<string, unknown>;
    seen.rpc.push(name);
    const send = (value: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    if (name === "client_adapter_background_owner_may_run") return send(true);
    if (name === "client_adapter_events_cursor_get") return send(cursor);
    if (name === "client_adapter_events_cursor_advance") { if (body.p_expected === cursor) { cursor = body.p_next as number; return send(true); } return send(false); }
    if (name === "client_adapter_tombstones_pending") return send([{ event_id: EVENT, item_id: "i", adapter_event_id: "a".repeat(32), content_sha256: "b".repeat(64), attempts: 0 }]);
    if (name === "client_adapter_tombstone_attempt") return send(1);
    if (name === "client_adapter_tombstone_ack") return send(true);
    if (name === "client_adapter_tombstone_summary") return send({ pending: 0, gave_up: 0, acknowledged: 1, exposures: 0 });
    res.writeHead(404); res.end("{}");
  });
  const adapter = createServer((req, res) => {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const isTombstone = (req.url ?? "").startsWith("/h1/memory.tombstone");
    const verified = tokens.verifyAdapterToken({ token, publicKey: pair.publicKey, expectedTenant: TENANT, expectedAdapterId: ADAPTER, requiredOperation: isTombstone ? "memory.tombstone" : "events" }).ok === true;
    seen.adapter.push({ url: req.url ?? "", verified });
    if (o.adapterStatus) { res.writeHead(o.adapterStatus, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: "forbidden" })); }
    res.writeHead(200, { "content-type": "application/json" });
    if (isTombstone) return void res.end(JSON.stringify({ ok: true, receipt: { tenantSlug: TENANT, adapterId: ADAPTER, eventId: EVENT, receiptSha256: "c".repeat(64), deletedCount: 2 } }));
    const after = Number(new URL(req.url ?? "", "http://x").searchParams.get("after"));
    const events = after >= 1 ? [] : [{ seq: 1, id: "a".repeat(32), at: "2026-10-22T10:00:00.000Z", kind: "task.state", taskId: TASK, data: { state: "succeeded" } }];
    res.end(JSON.stringify({ ok: true, events, next: 1, hasMore: false }));
  });
  return { db, adapter, seen };
}

/** What the image's final stage copies, built the way its first stage builds it, in a folder with no node_modules. */
function makeImageFolder(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "adapter-sync-image-"));
  mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });
  for (const f of ["run-adapter-sync.mjs", "run-adapter-events-puller.mjs", "run-adapter-tombstones.mjs"]) cpSync(path.join("scripts", f), path.join(dir, "scripts", f));
  cpSync("scripts/lib/hostLibLoader.mjs", path.join(dir, "scripts", "lib", "hostLibLoader.mjs"));
  return dir;
}
const build = (out: string) => new Promise<void>((resolve, reject) => execFile("node", ["scripts/build-adapter-sync.mjs", "--out", out], (error) => (error ? reject(error) : resolve())));

type Run = { code: number | null; stdout: string; stderr: string };
const runIn = (dir: string, env: Record<string, string>): Promise<Run> =>
  new Promise((resolve) => {
    const child = execFile("node", [path.join(dir, "scripts", "run-adapter-sync.mjs")], { cwd: dir, env: { PATH: process.env.PATH ?? "", ...env }, timeout: 60_000 }, (error, stdout, stderr) => {
      resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, stdout, stderr });
    });
    child.stdin?.end();
  });

async function withImage<T>(o: Parameters<typeof startStubs>[0], fn: (ctx: { dir: string; env: Record<string, string>; seen: ReturnType<typeof startStubs>["seen"] }) => Promise<T>) {
  const stubs = startStubs(o);
  const dbPort = await listen(stubs.db);
  const adapterPort = await listen(stubs.adapter);
  const dir = makeImageFolder();
  await build(path.join(dir, "dist", "adapter-sync"));
  const env = {
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, CLIENT_SLUG: TENANT, ADAPTER_ID: ADAPTER,
    ADAPTER_ENDPOINTS: JSON.stringify({ [ADAPTER]: `http://127.0.0.1:${adapterPort}` }), ADAPTER_TOKEN_SIGNING_KEY_PEM: PRIVATE_PEM, ADAPTER_ALLOW_LOOPBACK: "true",
  };
  try {
    return await fn({ dir, env, seen: stubs.seen });
  } finally {
    stubs.db.close();
    stubs.adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
const lines = (s: string) => s.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);

test("the build compiles exactly the libraries the commands need, following their imports", async () => {
  const { libsToCompile } = await import("../scripts/build-adapter-sync.mjs");
  expect(libsToCompile()).toEqual(["adapterContracts", "adapterEventsPuller", "adapterMemoryGuard", "adapterTokens", "adapterTombstoneDispatcher"]);
  const dir = mkdtempSync(path.join(os.tmpdir(), "adapter-sync-build-"));
  try {
    await build(dir);
    expect(readdirSync(dir).sort()).toEqual(["adapterContracts.js", "adapterEventsPuller.js", "adapterMemoryGuard.js", "adapterTokens.js", "adapterTombstoneDispatcher.js"]);
    expect(readFileSync(path.join(dir, "adapterTokens.js"), "utf8")).not.toContain("import type"); // plain CommonJS, no TypeScript left
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("in an image folder with no node_modules, one run pulls the feed and then tells the adapter, using host tokens the real verifier accepts", async () => {
  await withImage({}, async ({ dir, env, seen }) => {
    expect(existsSync(path.join(dir, "node_modules"))).toBe(false);
    const out = await runIn(dir, env);
    expect(out.code).toBe(0);
    const [puller, tombstones, end] = lines(out.stdout);
    expect(puller).toMatchObject({ event: "events-puller-end", tenant: TENANT, cursor: 1, stopped: null });
    expect(tombstones).toMatchObject({ event: "tombstones-dispatch-end", tenant: TENANT, due: 1, acknowledged: 1, stopped: null });
    expect(end).toMatchObject({ event: "adapter-sync-end", exitCode: 0, steps: [{ step: "events-puller", exitCode: 0 }, { step: "tombstones", exitCode: 0 }] });
    expect(seen.adapter.length).toBeGreaterThan(0);
    expect(seen.adapter.every((r) => r.verified)).toBe(true);
    // the order is fixed: the feed is read before anything is sent
    expect(seen.rpc.indexOf("client_adapter_events_cursor_get")).toBeLessThan(seen.rpc.indexOf("client_adapter_tombstones_pending"));
    for (const text of [out.stdout, out.stderr]) {
      expect(text).not.toContain(SERVICE_KEY);
      expect(text).not.toContain("PRIVATE KEY");
    }
  });
});

test("a step that fails does not hide or skip the other, and the worst exit code wins", async () => {
  await withImage({ adapterStatus: 403 }, async ({ dir, env }) => {
    const out = await runIn(dir, env);
    expect(out.code).toBe(1);
    const end = lines(out.stdout).pop()!;
    expect(end).toMatchObject({ event: "adapter-sync-end", exitCode: 1, steps: [{ step: "events-puller", exitCode: 1 }, { step: "tombstones", exitCode: 1 }] });
  });
  await withImage({}, async ({ dir, env }) => {
    const rest = { ...env };
    delete rest.ADAPTER_TOKEN_SIGNING_KEY_PEM; // a setting is missing: both steps refuse, the job says so
    const out = await runIn(dir, rest);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("REFUSED: ADAPTER_TOKEN_SIGNING_KEY_PEM is not set");
    expect(lines(out.stdout).pop()).toMatchObject({ exitCode: 2, steps: [{ exitCode: 2 }, { exitCode: 2 }] });
  });
});

test("the exit codes combine as refused over needs-a-look over clean", async () => {
  const { combineExitCodes, STEPS } = await import("../scripts/run-adapter-sync.mjs");
  expect([[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [0, 2], [2, 1], [1, 2]].map((codes) => combineExitCodes(codes))).toEqual([0, 1, 1, 1, 2, 2, 2, 2]);
  expect(STEPS.map((s: { script: string }) => s.script)).toEqual(["run-adapter-events-puller.mjs", "run-adapter-tombstones.mjs"]);
});

test("the image recipe copies what the job runs, compiles in a first stage, and ships no secret, no typescript and no root user", async () => {
  const docker = readFileSync("infra/adapter-sync-job/Dockerfile", "utf8");
  const finalStage = docker.slice(docker.lastIndexOf("\nFROM "));
  for (const needed of ["dist/adapter-sync", "scripts/run-adapter-sync.mjs", "scripts/run-adapter-events-puller.mjs", "scripts/run-adapter-tombstones.mjs", "scripts/lib/hostLibLoader.mjs"]) expect(finalStage, needed).toContain(needed);
  expect(finalStage).not.toMatch(/npm (ci|install)/);
  expect(finalStage).toContain("USER node");
  expect(finalStage).toContain('ENTRYPOINT ["node", "scripts/run-adapter-sync.mjs"]');
  expect(docker).toContain("AS build");
  expect(docker).toContain("RUN node scripts/build-adapter-sync.mjs");
  expect(docker).not.toMatch(/SERVICE_ROLE|PRIVATE KEY|BEGIN /);
  // everything the commands import from scripts/ is in the final stage
  for (const script of ["run-adapter-events-puller.mjs", "run-adapter-tombstones.mjs", "run-adapter-sync.mjs"]) {
    for (const match of readFileSync(path.join("scripts", script), "utf8").matchAll(/from "\.\/(lib\/[A-Za-z]+\.mjs)"/g)) expect(finalStage, `${script} imports ${match[1]}`).toContain(`scripts/${match[1]}`);
  }
});

test("a library with a syntax error stops the build instead of producing a broken image", async () => {
  const { buildAdapterSync } = await import("../scripts/build-adapter-sync.mjs");
  const repo = mkdtempSync(path.join(os.tmpdir(), "adapter-sync-broken-"));
  try {
    cpSync("src/lib", path.join(repo, "src", "lib"), { recursive: true });
    symlinkSync(path.resolve("node_modules"), path.join(repo, "node_modules"));
    writeFileSync(path.join(repo, "src", "lib", "adapterContracts.ts"), "export const broken = ;\n");
    expect(() => buildAdapterSync({ repoRoot: repo, outDir: path.join(repo, "out") })).toThrow(/adapterContracts\.ts does not compile/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("from a checkout the loader transpiles the source once and hands every caller the same module, and a compiled folder takes over when present", async () => {
  const { createHostLibLoader } = await import("../scripts/lib/hostLibLoader.mjs");
  const fromSource = createHostLibLoader(path.resolve("."));
  const first = fromSource("adapterContracts");
  expect(fromSource("adapterContracts")).toBe(first);
  expect(typeof first.isValidTenantSlug).toBe("function");
  expect(typeof fromSource("adapterTokens").mintAdapterToken).toBe("function");
  // with dist/adapter-sync present the compiled file is used and the source is not read
  const repo = mkdtempSync(path.join(os.tmpdir(), "adapter-sync-loader-"));
  try {
    mkdirSync(path.join(repo, "dist", "adapter-sync"), { recursive: true });
    writeFileSync(path.join(repo, "dist", "adapter-sync", "adapterContracts.js"), "exports.marker = 'compiled';\n");
    expect(createHostLibLoader(repo)("adapterContracts")).toEqual({ marker: "compiled" });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("the job spec carries no secret, reads three secrets by reference, does not retry, runs one task, and the alert watches the job family", () => {
  const job = readFileSync("infra/adapter-sync-job/job.yaml", "utf8");
  expect(job).toMatch(/maxRetries: 0/);
  expect(job).toMatch(/parallelism: 1/);
  expect(job.match(/secretKeyRef:/g)).toHaveLength(3);
  for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADAPTER_TOKEN_SIGNING_KEY_PEM"]) expect(job, name).toMatch(new RegExp(`- name: ${name}\\n\\s+valueFrom:`));
  expect(job).toContain("BACKGROUND_DEPLOYMENT_ID");
  expect(job).toContain("https://ADAPTER_HOST"); // an https address, never plain http
  expect(job).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}|sb_secret|BEGIN [A-Z ]*PRIVATE KEY|ALLOW_LOOPBACK/);
  const alert = readFileSync("infra/adapter-sync-job/alert-policy.yaml", "utf8");
  expect(alert).toContain('starts_with("veloce-adapter-sync-")');
  expect(alert).toContain('metric.labels.result = "failed"');
  expect(job).toContain("veloce-adapter-sync-CLIENT_SLUG-ADAPTER_ID"); // the name the alert's prefix matches
  const readme = readFileSync("infra/adapter-sync-job/README.md", "utf8");
  for (const needed of ["client_adapter_background_owner_set", "ADAPTER_TOKEN_SIGNING_KEY", "gaveUp", "*/5 * * * *"]) expect(readme, needed).toContain(needed);
  expect(readme).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
});
