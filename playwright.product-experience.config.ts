import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  reporter: "line",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { trace: "retain-on-failure", channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined },
});
