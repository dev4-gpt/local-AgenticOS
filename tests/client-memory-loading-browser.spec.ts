import { expect, test } from "@playwright/test";

const clientBaseUrl = process.env.CLIENT_RUNTIME_TEST_URL || process.env.CLIENT_MEMORY_TEST_URL || "http://127.0.0.1:3939";

test.use({ baseURL: clientBaseUrl });

test("tenant memory distinguishes pending data from a confirmed empty workspace", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  let releaseRecords!: () => void;
  let releaseGraph!: () => void;
  const recordsGate = new Promise<void>((resolve) => { releaseRecords = resolve; });
  const graphGate = new Promise<void>((resolve) => { releaseGraph = resolve; });

  await page.route("**/api/client-runtime/records?**", async (route) => {
    await recordsGate;
    await route.fulfill({ status: 200, json: { ok: true, records: [], hasMore: false } });
  });
  await page.route("**/api/client-runtime/memory-graph", async (route) => {
    await graphGate;
    await route.fulfill({ status: 200, json: { ok: true, nodes: [], edges: [] } });
  });

  await page.goto("/memory");
  await expect(page.getByText("Loading tenant records...", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Loading graph...", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("No tenant records yet.", { exact: true })).toHaveCount(0);

  releaseRecords();
  releaseGraph();
  await expect(page.getByText("No tenant records yet.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^graph$/i }).click();
  await expect(page.getByText("No active memories are available to map. Add an active memory, then refresh the map.", { exact: true })).toBeVisible();
});

test("tenant memory reports failed reads instead of presenting them as empty", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  await page.route("**/api/client-runtime/records?**", (route) => route.fulfill({ status: 503, json: { error: "synthetic_unavailable" } }));
  await page.route("**/api/client-runtime/memory-graph", (route) => route.fulfill({ status: 503, json: { error: "synthetic_unavailable" } }));

  await page.goto("/memory");
  await expect(page.getByRole("alert").filter({ hasText: "Tenant records could not be loaded." })).toBeVisible();
  await expect(page.getByText("No tenant records yet.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^graph$/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The tenant knowledge map could not be loaded." })).toBeVisible();
  await expect(page.getByText("No graph links yet. Add two related tenant memories and refresh the map.", { exact: true })).toHaveCount(0);
});

test("an empty graph with active memories identifies a stale graph index", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  await page.route("**/api/client-runtime/records?**", (route) => route.fulfill({
    status: 200,
    json: { ok: true, records: [{ id: "memory-1", title: "Existing memory", content: "Approved content.", status: "active", created_at: "2026-10-14T12:00:00.000Z" }], hasMore: false },
  }));
  await page.route("**/api/client-runtime/memory-graph", (route) => route.fulfill({ status: 200, json: { ok: true, nodes: [], edges: [] } }));

  await page.goto("/memory");
  await page.getByRole("button", { name: /^graph$/i }).click();
  await expect(page.getByText("The graph index is empty despite active memories. Refresh the map to rebuild it.", { exact: true })).toBeVisible();
  await expect(page.getByText("No graph links yet. Add two related tenant memories and refresh the map.", { exact: true })).toHaveCount(0);
});

test("a transient empty graph read is retried once without rebuilding the index", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  let graphReads = 0;
  let graphRefreshes = 0;
  await page.route("**/api/client-runtime/records?**", (route) => route.fulfill({
    status: 200,
    json: { ok: true, records: [{ id: "memory-1", title: "Existing memory", content: "Approved content.", status: "active", created_at: "2026-10-14T12:00:00.000Z" }], hasMore: false },
  }));
  await page.route("**/api/client-runtime/memory-graph", async (route) => {
    if (route.request().method() === "POST") {
      graphRefreshes += 1;
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    graphReads += 1;
    return route.fulfill({ status: 200, json: graphReads === 1
      ? { ok: true, nodes: [], edges: [] }
      : { ok: true, nodes: [{ id: "node-1", record_id: "memory-1", kind: "document", label: "Existing memory", metadata: {} }], edges: [] } });
  });

  await page.goto("/memory");
  await page.getByRole("button", { name: /^graph$/i }).click();
  await expect(page.getByText("Existing memory", { exact: true }).first()).toBeVisible();
  expect(graphReads).toBe(2);
  expect(graphRefreshes).toBe(0);
});

test("a persistently empty graph read remains flagged as stale after one read-only retry", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  const graphReadAt: number[] = [];
  let graphRefreshes = 0;
  await page.route("**/api/client-runtime/records?**", (route) => route.fulfill({
    status: 200,
    json: { ok: true, records: [{ id: "memory-1", title: "Existing memory", content: "Approved content.", status: "active", created_at: "2026-10-14T12:00:00.000Z" }], hasMore: false },
  }));
  await page.route("**/api/client-runtime/memory-graph", async (route) => {
    if (route.request().method() === "POST") {
      graphRefreshes += 1;
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    graphReadAt.push(Date.now());
    return route.fulfill({ status: 200, json: { ok: true, nodes: [], edges: [] } });
  });

  await page.goto("/memory");
  await page.getByRole("button", { name: /^graph$/i }).click();
  await expect(page.getByText("The graph index is empty despite active memories. Refresh the map to rebuild it.", { exact: true })).toBeVisible();
  await expect.poll(() => graphReadAt.length).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(500);
  const delayedRetries = graphReadAt.slice(1).filter((time, index) => time - graphReadAt[index] >= 300);
  expect(delayedRetries).toHaveLength(1);
  expect(graphRefreshes).toBe(0);
});

test("creating a tenant memory refreshes its graph index", async ({ page, context }) => {
  await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
  let created = false;
  let graphRefreshes = 0;
  await page.route("**/api/client-runtime/records**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      created = true;
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    return route.fulfill({ status: 200, json: { ok: true, records: created ? [{ id: "memory-2", title: "New memory", content: "Created in this tenant.", status: "active", created_at: "2026-10-14T12:00:00.000Z" }] : [], hasMore: false } });
  });
  await page.route("**/api/client-runtime/memory-graph", async (route) => {
    if (route.request().method() === "POST") {
      graphRefreshes += 1;
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.fulfill({ status: 200, json: { ok: true, nodes: created ? [{ id: "node-1", record_id: "memory-2", kind: "document", label: "New memory", metadata: {} }] : [], edges: [] } });
  });

  await page.goto("/memory");
  await page.getByPlaceholder("Name this decision or memory").fill("New memory");
  await page.getByPlaceholder("Write the approved project memory here...").fill("Created in this tenant.");
  await page.getByRole("button", { name: "Save to tenant" }).click();
  await expect.poll(() => graphRefreshes).toBe(1);
  await page.getByRole("button", { name: /^graph$/i }).click();
  await expect(page.getByText("0 relationships · 1 nodes", { exact: true })).toBeVisible();
  await expect(page.getByText("New memory", { exact: true }).first()).toBeVisible();
});

for (const failedRead of ["records", "graph"] as const) {
  test(`a saved import reports a failed ${failedRead} refresh without inviting a duplicate import`, async ({ page, context }) => {
    await context.addCookies([{ name: "veloce_access_token", value: "synthetic-browser-test", url: clientBaseUrl }]);
    const source = { title: "Imported lesson", url: "https://example.org/lesson", text: "Synthetic import fixture.", links: [] };
    let imports = 0;
    await page.route("https://storage.example.invalid/**", (route) => route.fulfill({ status: 200, body: "" }));
    await page.route("**/api/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === "GET") {
        if (imports && failedRead === "records" && path.endsWith("/records")) return route.fulfill({ status: 503, json: { error: "synthetic_unavailable" } });
        if (imports && failedRead === "graph" && path.endsWith("/memory-graph")) return route.fulfill({ status: 200, json: { ok: true, nodes: null, edges: [] } });
        return route.fulfill({ status: 200, json: { ok: true, records: [], nodes: [], edges: [] } });
      }
      if (path.endsWith("/source-import/upload")) return route.fulfill({ status: 200, json: { artifactId: "synthetic-artifact", uploadUrl: "https://storage.example.invalid/pack" } });
      if (path.endsWith("/source-import")) {
        if (request.postDataJSON().action === "preview") return route.fulfill({ status: 200, json: { packSha256: "a".repeat(64), sourceCount: 1, linkCount: 0, skippedCount: 0, skipped: [], sources: [source] } });
        imports += 1;
        return route.fulfill({ status: 201, json: { result: { imported: 1, updated: 0, duplicates: 0 } } });
      }
      return route.fulfill({ status: 503, json: { error: "unexpected_write" } });
    });
    await page.goto("/memory");
    await page.locator('input[type="file"][multiple]').setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ startUrl: "https://example.org/course", skipped: [], sources: [source] })) });
    await page.getByRole("checkbox", { name: /permission to upload and use this batch/ }).check();
    await page.getByRole("button", { name: "Review batch 1" }).click();
    await page.getByRole("button", { name: "Import sources" }).click();
    await expect(page.getByText(/1\/1 batches imported.*1 added/)).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "The batch imported, but Memory did not refresh." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import sources" })).toHaveCount(0);
    expect(imports).toBe(1);
  });
}
