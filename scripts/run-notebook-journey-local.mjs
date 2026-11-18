#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { NOTEBOOK_JOURNEY_SERVER_ENV } from "./lib/notebook-journey-evidence.mjs";

const port = process.env.CLIENT_RUNTIME_TEST_PORT || "3941";
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error("Invalid test port");
const root = process.cwd();
const surface = process.env.CLIENT_RUNTIME_TEST_SURFACE || "notebook";
if (!["notebook", "room"].includes(surface)) throw new Error("Invalid test surface");
const snapshot = mkdtempSync(join(tmpdir(), "agentos-notebook-journey-"));
try {
  // Whitelist app inputs; never copy .env, cloud credentials, or local MCP configuration.
  for (const entry of ["src", "public", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "next-env.d.ts"]) {
    if (existsSync(join(root, entry))) cpSync(join(root, entry), join(snapshot, entry), {
      recursive: true, filter: (file) => !basename(file).startsWith(".env"),
    });
  }
  for (const entry of ["infrastructure/content-os/personal-video-pilot.manifest.json", "infrastructure/integration-control-plane.manifest.json"]) {
    mkdirSync(dirname(join(snapshot, entry)), { recursive: true });
    cpSync(join(root, entry), join(snapshot, entry));
  }
  symlinkSync(join(root, "node_modules"), join(snapshot, "node_modules"), "dir");
  const next = join(root, "node_modules/next/dist/bin/next");
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, ...NOTEBOOK_JOURNEY_SERVER_ENV };
  if (surface === "room") env.CLIENT_ALLOWED_ROUTES = "/,/room";
  const build = spawn(process.execPath, [next, "build", "--webpack"], { cwd: snapshot, stdio: "inherit", env });
  const buildCode = await new Promise((resolve, reject) => {
    build.once("error", reject);
    build.once("exit", (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
  if (buildCode !== 0) throw new Error(`Isolated production build failed with exit code ${buildCode}`);

  const child = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", port], {
    cwd: snapshot, stdio: "inherit", env,
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 0 : code ?? 1));
  });
  process.exitCode = code;
} finally {
  rmSync(snapshot, { recursive: true, force: true });
}
