import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeResearchWorkerConfigs,
  normalizeResearchWorkerResponse,
  runResearchWorkerAdapter,
  selectResearchWorker,
  type ResearchWorkerState,
} from "../src/lib/researchWorkerAdapters";

const worker = (overrides: Partial<ResearchWorkerState> = {}): ResearchWorkerState => ({
  id: "crawl4ai",
  endpoint: "https://crawl.example.test/v1/extract",
  secretEnv: "CRAWL4AI_WORKER_TOKEN",
  enabled: true,
  allowed: true,
  available: true,
  capabilities: ["extract"],
  costMicros: 1000,
  latencyMs: 1000,
  reliability: 0.95,
  ...overrides,
});

test("worker config validation rejects unpinned or private endpoints and duplicate ids", () => {
  const configs = normalizeResearchWorkerConfigs([
    { id: "crawl4ai", endpoint: "http://127.0.0.1:9000/extract", secretEnv: "TOKEN", enabled: true },
    { id: "crawl4ai", endpoint: "https://crawl.example.test/v1/extract", secretEnv: "TOKEN", enabled: true },
    { id: "crawl4ai", endpoint: "https://crawl-duplicate.example.test/v1/extract", secretEnv: "TOKEN", enabled: true },
    { id: "crawlee", endpoint: "https://crawlee.example.test/v1/extract", secretEnv: "TOKEN", enabled: true, capabilities: ["crawl"] },
    { id: "jina-reader", endpoint: "https://jina.example.test/v1/extract", secretEnv: "TOKEN", enabled: true },
  ]);
  expect(configs.map((config) => config.id)).toEqual(["crawl4ai", "jina-reader"]);
});

test("automatic worker selection balances content fit, cost, latency, and reliability", () => {
  const decision = selectResearchWorker({
    operation: "extract",
    contentType: "pdf",
    workers: [
      worker({ id: "crawl4ai", costMicros: 0, reliability: 0.99 }),
      worker({ id: "crawlee", costMicros: 0, reliability: 0.99 }),
      worker({ id: "jina-reader", endpoint: "https://jina.example.test/v1/extract", secretEnv: "JINA_WORKER_TOKEN", costMicros: 0, reliability: 0.9 }),
    ],
  });
  expect(decision).toMatchObject({ worker: "jina-reader", reason: "content-fit", estimatedCostMicros: 0 });
});

test("worker adapter sends only the bounded Veloce contract and normalizes output", async () => {
  const previous = process.env.CRAWL4AI_WORKER_TOKEN;
  process.env.CRAWL4AI_WORKER_TOKEN = "worker-secret-that-must-not-escape";
  let requestBody: Record<string, unknown> | null = null;
  let requestHeaders: Headers | null = null;
  try {
    const result = await runResearchWorkerAdapter({
      worker: "crawl4ai",
      config: worker(),
      url: "https://public.example/article",
      requestId: "job-123",
      tenantSlug: "tenant-a",
      contentType: "javascript",
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ title: "Article", markdown: "Readable evidence", retrievedAt: "2026-08-20T00:00:00.000Z" }), { status: 200 });
      },
    });
    expect(result).toMatchObject({ ok: true, worker: "crawl4ai" });
    expect(requestBody).toMatchObject({ contractVersion: "v96-research-worker-v1", operation: "extract", url: "https://public.example/article", network: "public-https-only", maxBytes: 2_000_000 });
    expect(requestBody?.tenantScope).toMatch(/^[a-f0-9]{24}$/);
    expect(JSON.stringify(requestBody)).not.toContain("tenant-a");
    expect(requestHeaders?.get("authorization")).toBe("Bearer worker-secret-that-must-not-escape");
    expect(JSON.stringify(result)).not.toContain("worker-secret-that-must-not-escape");
  } finally {
    if (previous === undefined) delete process.env.CRAWL4AI_WORKER_TOKEN;
    else process.env.CRAWL4AI_WORKER_TOKEN = previous;
  }
});

test("worker output is bounded, citation-safe, and redacted when it contains a secret-like value", () => {
  const result = normalizeResearchWorkerResponse({
    title: "Private",
    markdown: "api_key=should-not-be-persisted",
    description: "private",
  }, "https://public.example/article");
  expect(result).toMatchObject({ status: "partial", failureReason: "worker_output_redacted", markdown: "", description: "" });
});

test("worker adapter fails closed for malformed output and private source URLs", async () => {
  const previous = process.env.CRAWL4AI_WORKER_TOKEN;
  process.env.CRAWL4AI_WORKER_TOKEN = "worker-secret";
  try {
    const malformed = await runResearchWorkerAdapter({
      worker: "crawl4ai",
      config: worker(),
      url: "https://public.example/article",
      requestId: "job-123",
      tenantSlug: "tenant-a",
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    });
    expect(malformed).toMatchObject({ ok: false, status: 502, error: "worker_output_invalid" });
    const privateUrl = await runResearchWorkerAdapter({
      worker: "crawl4ai",
      config: worker(),
      url: "http://127.0.0.1/private",
      requestId: "job-123",
      tenantSlug: "tenant-a",
      fetchImpl: async () => new Response("unexpected"),
    });
    expect(privateUrl).toMatchObject({ ok: false, status: 400, error: "worker_source_url_not_allowed" });
  } finally {
    delete process.env.CRAWL4AI_WORKER_TOKEN;
    if (previous !== undefined) process.env.CRAWL4AI_WORKER_TOKEN = previous;
  }
});

test("disabled or unavailable workers cannot become automatic candidates", () => {
  const result = selectResearchWorker({ operation: "extract", workers: [worker({ enabled: false }), worker({ id: "crawlee", endpoint: "https://crawlee.example.test/v1/extract", secretEnv: "CRAWLEE_WORKER_TOKEN", available: false })] });
  expect(result).toMatchObject({ error: "worker_not_configured" });
});

test("research deletion is an authenticated tenant-scoped cascade", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/client-runtime/research/route.ts"), "utf8");
  const migration = readFileSync(join(process.cwd(), "product-experience/supabase-client-structured-research.sql"), "utf8");
  expect(route).toContain('clientRpc("delete_client_research_run"');
  expect(route).toContain('await recordClientAudit("tenant.research_run.deleted"');
  expect(migration).toContain("delete from public.client_research_runs");
  expect(migration).toContain("and tenant_slug = p_tenant_slug");
  expect(migration).toContain("grant execute on function public.delete_client_research_run(text, uuid) to authenticated");
});
