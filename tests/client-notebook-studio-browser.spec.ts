import { expect, test } from "@playwright/test";

const clientBaseUrl = process.env.CLIENT_RUNTIME_TEST_URL || "http://127.0.0.1:3939";
const notebookId = "00000000-0000-4000-8000-000000000010";
const sourceId = "00000000-0000-4000-8000-000000000011";

test.use({ baseURL: clientBaseUrl });

test("Notebook Studio submits source IDs and renders the saved source register", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  let submitted: Record<string, unknown> | null = null;
  let executionCreated = false;

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
      return route.fulfill({ status: 200, json: { ok: true, executions: executionCreated ? [{
        id: "job-1", status: "queued", title: "Client proposal · 1 source", artifactId: null, errorCode: null,
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
});
