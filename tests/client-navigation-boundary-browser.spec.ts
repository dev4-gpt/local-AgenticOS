import { expect, test } from "@playwright/test";

const clientPort = process.env.CLIENT_RUNTIME_TEST_PORT || "3939";
test.use({ baseURL: process.env.CLIENT_NAV_BASE_URL || process.env.CLIENT_RUNTIME_TEST_URL || `http://127.0.0.1:${clientPort}` });

test("desktop client navigation omits routes outside the runtime manifest", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.context().addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: process.env.CLIENT_RUNTIME_TEST_URL || `http://127.0.0.1:${process.env.CLIENT_RUNTIME_TEST_PORT || "3939"}` }]);
  await page.goto("/context");

  const navigation = page.getByRole("complementary", { name: "Veloce operating lenses" });
  await expect(navigation.getByRole("link", { name: "Memory" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Classroom Research" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Social Research" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Capabilities" })).toHaveCount(0);
});

test("mobile client navigation follows the same runtime manifest", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: process.env.CLIENT_RUNTIME_TEST_URL || `http://127.0.0.1:${process.env.CLIENT_RUNTIME_TEST_PORT || "3939"}` }]);
  await page.goto("/context");

  const navigation = page.getByRole("navigation", { name: "Mobile operating lenses" });
  await expect(navigation.getByRole("link", { name: "Context intake" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Capabilities" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Provider matrix" })).toHaveCount(0);
});
