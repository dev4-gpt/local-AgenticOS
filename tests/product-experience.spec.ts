import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.PRODUCT_EXPERIENCE_URL || "http://127.0.0.1:3565" });

test("product experience opens on the Renaissance hero", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /ren.*ssance/i })).toBeVisible();
  await expect(page.getByText(/veloce agentic/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("product experience sidebar links to every operating pillar", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  for (const label of ["Command", "Context", "Orchestrate", "Create", "Govern", "Deliver", "Contact"]) {
    await expect(page.getByRole("link", { name: new RegExp(`^${label}`, "i") })).toBeVisible();
  }
});

test("product experience header search is readable and searchable", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: /search os surfaces/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /editions/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^github$/i })).toHaveCount(0);

  await page.getByRole("button", { name: /search os surfaces/i }).click();
  await page.getByPlaceholder(/search memory/i).fill("memory");

  await expect(page.getByRole("link", { name: /memory/i }).first()).toBeVisible();
  await expect(page.getByText(/approved reasoning/i).first()).toBeVisible();
  await page.getByRole("link", { name: /memory/i }).first().click();
  await expect(page).toHaveURL(/#agentic$/);
});

test("unconfigured runtime cards request access in the current tab", async ({ page }) => {
  test.skip(Boolean(process.env.NEXT_PUBLIC_APP_URL), "Configured client runtime cards open the workspace.");
  await page.goto("/", { waitUntil: "networkidle" });
  const memory = page.locator("#agentic").getByRole("link", { name: "Ask about access" }).first();
  await expect(memory).toHaveAttribute("href", "#developer");
  await expect(memory).not.toHaveAttribute("target", "_blank");
  await memory.click();
  await expect(page).toHaveURL(/#developer$/);
});

test("product experience contact form is present and submittable", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#developer").scrollIntoViewIfNeeded();

  await expect(page.getByLabel(/full name/i)).toBeVisible();
  await expect(page.getByLabel(/work email/i)).toBeVisible();
  await expect(page.getByLabel(/company/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /start the conversation/i })).toBeVisible();
});

test("product experience exposes the public catalog and credits policy", async ({ page }) => {
  await page.goto("/start", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: /provider catalog/i })).toHaveAttribute("href", "/provider-catalog");
  await expect(page.getByRole("link", { name: /credits policy/i })).toHaveAttribute("href", "/credits");

  await page.goto("/provider-catalog", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /see what powers the pipeline/i })).toBeVisible();
  await expect(page.getByText(/Ponytail restraint guard/i)).toBeVisible();
  await expect(page.getByText(/Brave Search/i)).toBeVisible();
  await expect(page.getByText(/OpenSEO/i)).toBeVisible();

  await page.goto("/credits", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /platform fees, scope, and provider credits/i })).toBeVisible();
  await expect(page.getByText(/With BYOK, you pay the provider directly/i)).toBeVisible();
});

test("product experience legal links resolve to real policy sections", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator("#privacy")).toContainText(/does not expose local files/i);
  await expect(page.locator("#terms")).toContainText(/signed proposal/i);
  await expect(page.locator("#security")).toContainText(/private execution/i);

  await page.getByRole("link", { name: /terms of service/i }).click();
  await expect(page).toHaveURL(/#terms$/);
});

test("product experience remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /ren.*ssance/i })).toBeVisible();
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
});

test("onboarding exposes commercial scope inputs without exposing provider secrets", async ({ page }) => {
  await page.goto("/start", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /describe the operation/i })).toBeVisible();
  for (const label of ["Named seats", "Brands or business units", "Initial workflows", "Media requirement", "Support level", "Managed service need", "Provider usage preference"]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(/provider wallet/i)).toBeVisible();
  await expect(page.getByText(/never paste credentials/i)).toBeVisible();
});
