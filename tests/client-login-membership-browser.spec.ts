import { expect, test } from "@playwright/test";

const baseURL = process.env.CLIENT_RUNTIME_TEST_URL || "http://127.0.0.1:3939";
test.use({ baseURL });

for (const width of [390, 1440]) {
  test(`non-member stays on login with a readable access error at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/client-auth/session", (route) => route.fulfill({ json: { authenticated: true, workspaceAuthorized: false, accessError: "tenant_membership_required" } }));
    await page.goto("/login?next=%2Fmemory");
    await expect(page.getByRole("alert").filter({ hasText: "This account does not have access" })).toContainText("This account does not have access to this workspace.");
    await expect(page).toHaveURL(/\/login\?next=/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`membership-denied-${width}.png`), fullPage: true });
  });
}

test("temporary membership-check failure does not claim the user is denied", async ({ page }) => {
  await page.route("**/api/client-auth/session", (route) => route.fulfill({ json: { authenticated: true, workspaceAuthorized: false, accessError: "tenant_membership_unavailable" } }));
  await page.goto("/login");
  await expect(page.getByRole("alert").filter({ hasText: "Workspace access could not be checked" })).toHaveText("Workspace access could not be checked. Please try again shortly.");
  await expect(page).toHaveURL(/\/login$/);
});

test("password login surfaces tenant denial instead of blaming valid credentials", async ({ page }) => {
  await page.route("**/api/client-auth/session", (route) => route.fulfill({ json: { authenticated: false, workspaceAuthorized: false } }));
  await page.route("**/api/client-auth/login", (route) => route.fulfill({ status: 403, json: { error: "tenant_membership_required" } }));
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("synthetic@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This account does not have access" })).toContainText("This account does not have access to this workspace.");
  await expect(page).toHaveURL(/\/login$/);
});

test("membership revoked between login and session check prevents redirect", async ({ page }) => {
  let signedIn = false;
  await page.route("**/api/client-auth/session", (route) => route.fulfill({ json: { authenticated: signedIn, workspaceAuthorized: false, accessError: signedIn ? "tenant_membership_required" : null } }));
  await page.route("**/api/client-auth/login", (route) => { signedIn = true; return route.fulfill({ json: { ok: true } }); });
  await page.goto("/login?next=%2Fmemory");
  await page.getByLabel("Email", { exact: true }).fill("synthetic@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This account does not have access" })).toBeVisible();
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("an authorized session continues to the requested workspace", async ({ page }) => {
  await page.route("**/api/client-auth/session", (route) => route.fulfill({ json: { authenticated: true, workspaceAuthorized: true, accessError: null } }));
  await page.route("**/memory", (route) => route.fulfill({ contentType: "text/html", body: "<main>Authorized redirect fixture</main>" }));
  await page.goto("/login?next=%2Fmemory");
  await expect(page).toHaveURL(`${baseURL}/memory`);
  await expect(page.getByText("Authorized redirect fixture")).toBeVisible();
});

test("an authorized session ignores a backslash-based external next destination", async ({ page }) => {
  await page.route("**/api/client-auth/session", (route) => route.fulfill({ json: { authenticated: true, workspaceAuthorized: true } }));
  await page.route(`${baseURL}/`, (route) => route.fulfill({ contentType: "text/html", body: "<main>Tenant home fixture</main>" }));
  await page.goto(`/login?next=${encodeURIComponent("/\\evil.example/path")}`);
  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(page.getByText("Tenant home fixture")).toBeVisible();
});

test("password login ignores a backslash-based external next destination", async ({ page }) => {
  let signedIn = false;
  await page.route("**/api/client-auth/session", (route) => route.fulfill({ json: { authenticated: signedIn, workspaceAuthorized: signedIn } }));
  await page.route("**/api/client-auth/login", (route) => { signedIn = true; return route.fulfill({ json: { ok: true } }); });
  await page.route(`${baseURL}/`, (route) => route.fulfill({ contentType: "text/html", body: "<main>Tenant home fixture</main>" }));
  await page.goto(`/login?next=${encodeURIComponent("/\\evil.example/path")}`);
  await page.getByLabel("Email", { exact: true }).fill("synthetic@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(page.getByText("Tenant home fixture")).toBeVisible();
});
