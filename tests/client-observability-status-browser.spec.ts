import { expect, test } from "@playwright/test";

const clientBaseUrl = process.env.CLIENT_RUNTIME_TEST_URL || "http://127.0.0.1:3939";

test.use({ baseURL: clientBaseUrl });

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`observability badge reflects the capture switch at ${viewport.width}px`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
    let captureEnabled = false;
    let responseStatus = 200;
    await page.route("**/api/client-runtime/observability", (route) => route.fulfill({
      status: responseStatus,
      json: {
        ok: responseStatus === 200,
        windowHours: 24,
        posthogConfigured: true,
        posthogCaptureEnabled: captureEnabled,
        sample: { eventsLimited: false, jobsLimited: false, limit: 250 },
        counts: {}, providerCounts: {}, recentEvents: [], recentJobs: [],
      },
    }));
    await page.goto("/");
    await expect(page.getByText("PostHog off", { exact: true })).toBeVisible();
    await expect(page.getByText("Telemetry read", { exact: true })).toBeVisible();
    captureEnabled = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByText("PostHog on", { exact: true })).toBeVisible();
    responseStatus = 503;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByText("PostHog unknown", { exact: true })).toBeVisible();
    await expect(page.getByText("Budget evidence could not be loaded", { exact: true })).toBeVisible();
  });
}
