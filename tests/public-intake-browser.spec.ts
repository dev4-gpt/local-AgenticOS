import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.PRODUCT_EXPERIENCE_URL || "http://127.0.0.1:3565" });

test("public intake preserves a failed request and copies it only on command", async ({ page }) => {
  await page.addInitScript(() => {
    const copies: string[] = [];
    Object.defineProperty(window, "__testClipboardWrites", { value: copies });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { copies.push(value); } } });
  });
  await page.route("**/api/deployment-request", (route) => route.fulfill({ status: 503, json: { error: "store_unavailable" } }));
  await page.goto("/start");
  await page.getByLabel("Full name").fill("Sample Buyer");
  await page.getByLabel("Work email").fill("buyer@example.com");
  await page.getByLabel("Company", { exact: true }).fill("Example Studio");
  await page.getByLabel(/workflow you want/i).fill("Create reviewed briefs from approved notes.");
  await page.locator('input[name="termsAccepted"]').check();
  await page.locator('input[name="privacyAccepted"]').check();
  await page.getByRole("button", { name: "Start public onboarding" }).click();

  await expect(page.getByText(/couldn't save your request/i)).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Sample Buyer");
  expect(await clipboardWrites(page)).toEqual([]);

  await page.getByLabel("Company", { exact: true }).fill("Updated Studio");
  await page.getByRole("button", { name: "Copy request brief" }).click();
  await expect(page.getByText(/request brief copied/i)).toBeVisible();
  expect(await clipboardWrites(page)).toHaveLength(1);
  expect((await clipboardWrites(page))[0]).toContain("Sample Buyer");
  expect((await clipboardWrites(page))[0]).toContain("Updated Studio");

  await page.unroute("**/api/deployment-request");
  await page.route("**/api/deployment-request", (route) => route.fulfill({ status: 200, json: { ok: true, requestId: "00000000-0000-4000-8000-000000000001" } }));
  await page.getByRole("button", { name: "Start public onboarding" }).click();
  await expect(page.getByText(/request received/i)).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Copy request brief" })).toHaveCount(0);
  expect(await clipboardWrites(page)).toHaveLength(1);
});

test("public intake fallback actions remain separate and readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/deployment-request", (route) => route.fulfill({ status: 503, json: { error: "store_unavailable" } }));
  await page.goto("/start");
  await page.getByLabel("Full name").fill("Sample Buyer");
  await page.getByLabel("Work email").fill("buyer@example.com");
  await page.getByLabel("Company", { exact: true }).fill("Example Studio");
  await page.getByLabel(/workflow you want/i).fill("Create reviewed briefs.");
  await page.locator('input[name="termsAccepted"]').check();
  await page.locator('input[name="privacyAccepted"]').check();
  await page.getByRole("button", { name: "Start public onboarding" }).click();
  const copy = page.getByRole("button", { name: "Copy request brief" });
  const retry = page.getByRole("button", { name: "Start public onboarding" });
  await expect(copy).toBeVisible();
  await expect(retry).toBeVisible();
  const copyBox = await copy.boundingBox();
  const retryBox = await retry.boundingBox();
  expect(copyBox && retryBox).toBeTruthy();
  if (copyBox && retryBox) expect(copyBox.x + copyBox.width <= retryBox.x || retryBox.x + retryBox.width <= copyBox.x || copyBox.y + copyBox.height <= retryBox.y || retryBox.y + retryBox.height <= copyBox.y).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

async function clipboardWrites(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as Window & { __testClipboardWrites: string[] }).__testClipboardWrites);
}
