import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  reporter: "line",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { trace: "retain-on-failure", channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined },
  webServer: {
    command: "env VELOCE_DIST_DIR=.next-client-browser CLIENT_PROVIDER_CALLS_ENABLED=0 node scripts/run-client-runtime-local.mjs --port 3939",
    url: "http://127.0.0.1:3939",
    reuseExistingServer: process.env.PW_USE_EXISTING_SERVERS === "1",
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
