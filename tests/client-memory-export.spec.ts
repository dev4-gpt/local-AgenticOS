import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

const savedEnv = { ...process.env };
test.afterEach(() => { process.env = { ...savedEnv }; });

function record(index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Memory ${index}`,
    content: `Approved content ${index}`,
    status: "active",
    created_at: "2026-09-01T00:00:00Z",
  };
}

function exportRoute(data: {
  counts: number[];
  records?: ReturnType<typeof record>[];
  failPage?: number;
  authenticated?: boolean;
}) {
  let reads = 0;
  let audits = 0;
  let countReads = 0;
  const records = data.records ?? [];
  const route = loadReviewModule("src/app/api/client-runtime/memory-import/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => data.authenticated === false ? null : { id: "member" }, currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      countClientRecords: async (table: string, filters: Record<string, string>) => {
        expect(table).toBe("client_runtime_records");
        expect(filters).toMatchObject({ tenant_slug: "eq.tenant-a", kind: "eq.memory" });
        expect(filters.created_at).toMatch(/^lte\./);
        return { ok: true, count: data.counts[Math.min(countReads++, data.counts.length - 1)] };
      },
      selectClientRecords: async (table: string, filters: Record<string, string>) => {
        reads++;
        expect(table).toBe("client_runtime_records");
        expect(filters).toMatchObject({ tenant_slug: "eq.tenant-a", kind: "eq.memory", order: "id.asc", limit: "100" });
        expect(filters.created_at).toMatch(/^lte\./);
        if (reads === data.failPage) return { ok: false, records: [] };
        return { ok: true, records: records.filter((item) => !filters.id || item.id > filters.id.slice(3)).slice(0, 100) };
      },
      recordClientAudit: async (event: string, metadata: Record<string, unknown>) => {
        expect(event).toBe("tenant.memory.exported");
        expect(metadata.recordCount).toBe(records.length);
        audits++;
      },
      insertClientRecord: async () => ({ ok: true }),
    },
    "@/lib/clientInputSafety": {},
    "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
    "@/lib/clientStorage": { safeClientFileName: (name: string) => name },
  });
  return { get: () => route.GET(new Request("https://tenant.invalid/api/client-runtime/memory-import?format=markdown")), stats: () => ({ reads, audits, countReads }) };
}

test("Markdown export includes every tenant memory beyond the old 100-row cap", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const records = Array.from({ length: 205 }, (_, index) => record(index + 1));
  const fixture = exportRoute({ counts: [205, 205], records });
  const response = await fixture.get();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain("tenant-a-memory.md");
  const markdown = await response.text();
  expect(markdown).toContain("Records: 205");
  expect(markdown.match(/^## Memory /gm)).toHaveLength(205);
  expect(markdown).toContain("Approved content 205");
  expect(fixture.stats()).toEqual({ reads: 3, audits: 1, countReads: 2 });
});

test("Markdown export fails rather than returning a partial archive", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const records = Array.from({ length: 205 }, (_, index) => record(index + 1));
  const failed = exportRoute({ counts: [205], records, failPage: 2 });
  const failedResponse = await failed.get();
  expect(failedResponse.status).toBe(502);
  expect(await failedResponse.json()).toMatchObject({ error: "memory_export_read_failed" });
  expect(failed.stats().audits).toBe(0);

  const changed = exportRoute({ counts: [1, 2], records: [record(1)] });
  const changedResponse = await changed.get();
  expect(changedResponse.status).toBe(409);
  expect(await changedResponse.json()).toMatchObject({ error: "memory_export_changed_retry" });
  expect(changed.stats().audits).toBe(0);
});

test("Markdown export rejects oversized or unauthenticated requests before reading rows", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const oversized = exportRoute({ counts: [1001] });
  const response = await oversized.get();
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ error: "memory_export_too_large" });
  expect(oversized.stats().reads).toBe(0);

  const unauthorized = exportRoute({ counts: [1], authenticated: false });
  expect((await unauthorized.get()).status).toBe(401);
  expect(unauthorized.stats().countReads).toBe(0);
});
