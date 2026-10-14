import { defineConfig } from "@playwright/test";

const clientPort = Number.parseInt(process.env.CLIENT_RUNTIME_TEST_PORT || "3939", 10);
const clientBaseUrl = process.env.CLIENT_RUNTIME_TEST_URL || `http://127.0.0.1:${clientPort}`;

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: Number.parseInt(process.env.PLAYWRIGHT_WORKERS || "1", 10),
  reporter: "line",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { trace: "retain-on-failure", channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined },
  webServer: {
    command: `env VELOCE_DIST_DIR=.next-client-browser CLIENT_ALLOWED_ROUTES=/,/context,/memory,/hermes,/credentials,/notebook,/integrations CLIENT_PROVIDER_CALLS_ENABLED=0 PORT=${clientPort} node scripts/run-client-runtime-local.mjs --build-production --port ${clientPort} && env VELOCE_DIST_DIR=.next-client-browser CLIENT_ALLOWED_ROUTES=/,/context,/memory,/hermes,/credentials,/notebook,/integrations CLIENT_PROVIDER_CALLS_ENABLED=0 PORT=${clientPort} node scripts/run-client-runtime-local.mjs --production --port ${clientPort}`,
    url: clientBaseUrl,
    reuseExistingServer: process.env.PW_USE_EXISTING_SERVERS === "1",
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
