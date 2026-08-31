import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

test("VoxCPM and agent-efficiency contracts stay isolated and fail closed", () => {
  for (const script of ["scripts/verify-voxcpm-pilot.mjs", "scripts/verify-engineering-controls.mjs"]) {
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
  }
});
