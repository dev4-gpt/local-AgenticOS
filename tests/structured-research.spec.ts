import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { marketSearchToV96Records } from "../src/lib/clientSeoAdapter";

test("market research normalization preserves evidence and explicit partial status", () => {
  const records = marketSearchToV96Records({
    tenantSlug: "veloce-cloud-test",
    query: "bounded research",
    scraped: false,
    results: [{ url: "https://example.com/page", title: "Example", description: "A source summary", markdown: "" }],
  });
  expect(records).toHaveLength(1);
  expect(records[0].status).toBe("partial");
  expect(records[0].citations[0].evidence).toBe("A source summary");
  expect(records[0].tenantSlug).toBe("veloce-cloud-test");
});

test("structured research persistence is worker-only and tenant-scoped", () => {
  const sql = readFileSync("product-experience/supabase-client-structured-research.sql", "utf8");
  const worker = readFileSync("src/app/api/internal/client-runtime/jobs/route.ts", "utf8");
  expect(sql).toContain("client_research_runs");
  expect(sql).toContain("client_research_citations");
  expect(sql).toContain("unique (tenant_slug, idempotency_key)");
  expect(sql).toContain("client_research_runs_member_select");
  expect(sql).toContain("record_client_research_result_worker");
  expect(sql).toContain("grant execute on function public.record_client_research_result_worker");
  expect(worker).toContain('workerRpc("record_client_research_result_worker"');
  expect(worker).toContain('"research_persistence_failed"');
});
