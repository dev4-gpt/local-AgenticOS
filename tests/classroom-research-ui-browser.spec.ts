import { expect, test } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:3939", viewport: { width: 390, height: 844 } });

test("local classroom UI resumes a bounded collection without horizontal overflow", async ({ page }) => {
  const startUrl = "https://example.org/course";
  const source = { id: "S1", title: "Lesson one", url: `${startUrl}/one`, text: "A permitted lesson", collectedAt: "2026-10-02T00:00:00.000Z", links: [] };
  let resumed = false;
  await page.route("**/api/classroom-research", (route) => {
    const action = route.request().postDataJSON().action;
    if (action === "resume") resumed = true;
    return route.fulfill({ status: 200, json: { run: {
      id: resumed ? "00000000-0000-4000-8000-000000000002" : "00000000-0000-4000-8000-000000000001",
      startUrl, scopePrefix: "/course", createdAt: "2026-10-02T00:00:00.000Z",
      sources: [source], skipped: [], pagesVisited: resumed ? 2 : 1,
      pending: resumed ? [] : [`${startUrl}/two`],
    } } });
  });
  await page.goto("/classroom-research");
  await page.getByLabel("Classroom URL").fill(startUrl);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Collect source pack" }).click();
  await expect(page.getByRole("button", { name: "Continue collection" })).toBeVisible();
  await expect(page.getByText("1 discovered pages remain")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Continue collection" }).click();
  await expect(page.getByRole("button", { name: "Continue collection" })).toHaveCount(0);
  await expect(page.getByText("0 pages remain in the discovered queue", { exact: false })).toBeVisible();
});

test("local classroom UI blocks Skool collection before submission", async ({ page }) => {
  await page.goto("/classroom-research");
  await page.getByLabel("Classroom URL").fill("https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1");
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("alert").filter({ hasText: "Skool collection is unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Collect source pack" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Open sign-in browser" })).toBeDisabled();
});
