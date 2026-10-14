import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";

const script = path.resolve("scripts/verify-local-secret-permissions.mjs");
const protectedFiles = [
  ".env.local",
  ".vercel/.env.production.local",
  "product-experience/.env.local",
  ".private-client-kits/internal-beta-parity.env",
];

test("local secret permission guard requires owner-only env files without reading values", () => {
  test.skip(process.platform === "win32", "Windows does not expose POSIX file mode bits.");
  const root = mkdtempSync(path.join(os.tmpdir(), "agentos-secret-permissions-"));
  try {
    for (const relativePath of protectedFiles) {
      const filePath = path.join(root, relativePath);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, "SECRET_SENTINEL=must-not-be-printed\n", { mode: 0o600 });
      chmodSync(filePath, 0o600);
    }

    const safe = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
    expect(safe.status).toBe(0);
    expect(safe.stdout).toContain("4 present, values not read");
    expect(`${safe.stdout}\n${safe.stderr}`).not.toContain("SECRET_SENTINEL");

    chmodSync(path.join(root, ".vercel/.env.production.local"), 0o644);
    const unsafe = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
    expect(unsafe.status).toBe(1);
    expect(unsafe.stderr).toContain(".vercel/.env.production.local: must be owner-only (0600)");
    expect(`${unsafe.stdout}\n${unsafe.stderr}`).not.toContain("SECRET_SENTINEL");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
