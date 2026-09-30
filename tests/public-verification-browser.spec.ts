import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.PRODUCT_EXPERIENCE_URL || "http://127.0.0.1:3565" });

const requestId = "00000000-0000-4000-8000-000000000001";
const verified = { ok: true, requestId, email: "buyer@example.com" };

test("missing verification token stays local and does not call the API", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/onboarding/verify", (route) => { calls++; return route.fulfill({ status: 400, json: { error: "token_invalid_or_expired" } }); });
  await page.goto("/verify");
  await expect(page.getByText("This verification link is invalid or expired.")).toBeVisible();
  await expect(page).toHaveURL(/\/verify$/);
  expect(calls).toBe(0);
});

test("expired verification link never attempts Checkout", async ({ page }) => {
  let checkoutCalls = 0;
  await page.route("**/api/onboarding/verify", (route) => route.fulfill({ status: 400, json: { error: "token_invalid_or_expired" } }));
  await page.route("**/api/billing/checkout", (route) => { checkoutCalls++; return route.fulfill({ status: 409, json: { error: "email_verification_required" } }); });
  await page.goto("/verify?token=fake-expired-token");
  await expect(page.getByText("This verification link is invalid or expired.")).toBeVisible();
  await expect(page).toHaveURL(/\/verify$/);
  expect(checkoutCalls).toBe(0);
});

test("verification removes its token before Checkout and shows pending review", async ({ page }) => {
  let verifiedToken = "";
  let checkoutReferrer = "";
  await page.route("**/api/onboarding/verify", async (route) => {
    verifiedToken = (route.request().postDataJSON() as { token: string }).token;
    await route.fulfill({ status: 200, json: verified });
  });
  await page.route("**/api/billing/checkout", async (route) => {
    checkoutReferrer = route.request().headers().referer ?? "";
    await route.fulfill({ status: 409, json: { error: "commercial_scope_pending" } });
  });
  await page.goto("/verify?token=fake-one-time-token");
  await expect(page.getByText(/payment and activation remain pending review/i)).toBeVisible();
  await expect(page).toHaveURL(/\/verify$/);
  expect(verifiedToken).toBe("fake-one-time-token");
  expect(checkoutReferrer).not.toContain("fake-one-time-token");
});

for (const checkoutUrl of ["https://evil.example/collect", "https://checkout.stripe.com.evil.example/c/pay/fake"]) {
  test(`verification refuses a non-Stripe Checkout destination: ${checkoutUrl}`, async ({ page }) => {
    await page.route("**/api/onboarding/verify", (route) => route.fulfill({ status: 200, json: verified }));
    await page.route("**/api/billing/checkout", (route) => route.fulfill({ status: 200, json: { checkoutUrl } }));
    await page.goto("/verify?token=fake-one-time-token");
    await expect(page.getByText(/checkout could not be opened/i)).toBeVisible();
    await expect(page).toHaveURL(/\/verify$/);
  });
}

test("verification can open only an intercepted Stripe Checkout page", async ({ page }) => {
  await page.route("**/api/onboarding/verify", (route) => route.fulfill({ status: 200, json: verified }));
  await page.route("**/api/billing/checkout", (route) => route.fulfill({ status: 200, json: { checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_example" } }));
  await page.route("https://checkout.stripe.com/**", (route) => route.fulfill({ status: 200, body: "<main>Mock Stripe Checkout</main>", contentType: "text/html" }));
  await page.goto("/verify?token=fake-one-time-token");
  await expect(page.getByText("Mock Stripe Checkout")).toBeVisible();
  await expect(page).toHaveURL("https://checkout.stripe.com/c/pay/cs_test_example");
});
