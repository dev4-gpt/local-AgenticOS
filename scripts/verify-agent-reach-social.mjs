#!/usr/bin/env node

import { execFile } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gate = path.join(root, "scripts", "agent-reach-social-read.sh");
const stateDir = path.join(os.homedir(), ".agentic-os");
const stateFile = path.join(stateDir, "agent-reach-validated.json");

async function probe(id, args, validate) {
  try {
    const { stdout } = await execFileAsync(gate, args, {
      cwd: root,
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout);
    return { ok: validate(parsed), checkedAt: Date.now() };
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : "Probe failed";
    return { ok: false, checkedAt: Date.now(), error: message.slice(0, 180) };
  }
}

const reddit = await probe(
  "reddit",
  ["reddit", "search", "agentic AI", "-f", "json"],
  (value) => Array.isArray(value) && value.length > 0,
);
const instagram = await probe(
  "instagram",
  ["instagram", "profile", "nasa", "-f", "json"],
  (value) => {
    const records = Array.isArray(value) ? value : Object.values(value ?? {});
    return records.some((record) => record && typeof record === "object" && record.username === "nasa");
  },
);
const facebook = await probe(
  "facebook",
  ["facebook", "profile", "zuck", "-f", "json"],
  (value) => {
    const records = Array.isArray(value) ? value : Object.values(value ?? {});
    return records.some((record) => record && typeof record === "object" && Object.keys(record).length > 0);
  },
);

const result = {
  checkedAt: Date.now(),
  channels: { reddit, instagram, facebook },
};

await mkdir(stateDir, { recursive: true });
await writeFile(stateFile, JSON.stringify(result, null, 2), { mode: 0o600 });
await chmod(stateFile, 0o600);

console.log(JSON.stringify({
  reddit: reddit.ok ? "working" : "failed",
  instagram: instagram.ok ? "working" : "failed",
  facebook: facebook.ok ? "working" : "failed",
  stateFile,
}, null, 2));

if (!reddit.ok || !instagram.ok || !facebook.ok) process.exitCode = 1;
