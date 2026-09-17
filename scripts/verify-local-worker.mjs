import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const worker = path.join(root, "workers/local-worker/worker.mjs");
const temp = await mkdtemp(path.join(tmpdir(), "veloce-local-worker-"));
const source = path.join(temp, "vault");
await mkdir(source);
await writeFile(path.join(source, "note.md"), "Veloce hybrid worker keeps this selected source local.", "utf8");

const init = spawnSync(process.execPath, [worker, "init", "--state-dir", temp], { encoding: "utf8" });
assert.equal(init.status, 0, init.stderr);
const grant = spawnSync(process.execPath, [worker, "grant", "--state-dir", temp, "--id", "notes", "--kind", "vault", "--path", source], { encoding: "utf8" });
assert.equal(grant.status, 0, grant.stderr);
const port = await new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const child = spawn(process.execPath, [worker, "start", "--state-dir", temp, "--port", String(port), "--origin", "http://localhost:3000"], { stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
await waitFor(() => output.match(/VELOCE_LOCAL_WORKER_PAIR_CODE=([^\n]+)/)?.[1]);
const code = output.match(/VELOCE_LOCAL_WORKER_PAIR_CODE=([^\n]+)/)?.[1];
assert.ok(code, "worker must print a one-time pairing code");
const base = `http://127.0.0.1:${port}`;
const headers = { origin: "http://localhost:3000" };
const status = await fetch(`${base}/v1/status`, { headers });
assert.equal(status.status, 200);
assert.deepEqual((await status.json()).grants, [{ id: "notes", kind: "vault", label: "vault" }]);
const foreignOrigin = await fetch(`${base}/v1/status`, { headers: { origin: "https://untrusted.example" } });
assert.equal(foreignOrigin.status, 403, "the worker must reject other browser origins");
const pair = await fetch(`${base}/v1/pair`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ code }) });
const paired = await pair.json();
assert.equal(pair.status, 200);
assert.equal(typeof paired.sessionToken, "string");
const replay = await fetch(`${base}/v1/pair`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ code }) });
assert.equal(replay.status, 401, "a one-time pairing code must not be reusable");
const job = await fetch(`${base}/v1/jobs`, { method: "POST", headers: { ...headers, "content-type": "application/json", authorization: `Bearer ${paired.sessionToken}` }, body: JSON.stringify({ type: "search-selected-sources", scopeId: "notes", query: "hybrid" }) });
const result = await job.json();
assert.equal(job.status, 200);
assert.equal(result.result.matches[0].source, "note.md");
assert.match(result.result.matches[0].excerpt, /selected source/i);
const denied = await fetch(`${base}/v1/jobs`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ type: "search-selected-sources", scopeId: "notes", query: "hybrid" }) });
assert.equal(denied.status, 401);
child.kill("SIGTERM");
await new Promise((resolve) => child.once("exit", resolve));
console.log("local worker contract passed");

async function waitFor(read, timeout = 5_000) {
  const started = Date.now();
  while (!read()) {
    if (Date.now() - started > timeout) throw new Error("worker_start_timeout");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
