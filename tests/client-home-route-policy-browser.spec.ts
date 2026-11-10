import { expect, test } from "@playwright/test";

const clientPort = process.env.CLIENT_RUNTIME_TEST_PORT || "3939";
const baseURL = process.env.CLIENT_NAV_BASE_URL || process.env.CLIENT_RUNTIME_TEST_URL || `http://127.0.0.1:${clientPort}`;
const allowed = new Set(["/", "/context", "/memory", "/hermes", "/credentials", "/notebook", "/integrations"]);

test.use({ baseURL });

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`tenant home links follow the runtime manifest at ${viewport.width}px`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: baseURL }]);
    await page.route("**/api/**", (route) => route.fulfill({ status: 200, json: { ok: true, credentials: [], providerCounts: {}, recentJobs: [], recentEvents: [] } }));
    await page.goto("/");

    const destinations = await page.locator('a[href^="/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(destinations.length).toBeGreaterThan(0);
    expect(destinations.filter((href) => href && !allowed.has(href))).toEqual([]);
    await expect(page.getByRole("link", { name: "Start a client request" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Capabilities" })).toHaveCount(0);
    await expect(page.locator('a[href="/claude"]')).toHaveCount(0);
    await expect(page.locator('a[href="/hermes"]')).not.toHaveCount(0);
  });
}
