import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

test.use({ baseURL: "http://127.0.0.1:3939" });

test("source pack stays local until permission is confirmed for review", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: "http://127.0.0.1:3939" }]);
  const writes: string[] = [];
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().url());
      return route.fulfill({ status: 503, json: { error: "synthetic_review_stop" } });
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
  await expect(page.getByRole("alert").filter({ hasText: "synthetic_review_stop" })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(new URL(writes[0]).pathname).toBe("/api/client-runtime/artifacts");
});

test("importing one part does not upload the next part without renewed permission", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: "http://127.0.0.1:3939" }]);
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
