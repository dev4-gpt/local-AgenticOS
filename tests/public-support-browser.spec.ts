import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.PRODUCT_EXPERIENCE_URL || "http://127.0.0.1:3565" });

test("support preserves the full ticket ID when email acknowledgement is unavailable", async ({ page }) => {
  const ticketId = "00000000-0000-4000-8000-000000000015";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/support", (route) => route.fulfill({ status: 200, json: { ok: true, requestId: ticketId, acknowledgement: "not_configured" } }));
  await page.goto("/support");
  await page.getByPlaceholder("you@company.com").fill("buyer@example.test");
  await page.getByPlaceholder("Subject").fill("Export help");
  await page.getByPlaceholder("Request or tenant ID (optional)").fill("earlier-onboarding-id");
  await page.getByPlaceholder("Describe the issue or intended provider use without secrets...").fill("Please help export my workspace.");
  await page.getByRole("button", { name: "Contact support" }).click();

  const notice = page.locator('[aria-live="polite"]');
  await expect(notice).toContainText(ticketId);
  await expect(notice).toContainText("Keep this ID for follow-up.");
  await expect(notice).not.toContainText("Check your email");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
