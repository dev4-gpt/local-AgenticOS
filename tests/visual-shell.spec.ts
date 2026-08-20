import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

test.use({ baseURL: process.env.CLIENT_BROWSER_BASE_URL || "http://127.0.0.1:3737" });

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`immersive Mission Control is framed and nonblank on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /work with more signal/i })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
    if (viewport.name === "mobile") {
      const mobileLenses = page.getByRole("navigation", { name: "Mobile operating lenses" });
      await expect(mobileLenses).toBeVisible();
      await expect(mobileLenses.getByRole("link", { name: "Flow Lab" })).toBeVisible();
    }

    const canvas = page.locator(".home-immersive__canvas canvas");
    const fallback = page.locator(".home-immersive__fallback");
    if (await canvas.count()) {
      await expect(canvas).toBeVisible();
      const image = PNG.sync.read(await canvas.screenshot());
      const samples = new Set<string>();
      const stride = Math.max(4, Math.floor((image.width * image.height) / 5000)) * 4;
      for (let index = 0; index < image.data.length; index += stride) {
        samples.add(`${image.data[index]}:${image.data[index + 1]}:${image.data[index + 2]}:${image.data[index + 3]}`);
      }
      expect(samples.size, "canvas should contain rendered depth, not a blank color").toBeGreaterThan(12);
    } else {
      await expect(fallback).toBeVisible();
    }

    await page.screenshot({ path: `/tmp/veloce-agenticos-home-${viewport.name}.png`, fullPage: false });
  });
}

test("workspace shell keeps operational content above its depth field", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/flow-lab", { waitUntil: "networkidle" });
  await expect(page.getByText("Flow Workstation", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation").first()).toBeVisible();
  await page.screenshot({ path: "/tmp/veloce-agenticos-flow-lab-desktop.png", fullPage: false });
});
