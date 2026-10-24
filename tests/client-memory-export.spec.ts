import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";

const savedEnv = { ...process.env };
const savedDateNow = Date.now;
test.afterEach(() => { process.env = { ...savedEnv }; Date.now = savedDateNow; });

function record(index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Memory ${index}`,
    content: `Approved content ${index}`,
    status: "active",
    created_at: new Date(savedDateNow() - 86_400_000).toISOString(),
  };
}

function exportRoute(data: {
  counts: number[];
  records?: ReturnType<typeof record>[];
  failPage?: number;
  authenticated?: boolean;
  retentionDays?: number;
  retentionAvailable?: boolean;
  expireDuringRead?: boolean;
  expectedRecordCount?: number;
}) {
  let reads = 0;
  let audits = 0;
  let countReads = 0;
  const records = data.records ?? [];
  const expectedRecordCount = data.expectedRecordCount ?? records.filter((item) =>
    Date.parse(item.created_at) > savedDateNow() - (data.retentionDays ?? 28) * 86_400_000).length;
  const route = loadReviewModule("src/app/api/client-runtime/memory-import/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/clientAuth": { currentClientUser: async () => data.authenticated === false ? null : { id: "member" }, currentClientMember: async () => true },
    "@/lib/clientDataPlane": {
      checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
      clientRpc: async (name: string, body: Record<string, unknown>) => {
        expect(name).toBe("client_tenant_retention_days");
        expect(body).toEqual({ p_tenant_slug: "tenant-a" });
        return { ok: data.retentionAvailable !== false, status: 200, value: data.retentionDays ?? 28 };
      },
      countClientRecords: async (table: string, filters: Record<string, string>) => {
        expect(table).toBe("client_runtime_records");
        expect(filters).toMatchObject({ tenant_slug: "eq.tenant-a", kind: "eq.memory" });
        expect(filters.and).toMatch(/^\(created_at\.gt\..+,created_at\.lte\..+\)$/);
        return { ok: true, count: data.counts[Math.min(countReads++, data.counts.length - 1)] };
      },
      selectClientRecords: async (table: string, filters: Record<string, string>) => {
        reads++;
        expect(table).toBe("client_runtime_records");
        expect(filters).toMatchObject({ tenant_slug: "eq.tenant-a", kind: "eq.memory", order: "id.asc", limit: "100" });
        expect(filters.and).toMatch(/^\(created_at\.gt\..+,created_at\.lte\..+\)$/);
        const cutoff = filters.and.match(/created_at\.gt\.([^,]+)/)?.[1];
        const snapshot = filters.and.match(/created_at\.lte\.([^,)]+)/)?.[1];
        if (!cutoff || !snapshot) throw new Error("retention_window_filter_missing");
        if (reads === data.failPage) return { ok: false, records: [] };
        if (data.expireDuringRead) Date.now = () => savedDateNow() + 2_000;
        return { ok: true, records: records.filter((item) => Date.parse(item.created_at) > Date.parse(cutoff)
          && Date.parse(item.created_at) <= Date.parse(snapshot) && (!filters.id || item.id > filters.id.slice(3))).slice(0, 100) };
      },
      recordClientAudit: async (event: string, metadata: Record<string, unknown>) => {
        expect(event).toBe("tenant.memory.exported");
        expect(metadata.recordCount).toBe(expectedRecordCount);
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

test("Markdown export applies the tenant active-retention window and fails closed if it cannot load policy", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const fresh = record(10);
  const expired = { ...record(11), created_at: new Date(savedDateNow() - 29 * 86_400_000).toISOString() };
  const fixture = exportRoute({ counts: [1, 1], records: [fresh, expired] });
  const response = await fixture.get();
  expect(response.status).toBe(200);
  const markdown = await response.text();
  expect(markdown).toContain("Approved content 10");
  expect(markdown).not.toContain("Approved content 11");

  const unavailable = exportRoute({ counts: [1], records: [fresh], retentionAvailable: false });
  expect((await unavailable.get()).status).toBe(503);
  expect(unavailable.stats()).toEqual({ reads: 0, audits: 0, countReads: 0 });
  const invalid = exportRoute({ counts: [1], records: [fresh], retentionDays: 29 });
  expect((await invalid.get()).status).toBe(503);
  expect(invalid.stats()).toEqual({ reads: 0, audits: 0, countReads: 0 });
});

test("Markdown export rejects records that cross active expiry while being assembled", async () => {
  process.env.CLIENT_SLUG = "tenant-a";
  const nearExpiry = { ...record(12), created_at: new Date(savedDateNow() - 28 * 86_400_000 + 1_000).toISOString() };
  const fixture = exportRoute({ counts: [1, 1], records: [nearExpiry], expireDuringRead: true });
  const response = await fixture.get();
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "memory_export_changed_retry" });
  expect(fixture.stats().audits).toBe(0);
});
