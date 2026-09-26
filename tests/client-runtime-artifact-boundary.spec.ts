import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("pruning leaves the client surface registered and removes operator route entrypoints", async () => {
  const root = await mkdtemp(join(tmpdir(), "veloce-client-artifact-"));
  try {
    const server = join(root, ".next", "server");
    await writeRoute(server, "app/api/claude/chat/route.js");
    await writeRoute(server, "app/api/client-auth/magic-link/route.js");
    await writeRoute(server, "app/context/page.js");
    await writeRoute(server, "app/demo-history/page.js");
    await writeFile(join(server, "app-paths-manifest.json"), JSON.stringify({
      "/api/claude/chat/route": "app/api/claude/chat/route.js",
      "/api/client-auth/magic-link/route": "app/api/client-auth/magic-link/route.js",
      "/context/page": "app/context/page.js",
      "/demo-history/page": "app/demo-history/page.js",
    }));
    await writeFile(join(server, "functions-config-manifest.json"), JSON.stringify({
      functions: { "/api/claude/chat": {}, "/api/client-auth/magic-link": {} },
    }));

    execFileSync("node", ["scripts/prune-client-runtime-artifact.mjs", "--standalone-root", root], { cwd: process.cwd(), stdio: "pipe" });
    const manifest = JSON.parse(await readFile(join(server, "app-paths-manifest.json"), "utf8"));
    const functions = JSON.parse(await readFile(join(server, "functions-config-manifest.json"), "utf8"));
    expect(manifest).toEqual({
      "/api/client-auth/magic-link/route": "app/api/client-auth/magic-link/route.js",
      "/context/page": "app/context/page.js",
    });
    expect(functions.functions).toEqual({ "/api/client-auth/magic-link": {} });
    await expect(readFile(join(server, "app/api/claude/chat/route.js"), "utf8")).rejects.toThrow();
    await expect(readFile(join(server, "app/demo-history/page.js"), "utf8")).rejects.toThrow();
    execFileSync("node", ["scripts/verify-client-runtime-build-trace.mjs", "--standalone-root", root], { cwd: process.cwd(), stdio: "pipe" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeRoute(server: string, relativePath: string) {
  const target = join(server, relativePath);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, "module.exports = {};\n");
}
