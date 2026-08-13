import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeBraveSearchResponse, searchBraveWeb } from "../src/lib/braveSearchAdapter";
import { marketSearchToV96Records } from "../src/lib/clientSeoAdapter";
import { validateClientRuntimePublicBaseUrl } from "../src/lib/clientRuntimeTunnelPolicy";

test("Brave normalization is bounded, citation-ready, and rejects malformed URLs", () => {
  const results = normalizeBraveSearchResponse({
    web: { results: [
      { url: "https://one.example/a", title: "One", description: "Evidence one" },
      { url: "http://two.example/b", title: "Two", description: "Plaintext rejected" },
      { url: "https://user:pass@three.example/c", title: "Three", description: "Credentials rejected" },
      { url: "https://four.example/d", title: "Four", description: "Evidence four" },
      { url: "https://five.example/e", title: "Five", description: "Evidence five" },
      { url: "https://six.example/f", title: "Six", description: "Bounded away" },
    ] },
  }, 3);
  expect(results).toHaveLength(3);
  expect(results.map((result) => result.url)).toEqual([
    "https://one.example/a",
    "https://four.example/d",
    "https://five.example/e",
  ]);
  expect(results.every((result) => result.markdown === "")).toBe(true);
});

test("malformed or incomplete Brave payloads become an empty partial search set", () => {
  expect(normalizeBraveSearchResponse(null)).toEqual([]);
  expect(normalizeBraveSearchResponse({ web: { results: [{ title: "missing URL" }] } })).toEqual([]);
  const [record] = marketSearchToV96Records({
    tenantSlug: "tenant-a",
    query: "bounded brave search",
    provider: "brave",
    scraped: false,
    results: [{ url: "https://source.example/page", title: "Source", description: "Snippet evidence", markdown: "" }],
  });
  expect(record.provider).toBe("brave");
  expect(record.status).toBe("partial");
  expect(record.citations[0].evidence).toBe("Snippet evidence");
});

test("Brave request is bounded and never returns the server key as evidence", async () => {
  const secret = "brv-test-secret-that-must-not-escape";
  let requested: { url: string; headers: Headers } | null = null;
  const fetchImpl: typeof fetch = async (input, init) => {
    requested = { url: String(input), headers: new Headers(init?.headers) };
    return new Response(JSON.stringify({ web: { results: [{ url: "https://example.com", title: "Example", description: "A result" }] } }), { status: 200 });
  };
  const result = await searchBraveWeb({ query: "  a bounded query ", limit: 99, apiKey: secret, fetchImpl });
  expect(result.ok).toBe(true);
  expect(requested?.url).toContain("count=3");
  expect(requested?.url).toContain("q=a+bounded+query");
  expect(requested?.headers.get("X-Subscription-Token")).toBe(secret);
  expect(JSON.stringify(result)).not.toContain(secret);
});

test("Brave refuses a missing key before any network call", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return new Response("unexpected");
  };
  const result = await searchBraveWeb({ query: "query", apiKey: "", fetchImpl });
  expect(result).toMatchObject({ ok: false, error: "provider_not_configured" });
  expect(called).toBe(false);
});

test("the local tunnel verifier requires a public HTTPS origin", () => {
  expect(validateClientRuntimePublicBaseUrl("https://example.trycloudflare.com")).toBe("https://example.trycloudflare.com");
  expect(() => validateClientRuntimePublicBaseUrl("http://127.0.0.1:3939")).toThrow(/HTTPS/);
  expect(() => validateClientRuntimePublicBaseUrl("https://localhost:3939")).toThrow(/public tunnel/);
});

test("the worker enforces Brave search-only behavior and attributes its budget", () => {
  const worker = readFileSync(join(process.cwd(), "src/app/api/internal/client-runtime/jobs/route.ts"), "utf8");
  expect(worker).toContain('const scrapeResults = provider === "brave" ? false : input.scrapeResults === true;');
  expect(worker).toContain('reserveClientRuntimeBudgetWorker({ provider, model: scrapeResults ? "search-scrape" : "search"');
  expect(worker).not.toContain('reserveClientRuntimeBudgetWorker({ provider: "firecrawl", model: scrapeResults ? "search-scrape"');
});

test("crawler references remain non-executable catalog entries", () => {
  const catalog = readFileSync(join(process.cwd(), "src/lib/v96RepositoryCatalog.ts"), "utf8");
  for (const id of ["crawl4ai", "crawlee", "jina-reader"]) {
    expect(catalog).toContain(`\"${id}\"`);
  }
  expect(catalog).toContain('activation: "reference-only"');
});
