import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.CLIENT_NAV_BASE_URL || "http://127.0.0.1:3991" });

test("desktop client navigation omits routes outside the runtime manifest", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/context");

  const navigation = page.getByRole("complementary", { name: "Veloce operating lenses" });
  await expect(navigation.getByRole("link", { name: "Memory" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Classroom Research" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Social Research" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Capabilities" })).toHaveCount(0);
});

test("mobile client navigation follows the same runtime manifest", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/context");

  const navigation = page.getByRole("navigation", { name: "Mobile operating lenses" });
  await expect(navigation.getByRole("link", { name: "Context intake" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Capabilities" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Provider matrix" })).toHaveCount(0);
});
