import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

test.use({ baseURL: process.env.PUBLIC_SITE_URL || "http://127.0.0.1:4175" });

test("public Veloce edition presents all six operating chapters", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /make the work behind/i })).toBeVisible();

  for (const label of ["Command", "Context", "Orchestrate", "Create", "Govern", "Deliver"]) {
    await expect(page.getByRole("button", { name: new RegExp(label, "i") }).first()).toBeVisible();
  }
  await page.locator("#chapter-2").scrollIntoViewIfNeeded();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(350);
  const png = PNG.sync.read(await page.locator("canvas").screenshot());
  let litPixels = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    if (png.data[index] + png.data[index + 1] + png.data[index + 2] > 110) litPixels += 1;
  }
  expect(litPixels, "Three.js scene should render visible pixels").toBeGreaterThan(350);
  expect(errors).toEqual([]);
});

test("public Veloce edition keeps a readable reduced-motion fallback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Command", { exact: true }).last()).toBeVisible();
  await expect(page.locator(".depth-fallback")).toBeVisible();
});

test("public Veloce edition remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: /map a broken handoff/i })).toBeVisible();
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
});

test("public Veloce edition exposes honest privacy and security boundaries", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Terms" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  // This assertion used to require "stores no form submissions". The site's
  // privacy claim has since reversed: it now states plainly that submitted
  // details ARE stored in order to reply, and warns against sending
  // confidential material. That is the more honest boundary, so the test
  // follows the copy rather than the copy being reverted to satisfy the test.
  await expect(page.getByText(/stores the details you provide/i)).toBeVisible();
  await expect(page.getByText(/do not submit confidential, regulated, or client-identifying/i)).toBeVisible();
  await expect(page.getByText(/no local dashboard, agent execution/i)).toBeVisible();
});
