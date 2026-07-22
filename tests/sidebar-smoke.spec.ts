import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/agent-kanban",
  "/antigravity",
  "/capabilities",
  "/claude",
  "/codex",
  "/freeclaude",
  "/flow-lab",
  "/fusion",
  "/games",
  "/glm",
  "/glm-code",
  "/grok",
  "/engine",
  "/goals",
  "/guide",
  "/hermes",
  "/integrations",
  "/journal",
  "/kanban",
  "/kimi",
  "/leads",
  "/local",
  "/loop",
  "/memory",
  "/music",
  "/notebook",
  "/openclaw",
  "/opendesign",
  "/openmontage",
  "/paperclip",
  "/pipeline",
  "/radar",
  "/room",
  "/ruflo",
  "/sakana",
  "/seo",
  "/seo-guide",
  "/studio",
  "/thumbnails",
  "/video",
  "/web-studio",
] as const;

test.use({ baseURL: "http://127.0.0.1:3737" });

for (const route of routes) {
  test(`${route} renders without a client crash`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `navigation status for ${route}`).toBe(200);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    expect(pageErrors, `uncaught page errors for ${route}`).toEqual([]);
  });
}

test("integrations remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/integrations", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1").filter({ hasText: "Integrations" })).toBeVisible();
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
});

test("mission control exposes the six Veloce operating lenses", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /follow the work/i })).toBeVisible();
  for (const lens of ["Command", "Context", "Orchestrate", "Create", "Govern", "Deliver"]) {
    await expect(page.getByText(lens, { exact: true }).first()).toBeVisible();
  }
  await expect(page.locator("[data-canvas-ready], .home-immersive__fallback").first()).toBeVisible();
});

test("capabilities registry exposes curated client-ready and operator-managed boundaries", async ({ page }) => {
  await page.goto("/capabilities", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /better models need better boundaries/i })).toBeVisible();
  await expect(page.getByText("Veloce Web Studio", { exact: true })).toBeVisible();
  await expect(page.getByText("Hermes MCP Catalog", { exact: true })).toBeVisible();
  await expect(page.getByText("Scroll Asset Sequencing", { exact: true })).toBeVisible();
});

test("Flow Lab produces a reusable owned-frame sequence contract", async ({ page }) => {
  await page.goto("/flow-lab", { waitUntil: "networkidle" });
  await page.getByPlaceholder("Client or project name").fill("Veloce sequence smoke test");
  await page.getByPlaceholder("https://reference.example or local-file label").fill("https://example.com/reference");
  await page.getByLabel("Veloce design profile").selectOption("immersive-operational");
  await page.getByLabel("Original asset implementation").selectOption("frame-sequence");
  await expect(page.getByText("Owned frame-sequence contract", { exact: true })).toBeVisible();
  await page.getByLabel("Frame count").fill("72");
  await page.getByRole("button", { name: "Create original brief" }).click();
  await expect(page.getByText(/Owned frame-sequence production contract/)).toBeVisible();
  await expect(page.getByText(/72 numbered WEBP files/)).toBeVisible();
});

test("core health APIs return structured responses", async ({ request }) => {
  for (const endpoint of ["/api/vitals", "/api/memory/vault", "/api/memory/graphify", "/api/integrations", "/api/capabilities"]) {
    const response = await request.get(endpoint);
    expect(response.status(), endpoint).toBeLessThan(500);
    expect(response.headers()["content-type"], endpoint).toContain("application/json");
  }
});
