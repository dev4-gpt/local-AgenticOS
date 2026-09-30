import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.PRODUCT_EXPERIENCE_URL || "http://127.0.0.1:3565" });

test("setup without a token never calls the API", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/onboarding/setup", (route) => { calls++; return route.fulfill({ status: 400, json: { error: "invalid_token" } }); });
  await page.goto("/setup");
  await expect(page.getByText("This setup link is invalid or expired.")).toBeVisible();
  await page.getByRole("button", { name: "Continue securely" }).click();
  expect(calls).toBe(0);
  await expect(page).toHaveURL(/\/setup$/);
});

test("setup keeps a fake token out of history and waits for customer confirmation", async ({ page }) => {
  let postedToken = "";
  let referer = "";
  const actionLink = "https://db.invalid/auth/v1/verify?token=fake-magic-token&type=magiclink&redirect_to=https%3A%2F%2Fapp.veloceos.cloud%2Fauth%2Fcallback";
  await page.route("**/api/onboarding/setup", async (route) => {
    postedToken = (route.request().postDataJSON() as { token: string }).token;
    referer = route.request().headers().referer ?? "";
    await route.fulfill({ status: 200, json: { ok: true, actionLink } });
  });
  await page.route("https://db.invalid/auth/v1/verify**", (route) => route.fulfill({ status: 200, body: "<main>Mock Supabase sign-in</main>", contentType: "text/html" }));
  await page.goto("/setup?token=fake-setup-token");
  await expect(page).toHaveURL(/\/setup$/);
  expect(postedToken).toBe("");
  await page.getByRole("button", { name: "Continue securely" }).click();
  await expect(page.getByText("Mock Supabase sign-in")).toBeVisible();
  expect(postedToken).toBe("fake-setup-token");
  expect(referer).not.toContain("fake-setup-token");
});

test("setup API rejection stays on the support path", async ({ page }) => {
  await page.route("**/api/onboarding/setup", (route) => route.fulfill({ status: 400, json: { error: "token_invalid_or_expired" } }));
  await page.goto("/setup?token=fake-expired-token");
  await page.getByRole("button", { name: "Continue securely" }).click();
  await expect(page.getByText(/setup link could not be completed/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact support" })).toBeVisible();
  await expect(page).toHaveURL(/\/setup$/);
});
