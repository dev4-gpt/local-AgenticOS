import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

function check(extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["scripts/run-client-runtime-local.mjs", "--check-config"], {
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
  expect(result.stdout).toContain("missing SUPABASE_URL and SUPABASE_ANON_KEY");
  expect(result.stdout).toContain("missing CLIENT_SLUG");
  expect(result.stdout).not.toContain("missing CLIENT_MODEL_ALLOWLIST");
  expect(result.stdout).not.toContain("Starting Veloce client-runtime local test");
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
