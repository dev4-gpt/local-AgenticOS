import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("port_unavailable");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

test("local World Studio streams the supplied pack without exposing other files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "veloce-worlds-test-"));
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  let child: ReturnType<typeof spawn> | null = null;
  try {
    await mkdir(path.join(root, "public/worlds/assets"), { recursive: true });
    await mkdir(path.join(root, "public/guides/blender-worlds"), { recursive: true });
    await mkdir(path.join(root, "world-sources"), { recursive: true });
    await writeFile(path.join(root, "public/worlds/index.html"), "<html>World Studio</html>");
    await writeFile(path.join(root, "public/worlds/worlds.js"), "export const world = true;");
    for (const world of ["tea", "glass", "snow"]) {
      await writeFile(path.join(root, `public/worlds/assets/${world}-detailed.glb`), "model");
      await writeFile(path.join(root, `world-sources/${world}-detailed.blend`), "scene");
    }
    await writeFile(path.join(root, "public/guides/blender-worlds/index.html"), "<html>Guide</html>");
    await writeFile(path.join(root, "outside.txt"), "private");
    await symlink(path.join(root, "outside.txt"), path.join(root, "public/worlds/assets/secret.txt"));
    child = spawn(process.execPath, ["scripts/serve-worlds-pack.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), AGENTIC_OS_WORLDS_PACK_DIR: root },
      stdio: "ignore",
    });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null) break;
      const response = await fetch(`${base}/healthz`).catch(() => null);
      if (response?.ok) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(ready).toBe(true);

    const viewer = await fetch(`${base}/worlds/index.html`, { headers: { Origin: "https://example.test" } });
    expect(viewer.status).toBe(200);
    expect(viewer.headers.get("content-type")).toContain("text/html");
    expect(viewer.headers.get("access-control-allow-origin")).toBeNull();
    expect(await viewer.text()).toContain("World Studio");
    const model = await fetch(`${base}/worlds/assets/tea-detailed.glb`, { headers: { Range: "bytes=1-3" } });
    expect(model.status).toBe(206);
    expect(model.headers.get("content-range")).toBe("bytes 1-3/5");
    expect(await model.text()).toBe("ode");
    expect((await fetch(`${base}/worlds/assets/glass-detailed.glb`, { method: "HEAD" })).headers.get("content-length")).toBe("5");
    expect((await fetch(`${base}/guides/blender-worlds/index.html`)).status).toBe(200);
    const source = await fetch(`${base}/api/worlds/source?world=snow`);
    expect(source.headers.get("content-disposition")).toContain("snow-detailed.blend");
    expect((await fetch(`${base}/worlds/assets/secret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/worlds/%2e%2e/outside.txt`)).status).toBe(404);
    expect((await fetch(`${base}/api/worlds/source?world=other`)).status).toBe(404);
    expect((await fetch(`${base}/worlds/index.html`, { method: "POST" })).status).toBe(405);
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => child?.once("exit", () => resolve()));
    }
    await rm(root, { recursive: true, force: true });
  }
});
