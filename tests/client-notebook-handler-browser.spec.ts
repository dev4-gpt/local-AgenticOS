import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { artifactId, createNotebookJourney, installNotebookJourneyEnvironment, sourceId, validDraft } from "./helpers/notebook-journey";
import { artifactContentSha256 } from "../src/lib/clientArtifactReview";

let restore: () => void;
test.beforeEach(() => { restore = installNotebookJourneyEnvironment(); });
test.afterEach(() => { restore(); });

for (const scenario of ["cited-draft", "citations-outside-file", "source-changed", "budget-denied", "budget-settlement", "completion-write"] as const) {
  test(`browser plus real handlers: ${scenario}`, async ({ page, context, browser, baseURL }, testInfo) => {
    testInfo.annotations.push({ type: "notebook-browser-version", description: browser.version() });
    const flow = createNotebookJourney(scenario === "citations-outside-file" ? `\`\`\`markdown\n# Uncited draft\n\`\`\`\n${validDraft}` : undefined);
    flow.state.authenticated = false;
    const submitted: Record<string, unknown>[] = [];
    const unexpected: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    // Deny all non-local traffic, including fonts; no session from a user's Chrome is loaded.
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== baseURL) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname === "/api/client-auth/session") return route.fulfill({ json: {
        authenticated: flow.state.authenticated, workspaceAuthorized: flow.state.authenticated,
        accessError: null, user: flow.state.authenticated ? { id: flow.state.userId } : null,
      } });
      if (url.pathname === "/api/client-auth/login" && request.method() === "POST") {
        expect(request.postDataJSON()).toEqual({ email: "synthetic@example.invalid", password: "synthetic-password" });
        flow.state.authenticated = true;
        return route.fulfill({ headers: { "set-cookie": "veloce_access_token=synthetic-browser-test; Path=/; HttpOnly; SameSite=Lax" }, json: { ok: true } });
      }
      expect(request.headers().cookie).toContain("veloce_access_token=synthetic-browser-test");
      if (url.pathname === "/api/client-runtime/records" && request.method() === "GET") return route.fulfill({ json: { ok: true, records: [flow.state.source], hasMore: false } });
      if (url.pathname === "/api/client-runtime/notebooks" && request.method() === "GET") return route.fulfill({ json: { ok: true, notebooks: [] } });
      try {
        const body = request.postDataBuffer();
        if (request.method() === "POST") submitted.push(request.postDataJSON() as Record<string, unknown>);
        const response = await flow.handle(new Request(request.url(), {
          method: request.method(), headers: request.headers(), ...(body ? { body: new Uint8Array(body) } : {}),
        }));
        return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
      } catch (error) {
        unexpected.push(error instanceof Error ? error.message : String(error));
        return route.fulfill({ status: 500, json: { ok: false, error: "unexpected_fixture_request" } });
      }
    });

    await page.goto("/login?next=%2Fnotebook");
    await page.getByLabel("Email", { exact: true }).fill("synthetic@example.invalid");
    await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/notebook`);
    await expect(page.getByText("1 notebook records", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "studio", exact: true }).click();
    await expect(page.getByRole("button", { name: "studio", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Build the document" })).toBeDisabled();
    await page.getByRole("button", { name: "Discovery notes", exact: true }).click();
    await page.getByRole("button", { name: "Client proposal", exact: true }).click();
    await page.getByRole("button", { name: "Build the document" }).click();
    expect(unexpected, JSON.stringify(unexpected)).toEqual([]);
    await expect(page.getByText(/^queued/)).toBeVisible();
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ surface: "notebook", notebookOutput: "proposal", sourceIds: [sourceId] });
    expect(submitted[0]).not.toHaveProperty("goal");
    expect(JSON.stringify(submitted)).not.toContain(flow.state.source.content);

    if (scenario === "source-changed") flow.state.source.content = "Changed after queueing";
    if (scenario === "budget-denied") flow.state.budgetAllowed = false;
    if (scenario === "budget-settlement") flow.state.budgetSettlementAllowed = false;
    if (scenario === "completion-write") {
      flow.state.completionAllowed = false;
      await expect(flow.run()).rejects.toThrow("job_completion_failed");
    } else {
      const worker = await flow.run();
      expect(worker.status).toBe(200);
    }
    if (scenario === "budget-settlement" || scenario === "completion-write") {
      if (scenario === "budget-settlement") await expect(page.getByText(/^failed.*budget_settlement_failed/)).toBeVisible();
      else await expect(page.getByText(/^running/)).toBeVisible();
      expect(flow.state.objects.size).toBe(1);
      expect(flow.state.providerCalls).toBe(1);
      const hash = artifactContentSha256(flow.state.objects.get(String(flow.state.artifact!.object_key))!);
      expect((await flow.preview()).status).toBe(409);
      expect((await flow.decide(hash)).status).toBe(409);
      expect((await flow.download()).status).toBe(409);
      await page.getByRole("button", { name: "assets", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Unavailable");
      await expect(page.getByRole("button", { name: "Review", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Download", exact: true })).toBeDisabled();
      expect(flow.state.downloads).toBe(0);
      expect((await flow.handle(new Request(`${baseURL}/api/client-runtime/artifacts?id=${artifactId}`))).status).toBe(409);
      if (scenario === "budget-settlement") {
        // Exercise non-Notebook asset controls using the same failed job fixture.
        flow.state.job!.capability = "ruflo-swarm";
        await page.getByRole("button", { name: "studio", exact: true }).click();
        await page.getByRole("button", { name: "assets", exact: true }).click();
        await expect(page.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
        const button = page.getByRole("button", { name: "Download", exact: true });
        await expect(button).toBeDisabled();
        await button.scrollIntoViewIfNeeded();
        await expect(button).toBeInViewport();
        await page.screenshot({ path: testInfo.outputPath("generated-job-blocked-desktop.png"), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(button).toBeDisabled();
        await button.scrollIntoViewIfNeeded();
        await expect(button).toBeInViewport();
        const bounds = await button.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
        await page.screenshot({ path: testInfo.outputPath("generated-job-blocked-mobile.png"), fullPage: true });
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    } else if (scenario !== "cited-draft") {
      const reason = scenario === "source-changed" ? "notebook_source_changed" : scenario === "budget-denied" ? "budget_exceeded" : "notebook_citation_missing";
      await expect(page.getByText(new RegExp(`^failed.*${reason}`))).toBeVisible();
      await expect(page.getByRole("button", { name: "Download", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
      expect(flow.state.objects.size).toBe(0);
      expect(flow.state.providerCalls).toBe(scenario === "citations-outside-file" ? 1 : 0);
    } else {
      await expect(page.getByText(/^succeeded/)).toBeVisible();
      await expect(page.getByText("Citation format passed · 1 source cited")).toBeVisible();
      await expect(page.getByRole("link", { name: "Source", exact: true })).toHaveAttribute("href", "https://example.org/discovery");
      await expect(page.getByRole("button", { name: "Download", exact: true })).toBeDisabled();
      expect((await flow.download()).status).toBe(409);
      await page.getByRole("button", { name: "Review", exact: true }).click();
      await expect(page.getByLabel("Draft content for review")).toHaveText(validDraft);
      await expect(page.getByRole("button", { name: "Download", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Reject draft", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Rejected");
      expect((await flow.download()).status).toBe(409);
      await page.getByRole("button", { name: "Approve export", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Approved");
      await page.screenshot({ path: testInfo.outputPath("review-approved-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByLabel("Draft content for review")).toBeVisible();
      const reviewBox = await page.getByLabel("Draft content for review").boundingBox();
      expect(reviewBox!.x).toBeGreaterThanOrEqual(0);
      expect(reviewBox!.x + reviewBox!.width).toBeLessThanOrEqual(390);
      await page.getByRole("button", { name: "Reject draft", exact: true }).click();
      await expect(page.getByRole("button", { name: "Download", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Approve export", exact: true }).click();
      await expect(page.getByRole("button", { name: "Download", exact: true })).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath("review-approved-mobile.png"), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.reload();
      await expect(page.getByText("1 notebook records", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "studio", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Approved");
      await expect(page.getByRole("button", { name: "Download", exact: true })).toBeEnabled();
      for (const lane of ["studio", "assets"]) {
        if (lane === "assets") await page.getByRole("button", { name: "assets", exact: true }).click();
        const pending = page.waitForEvent("download");
        await page.getByRole("button", { name: "Download", exact: true }).click();
        const download = await pending;
        expect(download.suggestedFilename()).toMatch(/\.md$/);
        expect((await readFile((await download.path())!, "utf8")).trim()).toBe(validDraft);
      }
      expect(flow.state.downloads).toBe(7);
      expect(flow.state.providerCalls).toBe(1);
    }
    await page.screenshot({ path: testInfo.outputPath(`${scenario}.png`), fullPage: true });
    expect(unexpected).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
