import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const clientPort = process.env.CLIENT_RUNTIME_TEST_PORT || "3939";
const clientBaseUrl = process.env.CLIENT_RUNTIME_TEST_URL || `http://127.0.0.1:${clientPort}`;
const notebookId = "00000000-0000-4000-8000-000000000010";
const sourceId = "00000000-0000-4000-8000-000000000011";

test.use({ baseURL: clientBaseUrl });

test("Notebook Studio submits source IDs and renders the saved source register", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  let submitted: Record<string, unknown> | null = null;
  let executionCreated = false;
  let executionReads = 0;

  await page.route("**/api/client-runtime/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname.endsWith("/records")) {
      return route.fulfill({ status: 200, json: { ok: true, records: [{
        id: sourceId, title: "Client discovery", content: "The client needs a weekly implementation report.", status: "active",
        metadata: { source_url: "https://example.org/discovery", source_links: [{ url: "https://example.org/brief", text: "Approved brief" }] },
        created_at: "2026-10-01T12:00:00Z",
      }], hasMore: false } });
    }
    if (request.method() === "GET" && url.pathname.endsWith("/notebooks")) {
      return route.fulfill({ status: 200, json: { ok: true, notebooks: [{ id: notebookId, title: "Client Alpha", status: "active" }] } });
    }
    if (request.method() === "GET" && url.pathname.endsWith("/executions")) {
      const status = executionCreated && executionReads++ > 0 ? "succeeded" : "queued";
      return route.fulfill({ status: 200, json: { ok: true, executions: executionCreated ? [{
        id: "job-1", status, title: "Client proposal · 1 source", artifactId: status === "succeeded" ? "artifact-1" : null, errorCode: null,
        citationAudit: status === "succeeded" ? { ok: true, citedSourceIds: [sourceId] } : null,
        createdAt: "2026-10-10T12:00:00Z", sourceReferences: [{
          id: sourceId, title: "Client discovery", sourceUrl: "https://example.org/discovery",
          links: [{ url: "https://example.org/brief", text: "Approved brief" }],
        }],
      }] : [] } });
    }
    if (request.method() === "POST" && url.pathname.endsWith("/executions")) {
      submitted = request.postDataJSON() as Record<string, unknown>;
      executionCreated = true;
      return route.fulfill({ status: 202, json: { ok: true, jobId: "job-1", status: "queued" } });
    }
    if (request.method() === "GET" && url.pathname.endsWith("/artifacts")) {
      if (!url.searchParams.has("id")) {
        return route.fulfill({ status: 200, json: { ok: true, artifacts: [{
          id: "artifact-1", original_name: "client-proposal.md", content_type: "text/markdown", byte_size: 56, status: "ready",
        }] } });
      }
      expect(url.searchParams.get("id")).toBe("artifact-1");
      return route.fulfill({ status: 200, json: { ok: true, downloadUrl: "/api/client-runtime/artifacts/artifact-1/download" } });
    }
    if (request.method() === "GET" && url.pathname.endsWith("/download")) {
      return route.fulfill({ status: 200, contentType: "text/markdown", headers: { "content-disposition": "attachment; filename=client-proposal.md" }, body: "# Client proposal\n\nDraft report with reviewed sources." });
    }
    return route.fulfill({ status: 503, json: { ok: false, error: "unexpected_notebook_request" } });
  });

  await page.goto("/notebook");
  await page.getByRole("button", { name: "Client Alpha" }).click();
  await page.getByRole("button", { name: "studio", exact: true }).click();
  await page.getByRole("button", { name: "Client discovery" }).click();
  await page.getByRole("button", { name: "Client proposal" }).click();
  await page.getByRole("button", { name: "Build the document" }).click();

  await expect.poll(() => submitted).not.toBeNull();
  expect(submitted).toMatchObject({ surface: "notebook", notebookOutput: "proposal", notebookScope: notebookId, sourceIds: [sourceId] });
  expect(submitted).not.toHaveProperty("goal");
  expect(JSON.stringify(submitted)).not.toContain("The client needs a weekly implementation report.");
  await expect(page.getByText("Client proposal · 1 source")).toBeVisible();
  await expect(page.getByRole("link", { name: "Source" })).toHaveAttribute("href", "https://example.org/discovery");
  await expect(page.getByRole("link", { name: "Approved brief" })).toHaveAttribute("href", "https://example.org/brief");

  await expect(page.getByText(/^succeeded/)).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Citation format passed · 1 source cited")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByLabel("Draft content for review")).toContainText("Draft report with reviewed sources.");
  const downloadPromise = context.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("client-proposal.md");
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  expect(await readFile(downloadedPath!, "utf8")).toContain("Draft report with reviewed sources.");

  await page.getByRole("button", { name: "assets", exact: true }).click();
  const assetDownloadPromise = context.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const assetDownload = await assetDownloadPromise;
  expect(assetDownload.suggestedFilename()).toBe("client-proposal.md");
  const assetPath = await assetDownload.path();
  expect(assetPath).toBeTruthy();
  expect(await readFile(assetPath!, "utf8")).toContain("Draft report with reviewed sources.");
});
