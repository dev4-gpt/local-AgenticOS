import { expect, test } from "@playwright/test";

test("Jina worker accepts only the official Reader base and public HTTPS targets", async () => {
  const { buildReaderUrl, isAllowedReaderBase, isAllowedTarget } = await loadWorker();
  expect(isAllowedReaderBase("https://r.jina.ai")).toBe(true);
  expect(isAllowedReaderBase("https://evil.example/reader")).toBe(false);
  expect(isAllowedTarget("https://example.com/article")).toBe(true);
  expect(isAllowedTarget("http://127.0.0.1/private")).toBe(false);
  expect(isAllowedTarget("https://user:pass@example.com/private")).toBe(false);
  expect(buildReaderUrl("https://r.jina.ai", "https://example.com/article")).toBe("https://r.jina.ai/https://example.com/article");
});

test("Jina worker authorizes the Veloce token without exposing it", async () => {
  const { authorizeWorkerRequest } = await loadWorker();
  expect(authorizeWorkerRequest("Bearer worker-secret", "worker-secret")).toBe(true);
  expect(authorizeWorkerRequest("Bearer wrong", "worker-secret")).toBe(false);
  expect(authorizeWorkerRequest("Bearer worker-secret", "")).toBe(false);
});

test("Jina payload normalizes to bounded citation-ready evidence", async () => {
  const { normalizeJinaPayload } = await loadWorker();
  const result = normalizeJinaPayload({
    data: {
      url: "https://example.com/article",
      title: "Example Article",
      content: "Readable evidence",
      publishedTime: "2026-08-20T00:00:00.000Z",
    },
  }, "https://example.com/article");
  expect(result).toMatchObject({ url: "https://example.com/article", title: "Example Article", markdown: "Readable evidence", status: "complete" });
  expect(JSON.stringify(result)).not.toContain("worker-secret");
});

test("Jina worker requires public DNS resolution before upstream fetch", async () => {
  const { targetResolvesPublicly } = await loadWorker();
  await expect(targetResolvesPublicly("https://example.com/article", async () => [{ address: "93.184.216.34", family: 4 }])).resolves.toBe(true);
  await expect(targetResolvesPublicly("https://example.com/article", async () => [{ address: "127.0.0.1", family: 4 }])).resolves.toBe(false);
});

async function loadWorker() {
  // The worker is a native ESM service file. The contract tests exercise the
  // same module through Playwright's loader without starting its HTTP server.
  return await import("../workers/research-jina/worker.mjs");
}
