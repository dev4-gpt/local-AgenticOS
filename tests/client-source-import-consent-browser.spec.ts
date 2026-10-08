import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

const clientBaseUrl = process.env.CLIENT_RUNTIME_TEST_URL || "http://127.0.0.1:3939";
test.use({ baseURL: clientBaseUrl });

test("source pack stays local until permission is confirmed for review", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  const writes: string[] = [];
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().url());
      return route.fulfill({ status: 503, json: { error: "storage_not_configured" } });
    }
    return route.fulfill({ status: 200, json: { ok: true, records: [], nodes: [], edges: [] } });
  });

  await page.goto("/memory");
  await expect(page.getByRole("heading", { name: "Community sources" })).toBeVisible();
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "synthetic-source-pack.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      startUrl: "https://example.org/course",
      skipped: [],
      sources: [{ title: "Synthetic lesson", url: "https://example.org/course/lesson", text: "Consent check.", links: [] }],
    })),
  });

  const permission = page.getByRole("checkbox", { name: /permission to upload and use this batch/ });
  const review = page.getByRole("button", { name: "Review batch 1" });
  await expect(review).toBeDisabled();
  await expect(page.getByRole("button", { name: "Import sources" })).toHaveCount(0);
  expect(writes).toEqual([]);

  await permission.check();
  await expect(review).toBeEnabled();
  expect(writes).toEqual([]);
  await permission.uncheck();
  await expect(review).toBeDisabled();
  expect(writes).toEqual([]);

  await permission.check();
  await review.click();
  await expect(page.getByRole("alert").filter({ hasText: "Your source pack has not been uploaded. File storage needs to be configured for this workspace." })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(new URL(writes[0]).pathname).toBe("/api/client-runtime/artifacts");
});

test("importing one part does not upload the next part without renewed permission", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  const startUrl = "https://example.org/course";
  const parts = [1, 2].map((number) => {
    const source = { title: `Synthetic lesson ${number}`, url: `${startUrl}/${number}`, text: "Consent check.", links: [] };
    const buffer = Buffer.from(JSON.stringify({ startUrl, skipped: [], sources: [source] }));
    return { name: `synthetic.part-${String(number).padStart(3, "0")}.json`, buffer, source, sha256: createHash("sha256").update(buffer).digest("hex") };
  });
  const manifest = { version: 1, startUrl, sources: 2, links: 0, skipped: 0, batches: parts.map((part) => ({ file: part.name, sha256: part.sha256, sources: 1, links: 0 })) };
  let artifactCreates = 0;
  await page.route("https://storage.example.invalid/**", (route) => route.fulfill({ status: 200, body: "" }));
  await page.route("**/api/**", (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ status: 200, json: { ok: true, records: [], nodes: [], edges: [] } });
    const path = new URL(request.url()).pathname;
    if (path === "/api/client-runtime/artifacts") {
      artifactCreates += 1;
      const artifactId = `00000000-0000-4000-8000-${String(artifactCreates).padStart(12, "0")}`;
      return route.fulfill({ status: 200, json: { artifactId, uploadUrl: `https://storage.example.invalid/${artifactCreates}`, uploadHeaders: { "content-type": "application/json" } } });
    }
    if (path.endsWith("/complete")) return route.fulfill({ status: 200, json: { ok: true } });
    if (path === "/api/client-runtime/source-import") {
      const body = request.postDataJSON();
      const index = Number(String(body.artifactId).slice(-1)) - 1;
      if (body.action === "preview") return route.fulfill({ status: 200, json: {
        ok: true, packSha256: parts[index].sha256, sourceCount: 1, linkCount: 0, skippedCount: 0, skipped: [],
        sources: [{ title: parts[index].source.title, url: parts[index].source.url, tab: null, collectedAt: null, text: parts[index].source.text, links: [] }],
      } });
      return route.fulfill({ status: 201, json: { ok: true, result: { imported: 1, updated: 0, duplicates: 0 } } });
    }
    return route.fulfill({ status: 503, json: { error: "unexpected_write" } });
  });

  await page.goto("/memory");
  await page.locator('input[type="file"][multiple]').setInputFiles([
    { name: "synthetic.manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(manifest)) },
    ...parts.map((part) => ({ name: part.name, mimeType: "application/json", buffer: part.buffer })),
  ]);
  const permission = page.getByRole("checkbox", { name: /permission to upload and use this batch/ });
  await expect(page.getByRole("button", { name: "Review batch 1" })).toBeDisabled();
  expect(artifactCreates).toBe(0);
  await permission.check();
  await page.getByRole("button", { name: "Review batch 1" }).click();
  await expect(page.getByRole("button", { name: "Import sources" })).toBeVisible();
  expect(artifactCreates).toBe(1);
  await page.getByRole("button", { name: "Import sources" }).click();
  await expect(page.getByRole("button", { name: "Review batch 2" })).toBeDisabled();
  await expect(permission).not.toBeChecked();
  expect(artifactCreates).toBe(1);
});

test("an invalid later part blocks the entire selection before any upload", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  const startUrl = "https://example.org/course";
  const parts = [1, 2].map((number) => {
    const buffer = Buffer.from(JSON.stringify({ startUrl, skipped: [], sources: [{ title: `Lesson ${number}`, url: `${startUrl}/${number}`, text: "Lesson text", links: number === 2 ? [{ url: "https://example.org/file?X-Amz-Signature=secret", text: "Download" }] : [] }] }));
    return { name: `synthetic.part-${String(number).padStart(3, "0")}.json`, buffer, sha256: createHash("sha256").update(buffer).digest("hex"), links: number === 2 ? 1 : 0 };
  });
  const manifest = { version: 1, startUrl, sources: 2, links: 1, skipped: 0, batches: parts.map((part) => ({ file: part.name, sha256: part.sha256, sources: 1, links: part.links })) };
  const writes: string[] = [];
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") writes.push(route.request().url());
    return route.fulfill({ status: 200, json: { ok: true, records: [], nodes: [], edges: [] } });
  });

  await page.goto("/memory");
  await page.locator('input[type="file"][multiple]').setInputFiles([
    { name: "synthetic.manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(manifest)) },
    ...parts.map((part) => ({ name: part.name, mimeType: "application/json", buffer: part.buffer })),
  ]);
  await expect(page.getByRole("alert").filter({ hasText: "A selected source pack contains invalid content" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review batch 1" })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("imported source text renders links without loading embedded media", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  const mediaRequests: string[] = [];
  await page.route("https://images.example.org/**", (route) => {
    mediaRequests.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/memory-graph")) {
      return route.fulfill({ status: 200, json: { ok: true, nodes: [], edges: [] } });
    }
    return route.fulfill({ status: 200, json: { ok: true, records: [{
      id: "00000000-0000-4000-8000-000000000001",
      title: "Synthetic source",
      content: `# Lesson\n\n${"Background note.\n".repeat(75)}\n- [Read details](https://example.org/guide)\n- ![Course image](https://images.example.org/track.png)\n- [Unsafe](javascript:alert(1))`,
      status: "active",
      metadata: { source_import_key: "synthetic-key", source_url: "https://example.org/lesson", source_links: [] },
      created_at: "2026-10-05T00:00:00Z",
    }], hasMore: false } });
  });

  await page.goto("/memory");
  const record = page.getByRole("article").filter({ hasText: "Synthetic source" });
  const sourceText = record.getByText("Read source text");
  await expect(sourceText).toBeVisible();
  await expect(record.getByRole("link", { name: "Read details" })).not.toBeVisible();
  await sourceText.click();
  await expect(record.getByRole("heading", { name: "Lesson" })).toBeVisible();
  await expect(record.getByRole("link", { name: "Read details" })).toHaveAttribute("href", "https://example.org/guide");
  await expect(record.getByText("Course image")).toBeVisible();
  await expect(record.getByRole("img")).toHaveCount(0);
  await expect(record.getByText("Unsafe")).toBeVisible();
  await expect(record.getByRole("link", { name: "Unsafe" })).toHaveCount(0);
  expect(mediaRequests).toEqual([]);
});

test("permanent record deletion requires confirmation", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  const record = {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Synthetic memory",
    content: "This is disposable test data.",
    status: "active",
    metadata: {},
    created_at: "2026-10-05T00:00:00Z",
  };
  let deleted = false;
  let deleteRequests = 0;
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "DELETE") {
      deleteRequests += 1;
      expect(path).toBe("/api/client-runtime/records");
      expect(new URL(request.url()).searchParams.get("id")).toBe(record.id);
      deleted = true;
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    if (path.endsWith("/memory-graph")) return route.fulfill({ status: 200, json: { ok: true, nodes: [], edges: [] } });
    return route.fulfill({ status: 200, json: { ok: true, records: deleted ? [] : [record], hasMore: false } });
  });

  await page.goto("/memory");
  const item = page.getByRole("article").filter({ hasText: record.title });
  await expect(item).toBeVisible();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(record.title);
    expect(dialog.message()).toContain("cannot be undone");
    await dialog.dismiss();
  });
  await item.getByRole("button", { name: "Delete" }).click();
  await expect(item).toBeVisible();
  expect(deleteRequests).toBe(0);

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(record.title);
    await dialog.accept();
  });
  await item.getByRole("button", { name: "Delete" }).click();
  await expect(item).toHaveCount(0);
  expect(deleteRequests).toBe(1);
});
