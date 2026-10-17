import { expect, test } from "@playwright/test";

const clientPort = Number.parseInt(process.env.CLIENT_RUNTIME_TEST_PORT || "3939", 10);
const clientBaseUrl = process.env.CLIENT_RUNTIME_TEST_URL || `http://127.0.0.1:${clientPort}`;

test.use({ baseURL: clientBaseUrl });

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`spend meter does not show stale totals when budget evidence fails at ${viewport.width}px`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
    let available = false;
    await page.route("**/api/client-runtime/budget", (route) => route.fulfill({
      status: available ? 200 : 502,
      json: available ? { ok: true, capMicros: 1_000_000, spentMicros: 100_000, remainingMicros: 900_000, usedFraction: 0.1, warning: false, exhausted: false, byProvider: { openai: 100_000 } } : { ok: false, error: "budget_read_failed" },
    }));
    await page.goto("/integrations");
    await expect(page.getByText("Budget status unavailable.", { exact: false })).toBeVisible();
    await expect(page.getByText("$0.10", { exact: false })).toHaveCount(0);
    available = true;
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("$0.10", { exact: false }).first()).toBeVisible();
    available = false;
    await page.reload();
    await expect(page.getByText("Budget status unavailable.", { exact: false })).toBeVisible();
    await expect(page.getByText("$0.10", { exact: false })).toHaveCount(0);
  });

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

  test(`tenant dashboard shows redacted job stages at ${viewport.width}px`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
    await page.route("**/api/client-runtime/observability", (route) => route.fulfill({ status: 200, json: {
      ok: true, posthogCaptureEnabled: false, providerCounts: {}, recentEvents: [],
      recentJobs: [{ provider: "openai", status: "failed", errorCode: "provider_timeout", createdAt: "2026-10-08T00:00:00Z",
        trace: { totalDurationMs: 120, truncated: false, spans: [
          { stage: "claim", durationMs: 3, outcome: "ok" },
          { stage: "provider_call", durationMs: 117, outcome: "error" },
        ] }, output: "private-output" }],
    } }));
    await page.goto("/");
    const trace = page.getByText("Job trace · 120 ms", { exact: true });
    await expect(trace).toBeVisible();
    await trace.click();
    await expect(page.getByRole("list", { name: "Job stages" }).getByText("provider call · error")).toBeVisible();
    await expect(page.getByText("private-output")).toHaveCount(0);
  });
}
