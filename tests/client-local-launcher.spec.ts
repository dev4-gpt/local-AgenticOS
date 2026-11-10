import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function check(extraEnv: Record<string, string> = {}, flags: string[] = []) {
  return spawnSync(process.execPath, ["scripts/run-client-runtime-local.mjs", "--check-config", ...flags], {
    cwd: process.cwd(), encoding: "utf8", env: {
      PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "",
      ...extraEnv,
    },
  });
}

test("local parity config check keeps provider calls off and names missing settings", () => {
  const result = check();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Provider calls disabled.");
  expect(result.stdout).toContain("Checking Veloce client-runtime local test");
  expect(result.stdout).toContain("Local source identity:");
  expect(result.stdout).toContain("missing SUPABASE_URL (pass --env-file; values are never printed)");
  expect(result.stdout).toContain("missing SUPABASE_ANON_KEY (pass --env-file; values are never printed)");
  expect(result.stdout).toContain("missing CLIENT_SLUG");
  expect(result.stdout).not.toContain("missing CLIENT_MODEL_ALLOWLIST");
  expect(result.stdout).not.toContain("Starting Veloce client-runtime local test");
});

test("local parity check identifies an absent anon key when the project URL is present", () => {
  const result = check({ SUPABASE_URL: "https://example.supabase.co" });
  expect(result.status).toBe(0);
  expect(result.stdout).not.toContain("missing SUPABASE_URL");
  expect(result.stdout).toContain("missing SUPABASE_ANON_KEY (pass --env-file; values are never printed)");
  expect(result.stdout).not.toContain("https://example.supabase.co");
});

test("production build and start modes cannot be combined with a config-only check", () => {
  const result = check({}, ["--build-production"]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Choose one of --check-config, --build-production, or --production");
});

test("local provider calls require an explicit binary opt-in", () => {
  const enabled = check({ CLIENT_PROVIDER_CALLS_ENABLED: "1" });
  expect(enabled.status).toBe(0);
  expect(enabled.stdout).toContain("Provider calls enabled by explicit configuration.");
  expect(enabled.stdout).toContain("missing CLIENT_MODEL_ALLOWLIST");
  const invalid = check({ CLIENT_PROVIDER_CALLS_ENABLED: "true" });
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toContain("must be 0 or 1");
});

test("signed-in UI parity does not require a model allowlist while providers are off", () => {
  const result = check({
    SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "synthetic-anon",
    CLIENT_SLUG: "tenant-a", CLIENT_ALLOWED_USER_EMAILS: "tester@example.com",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Provider calls disabled.");
  expect(result.stdout).not.toContain("Authenticated local parity will NOT");
  expect(result.stdout).not.toContain("missing CLIENT_MODEL_ALLOWLIST");
});

test("clean local runtime config reports the exact checkout commit", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "client-local-source-"));
  try {
    const script = path.join(temp, "run-client-runtime-local.mjs");
    copyFileSync("scripts/run-client-runtime-local.mjs", script);
    writeFileSync(path.join(temp, "tracked.txt"), "fixture\n");
    const git = (...args: string[]) => spawnSync("git", args, { cwd: temp, encoding: "utf8" });
    expect(git("init", "-q").status).toBe(0);
    expect(git("add", ".").status).toBe(0);
    expect(git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture").status).toBe(0);
    const head = git("rev-parse", "--verify", "HEAD").stdout.trim();
    const result = spawnSync(process.execPath, [script, "--check-config"], {
      cwd: temp, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Local source identity: ${head}.`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
