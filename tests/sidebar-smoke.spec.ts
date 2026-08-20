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

test.use({ baseURL: process.env.CLIENT_BROWSER_BASE_URL || "http://127.0.0.1:3737" });

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
  await expect(page.getByRole("heading", { name: /work with more signal/i })).toBeVisible();
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

test("Memory can create a note and confirm its vault path", async ({ page }) => {
  await page.route("**/api/memory/log", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, path: "Agentic OS/Memories/2026-07-22.md" }),
    });
  });
  await page.route("**/api/memory/recent", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ recent: [] }) });
  });

  await page.goto("/memory", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByLabel("Note title").fill("Veloce operator test");
  await page.getByLabel("Note body").fill("Memory note creation works.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Saved to Agentic OS/Memories/2026-07-22.md")).toBeVisible();
});

test("Memory exposes automatic retrieval and background Graphify controls", async ({ page }) => {
  await page.goto("/memory", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /Smart search/ })).toBeVisible();
  await expect(page.getByText(/Smart search updates automatically/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync sources" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rebuild graph" })).toBeVisible();
  await expect(page.getByText(/curated sources/)).toBeVisible();
});

test("Goals category menu keeps readable workspace-theme contrast", async ({ page }) => {
  await page.goto("/goals", { waitUntil: "domcontentloaded" });
  const category = page.getByLabel("Goal category");
  await expect(category).toBeVisible();
  await expect(category.locator("option")).toHaveCount(8);
  const styles = await category.evaluate((element) => {
    const computed = getComputedStyle(element);
    const option = element.querySelector("option");
    const optionComputed = option ? getComputedStyle(option) : null;
    return {
      colorScheme: computed.colorScheme,
      optionColor: optionComputed?.color,
      optionBackground: optionComputed?.backgroundColor,
    };
  });
  expect(styles.colorScheme).toBe("light");
  expect(styles.optionColor).toBe("rgb(38, 33, 28)");
  expect(styles.optionBackground).toBe("rgb(250, 247, 239)");
});

test("Notebook Library exposes sources and opens each working surface", async ({ page }) => {
  const notebook = {
    id: "notebook-smoke",
    title: "Veloce operating research",
    source_count: 2,
    url: "https://notebooklm.google.com/notebook/notebook-smoke",
    modified_at: "2026-07-22T12:00:00Z",
  };
  await page.route("**/api/notebooklm/health", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: { authenticated: true } }),
  }));
  await page.route("**/api/notebooklm/notebooks", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ notebooks: [notebook] }),
  }));
  await page.route("**/api/notebooklm/notebooks/notebook-smoke", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      notebook,
      sources: [
        { id: "source-1", title: "Agent workflow handbook.pdf" },
        { id: "source-2", title: "Human approval policy.md" },
      ],
    }),
  }));
  await page.route("**/api/notebooklm/library", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ savedAssets: [], root: "/vault/Agentic OS/Notebooks/_assets" }),
  }));
  await page.route("**/api/notebooklm/research?*", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ sources: [] }),
  }));
  await page.route("**/api/notebooklm/studio?*", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ artifacts: [] }),
  }));

  await page.goto("/notebook", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Agent workflow handbook.pdf")).toBeVisible();
  await expect(page.getByText("Human approval policy.md")).toBeVisible();

  const notebookCard = page.getByRole("button", { name: "Select Veloce operating research" }).locator("..");
  await notebookCard.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByText("Active notebook")).toBeVisible();
  await expect(page).toHaveURL(/tab=chat/);
  await expect(page.getByPlaceholder(/Ask anything about this notebook/)).toBeVisible();

  await page.getByRole("button", { name: "Change notebook" }).click();
  await notebookCard.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(page).toHaveURL(/tab=studio/);
  await expect(page.getByRole("button", { name: "Generate" })).toBeVisible();
});

test("core health APIs return structured responses", async ({ request }) => {
  for (const endpoint of ["/api/vitals", "/api/memory/vault", "/api/memory/graphify", "/api/integrations", "/api/capabilities"]) {
    const response = await request.get(endpoint);
    expect(response.status(), endpoint).toBeLessThan(500);
    expect(response.headers()["content-type"], endpoint).toContain("application/json");
  }
});
