import { defineConfig } from "@playwright/test";

/** Pure contract/configuration suite. No application servers are needed. */
export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  reporter: "line",
  timeout: 45_000,
  use: process.env.PLAYWRIGHT_CHROME_EXECUTABLE
    ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE } }
    : {},
});
