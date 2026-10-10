import { expect, test } from "@playwright/test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

test("Vercel verifier checks names and types without retrieving values", () => {
  const verifier = readFileSync(resolve(process.cwd(), "scripts/verify-vercel-production-env.mjs"), "utf8");

  expect(verifier).toContain('"OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID", "OPENROUTER_MANAGED_PRICING_JSON"');
  expect(verifier).toContain('row.type === "sensitive"');
  expect(verifier).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  expect(verifier).toContain('["env", "ls", "production", "--json"');
  expect(verifier).not.toContain("env pull");
  expect(verifier).not.toContain("env get");
});

test("production preflight fails when public-login settings are absent", () => {
  const directory = mkdtempSync(join(tmpdir(), "vercel-login-preflight-"));
  try {
    const executable = join(directory, "vercel");
    writeFileSync(executable, "#!/bin/sh\nprintf '%s\\n' '[]'\n");
    chmodSync(executable, 0o700);
    const result = spawnSync(process.execPath, ["scripts/verify-vercel-production-env.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH ?? ""}` },
    });
    expect(result.status).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.present.SUPABASE_ANON_KEY).toBe(false);
    expect(output.present.CLIENT_LOGIN_ENABLED).toBe(false);
    expect(output.failures).toContain("missing Vercel Production variable: SUPABASE_ANON_KEY");
    expect(output.failures).toContain("missing Vercel Production variable: CLIENT_LOGIN_ENABLED");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
