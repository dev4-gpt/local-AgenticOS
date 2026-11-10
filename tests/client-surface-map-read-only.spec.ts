import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);

test("read-only surface map reads routes and APIs without tenant writes or provider calls", async () => {
  const requests: { method: string; path: string; cookie: string }[] = [];
  const server = createServer((request, response) => {
    requests.push({
      method: request.method ?? "",
      path: request.url ?? "",
      cookie: request.headers.cookie ?? "",
    });
    response.setHeader("set-cookie", [
      "veloce_access_token=rotated; Path=/; HttpOnly",
      "veloce_refresh_token=rotated; Path=/; HttpOnly",
    ]);
    if (request.url?.startsWith("/api/")) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, records: [] }));
    } else {
      response.setHeader("content-type", "text/html");
      response.end("<title>Veloce AgenticOS</title>");
    }
  });
  const directory = await mkdtemp(join(tmpdir(), "veloce-parity-read-only-"));
  const cookieFile = join(directory, "cookie.txt");
  const originalCookie = "veloce_access_token=original; veloce_refresh_token=original\n";
  try {
    await writeFile(cookieFile, originalCookie, { mode: 0o600 });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test_server_address_missing");
    const result = await run(process.execPath, [
      "scripts/verify-client-runtime-surface-map.mjs",
      "--url", `http://127.0.0.1:${address.port}`,
      "--cookie-file", cookieFile,
      "--read-only",
    ], { cwd: process.cwd(), timeout: 30_000 });
    expect(result.stdout).toContain("read-only route and API inventory");
    expect(requests.length).toBeGreaterThan(40);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(requests.some((request) => request.path.includes("/api/client-runtime/records?kind=memory"))).toBe(true);
    expect(requests.some((request) => request.path.includes("/api/client-runtime/jobs"))).toBe(false);
    expect(requests[0].cookie).toContain("veloce_access_token=original");
    expect(requests.at(-1)?.cookie).toContain("veloce_access_token=rotated");
    expect(await readFile(cookieFile, "utf8")).toBe(originalCookie);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("read-only mode rejects provider smoke", async () => {
  await expect(run(process.execPath, [
    "scripts/verify-client-runtime-surface-map.mjs",
    "--url", "http://127.0.0.1:1",
    "--cookie-file", "/does-not-exist",
    "--read-only", "--provider-smoke",
  ], { cwd: process.cwd() })).rejects.toMatchObject({
    stderr: expect.stringContaining("--read-only cannot be combined with provider smoke"),
  });
});
