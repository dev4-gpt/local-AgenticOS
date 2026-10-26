import { defineConfig } from "@playwright/test";
import { notebookJourneyBrowserChannel } from "./scripts/lib/notebook-journey-evidence.mjs";

const baseURL = "http://127.0.0.1:3972";
const channel = notebookJourneyBrowserChannel(process.env.PLAYWRIGHT_BROWSER_CHANNEL);
export default defineConfig({
  testDir: "tests", testMatch: "client-room-review-browser.spec.ts", workers: 1,
  reporter: "line", timeout: 60_000, expect: { timeout: 15_000 },
  use: { baseURL, serviceWorkers: "block", channel: channel === "bundled-chromium" ? undefined : channel },
  webServer: {
    command: "node scripts/run-notebook-journey-local.mjs", url: `${baseURL}/login`,
    env: { CLIENT_RUNTIME_TEST_SURFACE: "room", CLIENT_RUNTIME_TEST_PORT: "3972" },
    timeout: 180_000, reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
