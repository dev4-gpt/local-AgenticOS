import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.PRODUCT_EXPERIENCE_URL || "http://127.0.0.1:3565" });

for (const runtimeUrl of [
  "https://evil.example?.run.app",
  "https://user@tenant-a.run.app",
  "https://tenant-a.run.app/redirect",
]) {
  test(`public callback refuses an untrusted runtime URL: ${runtimeUrl}`, async ({ page }) => {
    await page.route("**/api/onboarding/runtime-destination", (route) => route.fulfill({ json: { runtimeUrl } }));
    await page.goto("/auth/callback#access_token=browser-test-access&refresh_token=browser-test-refresh");
    await expect(page.getByText("Your tenant runtime is not available for this sign-in link.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new sign-in link" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/support");
    await expect(page).toHaveURL(/\/auth\/callback$/);
  });
}

test("expired public callback offers recovery without calling the destination API", async ({ page }) => {
  let destinationCalls = 0;
  await page.setViewportSize({ width: 375, height: 740 });
  await page.route("**/api/onboarding/runtime-destination", (route) => { destinationCalls += 1; return route.abort(); });
  await page.goto("/auth/callback");
  await expect(page.getByText("This sign-in link is invalid or expired.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new sign-in link" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "Contact support" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(destinationCalls).toBe(0);
});

test("stalled public destination lookup offers recovery", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = () => nativeTimeout(50);
  });
  await page.route("**/api/onboarding/runtime-destination", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ json: { runtimeUrl: "https://tenant-a.run.app" } }).catch(() => {});
  });
  await page.goto("/auth/callback#access_token=browser-test-access&refresh_token=browser-test-refresh");
  await expect(page.getByText("Your tenant runtime is not available for this sign-in link.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new sign-in link" })).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/callback$/);
});

test("public callback transfers a test session only to a validated runtime origin", async ({ page }) => {
  await page.route("**/api/onboarding/runtime-destination", (route) => route.fulfill({ json: { runtimeUrl: "https://tenant-a.run.app" } }));
  await page.route("https://tenant-a.run.app/auth/callback", (route) => route.fulfill({ status: 200, body: "<main>Tenant callback reached</main>", contentType: "text/html" }));
  await page.goto("/auth/callback#access_token=browser-test-access&refresh_token=browser-test-refresh");
  await expect(page.getByText("Tenant callback reached")).toBeVisible();
  await expect(page).toHaveURL(/^https:\/\/tenant-a\.run\.app\/auth\/callback#access_token=browser-test-access&refresh_token=browser-test-refresh$/);
});
