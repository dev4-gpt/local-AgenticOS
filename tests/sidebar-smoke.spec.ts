import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/agent-kanban",
  "/antigravity",
  "/claude",
  "/codex",
  "/freeclaude",
  "/fusion",
  "/games",
  "/glm",
  "/glm-code",
  "/grok",
  "/guide",
  "/hermes",
  "/integrations",
  "/kanban",
  "/kimi",
  "/local",
  "/loop",
  "/memory",
  "/music",
  "/notebook",
  "/openclaw",
  "/opendesign",
  "/openmontage",
  "/paperclip",
  "/pipeline",
  "/room",
  "/sakana",
  "/seo",
  "/thumbnails",
  "/video",
  "/web-studio",
] as const;

test.use({ baseURL: "http://127.0.0.1:3737" });

for (const route of routes) {
  test(`${route} renders without a client crash`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `navigation status for ${route}`).toBe(200);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    expect(pageErrors, `uncaught page errors for ${route}`).toEqual([]);
  });
}

test("integrations remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/integrations", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
});
