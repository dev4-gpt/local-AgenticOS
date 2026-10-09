import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { parseClientSourcePack } from "../src/lib/clientSourcePack";
import { clientRetentionSecondsRemaining } from "../src/lib/clientRetention";
import { loadReviewModule } from "./helpers/load-review-module";

const userId = "00000000-0000-4000-8000-000000000001";
const artifactId = "00000000-0000-4000-8000-000000000002";

function examplePack() {
  return {
    startUrl: "https://www.skool.com/example/about",
    skipped: [],
    sources: [
      { title: "About", url: "https://www.skool.com/example/about", text: "Welcome #intro", collectedAt: "2026-09-26T00:00:00Z", links: [{ url: "https://www.skool.com/example/classroom", text: "Classroom" }] },
      { title: "Lesson", url: "https://www.skool.com/example/classroom", text: "Transcript: A lesson", collectedAt: "2026-09-26T00:00:00Z", links: [{ url: "https://video.example.org/watch/1", text: "Media: Lesson playback" }] },
    ],
  };
}

test("source pack parser preserves pages and links, rejects unsafe or incomplete input", () => {
  const pack = parseClientSourcePack(examplePack());
  expect(pack.sources).toHaveLength(2);
  expect(pack.linkCount).toBe(2);
  expect(pack.sources[0].sourceImportKey).toMatch(/^[a-f0-9]{64}$/);
  expect(pack.sources[0].links[0].url).toBe("https://www.skool.com/example/classroom");
  const unsafe = examplePack();
  unsafe.sources[0].links[0].url = "javascript:alert(1)";
  expect(() => parseClientSourcePack(unsafe)).toThrow("source_pack_url_invalid");
  const signed = examplePack();
  signed.sources[0].links[0].url = "https://example.org/resource?access_token=private-value";
  expect(() => parseClientSourcePack(signed)).toThrow("source_pack_url_invalid");
  const signedSource = examplePack();
  signedSource.sources[0].url = "https://example.org/page?signature=private-value";
  expect(() => parseClientSourcePack(signedSource)).toThrow("source_pack_url_invalid");
  for (const signedUrl of [
    "https://storage.example.org/file?X-Amz-Signature=private-value",
    "https://storage.example.org/file?X-Goog-Credential=private-value",
    "https://storage.example.org/file?X-Goog-Signature=private-value",
    "https://storage.example.org/file?AWSAccessKeyId=private-value",
  ]) {
    const signedMedia = examplePack();
    signedMedia.sources[1].links[0].url = signedUrl;
    expect(() => parseClientSourcePack(signedMedia)).toThrow("source_pack_url_invalid");
  }
  const secretLabel = examplePack();
  secretLabel.sources[0].links[0].text = "api_key=sk-ABCDEFGHIJKLMNOPQRST";
  expect(() => parseClientSourcePack(secretLabel)).toThrow("source_pack_links_invalid");
  const oversized = examplePack();
  oversized.sources[0].text = "x".repeat(30_001);
  expect(() => parseClientSourcePack(oversized)).toThrow("source_pack_item_invalid");
  const invalidDate = examplePack();
  invalidDate.sources[0].collectedAt = "not-a-date";
  expect(() => parseClientSourcePack(invalidDate)).toThrow("source_pack_item_invalid");
  const duplicate = examplePack();
  duplicate.sources[1].url = duplicate.sources[0].url;
  expect(() => parseClientSourcePack(duplicate)).toThrow("source_pack_duplicate_source");
  const skipped = parseClientSourcePack({ ...examplePack(), skipped: [{ section: "Bonuses", label: "Missing target", reason: "invalid_url" }] });
  expect(skipped.skipped).toEqual(["Bonuses: Missing target (invalid_url)"]);
  expect(skipped.skippedCount).toBe(1);
  expect(() => parseClientSourcePack({ ...examplePack(), skipped: [{ label: "api_key=sk-ABCDEFGHIJKLMNOPQRST", reason: "invalid_url" }] })).toThrow("source_pack_skipped_invalid");
  expect(() => parseClientSourcePack({ ...examplePack(), skipped: Array(101).fill("missing") })).toThrow("source_pack_skipped_invalid");
});

test("source import commits only the exact artifact bytes reviewed with permission", async () => {
  const savedEnv = { ...process.env };
  const realFetch = globalThis.fetch;
  const original = Buffer.from(JSON.stringify(examplePack()));
  const changedPack = examplePack();
  changedPack.sources[1].text = "Transcript: B lesson";
  const changed = Buffer.from(JSON.stringify(changedPack));
  expect(changed.byteLength).toBe(original.byteLength);
  let stored = original;
  let writes = 0;
  let expiry: string | null = new Date(Date.now() + 60_000).toISOString();
  let downloads = 0;
  try {
    Object.assign(process.env, { CLIENT_SLUG: "tenant-a" });
    globalThis.fetch = async () => { downloads++; return new Response(new Uint8Array(stored)); };
    const route = loadReviewModule("src/app/api/client-runtime/source-import/route.ts", {
      "@/lib/clientAuth": { currentClientUser: async () => ({ id: userId }), currentClientMember: async () => true },
      "@/lib/clientDataPlane": {
        checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
        selectClientRecords: async () => ({ ok: true, records: [{ id: artifactId, tenant_slug: "tenant-a", created_by: userId, status: "ready", content_type: "application/json", original_name: "source-pack.json", byte_size: original.byteLength, object_key: "tenant-a/source-pack.json", retention_expires_at: expiry }] }),
        clientRpc: async () => { writes++; return { ok: true, value: { imported: 2, updated: 0, duplicates: 0 } }; },
        recordClientAudit: async () => undefined,
      },
      "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
      "@/lib/clientRetention": { clientRetentionSecondsRemaining },
      "@/lib/clientStorage": {
        clientStorageConfig: () => ({ namespace: "tenant-a", bucket: "test-bucket", serviceAccount: "test@example.invalid" }),
        safeClientObjectKey: (key: string) => key.startsWith("tenant-a/"),
        clientGcpAccessToken: async () => "test-token",
        clientServiceAccountEmail: async () => "test@example.invalid",
        signedClientStorageUrl: async () => "https://storage.example.invalid/source-pack.json",
      },
      "@/lib/clientSourcePack": { parseClientSourcePack },
    });
    const post = (body: Record<string, unknown>) => route.POST(new Request("https://tenant.example.invalid/api/client-runtime/source-import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ artifactId, ...body }) }));
    const preview = await post({ action: "preview" });
    expect(preview.status).toBe(200);
    const reviewed = await preview.json();
    expect(reviewed.packSha256).toBe(createHash("sha256").update(original).digest("hex"));
    expect(reviewed.skipped).toEqual([]);
    expect(reviewed.sources).toHaveLength(2);
    expect(reviewed.sources[0]).toMatchObject({ title: "About", url: "https://www.skool.com/example/about", text: "Welcome #intro", links: [{ url: "https://www.skool.com/example/classroom", text: "Classroom" }] });
    expect(reviewed.sources[1]).toMatchObject({ title: "Lesson", text: "Transcript: A lesson", links: [{ url: "https://video.example.org/watch/1", text: "Media: Lesson playback" }] });
    const withoutPermission = await post({ action: "import", previewSha256: reviewed.packSha256 });
    expect(withoutPermission.status).toBe(400);
    expect((await withoutPermission.json()).error).toBe("source_import_review_required");
    stored = changed;
    const changedResponse = await post({ action: "import", previewSha256: reviewed.packSha256, permissionConfirmed: true });
    expect(changedResponse.status).toBe(409);
    expect((await changedResponse.json()).error).toBe("source_import_preview_changed");
    expect(writes).toBe(0);
    stored = original;
    const imported = await post({ action: "import", previewSha256: reviewed.packSha256, permissionConfirmed: true });
    expect(imported.status).toBe(201);
    expect(writes).toBe(1);
    const priorDownloads = downloads;
    expiry = new Date(Date.now() - 1_000).toISOString();
    const expired = await post({ action: "import", previewSha256: reviewed.packSha256, permissionConfirmed: true });
    expect(expired.status).toBe(409);
    expect((await expired.json()).error).toBe("source_import_artifact_invalid");
    expect(downloads).toBe(priorDownloads);
    expect(writes).toBe(1);
  } finally {
    process.env = savedEnv;
    globalThis.fetch = realFetch;
  }
});

test("tenant memory search validates input and delegates pagination to the database", async () => {
  const priorSlug = process.env.CLIENT_SLUG;
  process.env.CLIENT_SLUG = "tenant-a";
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  try {
    const route = loadReviewModule("src/app/api/client-runtime/records/route.ts", {
      "@/lib/clientAuth": { currentClientUser: async () => ({ id: userId }), currentClientMember: async () => true },
      "@/lib/clientDataPlane": {
        checkClientRuntimeRateLimit: async () => ({ ok: true, allowed: true }),
        clientRpc: async (name: string, body: Record<string, unknown>) => {
          calls.push({ name, body });
          return { ok: true, value: { records: [{ id: "memory-125", title: "Archive memory 1" }], hasMore: false } };
        },
        selectClientRecords: async () => { throw new Error("search must not read one page of recent records"); },
      },
      "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
    });
    const get = (query: string) => route.GET(new Request(`https://tenant.example.invalid/api/client-runtime/records?kind=memory&${query}`));
    expect((await get("q=a")).status).toBe(400);
    expect((await get("q=archive&notebook=unfiled")).status).toBe(400);
    expect(calls).toHaveLength(0);
    const result = await get("q=archive&offset=100");
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ records: [{ title: "Archive memory 1" }], hasMore: false, nextOffset: 101 });
    expect(calls).toEqual([{ name: "search_client_runtime_memories", body: { p_tenant_slug: "tenant-a", p_query: "archive", p_offset: 100, p_limit: 50 } }]);
  } finally {
    if (priorSlug === undefined) delete process.env.CLIENT_SLUG; else process.env.CLIENT_SLUG = priorSlug;
  }
});

test("source pack SQL imports idempotently and builds tenant-scoped source/link graph", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table client_tenants (slug text primary key);
      create table client_memberships (tenant_slug text, user_id uuid, status text);
      create function client_member(p_tenant_slug text) returns boolean language sql as $$ select exists(select 1 from client_memberships where tenant_slug=p_tenant_slug and user_id=auth.uid() and status='active') $$;
      create table client_runtime_records (
        id uuid primary key default gen_random_uuid(), tenant_slug text not null references client_tenants(slug),
        created_by uuid not null, kind text not null, title text not null, content text not null,
        status text not null default 'active', metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create table client_runtime_artifacts (
        id uuid primary key, tenant_slug text not null, created_by uuid not null,
        status text not null, content_type text not null
      );
      create table client_runtime_audit_events (
        id bigint generated by default as identity primary key, tenant_slug text not null,
        actor_id uuid, event_type text not null, metadata jsonb not null default '{}'::jsonb
      );
      insert into client_tenants values ('tenant-a'), ('tenant-b');
      insert into client_memberships values ('tenant-a','${userId}','active');
      insert into client_runtime_artifacts values ('${artifactId}','tenant-a','${userId}','ready','application/json');
      select set_config('request.jwt.claim.sub','${userId}',false);
    `);
    await db.exec(readFileSync("product-experience/supabase-client-runtime-memory-graph.sql", "utf8"));
    const migration = readFileSync("product-experience/supabase-client-runtime-source-pack-graph.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const pack = parseClientSourcePack(examplePack());
    const sql = "select import_client_runtime_source_pack($1,$2,$3,$4::jsonb) as value";
    const args = ["tenant-a", artifactId, "a".repeat(64), JSON.stringify(pack.sources)];
    await expect(db.query(sql, ["tenant-a", artifactId, "a".repeat(64), JSON.stringify([pack.sources[0], pack.sources[0]])]))
      .rejects.toThrow(/source_pack_duplicate_source/);
    expect((await db.query("select id from client_runtime_records where tenant_slug='tenant-a'")).rows).toHaveLength(0);
    const first = await db.query<{ value: { imported: number; updated: number; duplicates: number } }>(sql, args);
    expect(first.rows[0].value).toEqual({ imported: 2, updated: 0, duplicates: 0, graphRefreshed: true });
    expect((await db.query<{ event_type: string; metadata: Record<string, unknown> }>("select event_type, metadata from client_runtime_audit_events")).rows).toEqual([{
      event_type: "tenant.source_pack.imported",
      metadata: { artifactId, packSha256: "a".repeat(64), sourceCount: 2, linkCount: 2, imported: 2, updated: 0, duplicates: 0 },
    }]);
    expect((await db.query("select id from client_runtime_memory_graph_nodes where tenant_slug='tenant-a' and kind='document'")).rows).toHaveLength(2);
    expect((await db.query<{ content: string; links: { url: string; text: string }[] }>("select content, metadata -> 'source_links' as links from client_runtime_records where title='Lesson'")).rows)
      .toEqual([{ content: "Transcript: A lesson", links: [{ url: "https://video.example.org/watch/1", text: "Media: Lesson playback" }] }]);
    expect((await db.query<{ url: string }>("select metadata ->> 'url' as url from client_runtime_memory_graph_nodes where tenant_slug='tenant-a' and kind='url' and metadata ->> 'url' = 'https://video.example.org/watch/1'")).rows)
      .toEqual([{ url: "https://video.example.org/watch/1" }]);
    const second = await db.query<{ value: { imported: number; duplicates: number } }>(sql, args);
    expect(second.rows[0].value).toEqual({ imported: 0, updated: 0, duplicates: 2, graphRefreshed: false });
    expect((await db.query("select id from client_runtime_audit_events")).rows).toHaveLength(2);
    const revised = examplePack();
    revised.sources[1].text = "A revised lesson #newtopic";
    revised.sources[1].links = [{ url: "https://example.org/new-resource", text: "New resource" }];
    const revisedPack = parseClientSourcePack(revised);
    const refreshed = await db.query<{ value: { imported: number; updated: number; duplicates: number } }>(sql, ["tenant-a", artifactId, "b".repeat(64), JSON.stringify(revisedPack.sources)]);
    expect(refreshed.rows[0].value).toEqual({ imported: 0, updated: 1, duplicates: 1, graphRefreshed: true });
    const revisedRecord = await db.query<{ content: string; links: { url: string; text: string }[] }>("select content, metadata -> 'source_links' as links from client_runtime_records where title='Lesson'");
    expect(revisedRecord.rows).toEqual([{ content: "A revised lesson #newtopic", links: [{ url: "https://example.org/new-resource", text: "New resource" }] }]);
    const nodes = await db.query<{ kind: string; url: string | null }>("select kind, metadata ->> 'url' as url from client_runtime_memory_graph_nodes where tenant_slug='tenant-a'");
    expect(nodes.rows.filter((row) => row.kind === "document")).toHaveLength(2);
    expect(nodes.rows.filter((row) => row.kind === "url").map((row) => row.url).sort()).toEqual([
      "https://example.org/new-resource", "https://www.skool.com/example/about", "https://www.skool.com/example/classroom",
    ]);
    const edges = await db.query<{ relation: string }>("select relation from client_runtime_memory_graph_edges where tenant_slug='tenant-a'");
    expect(edges.rows.filter((row) => row.relation === "source_at")).toHaveLength(2);
    expect(edges.rows.filter((row) => row.relation === "links_to")).toHaveLength(2);
    await db.exec("delete from client_runtime_records where tenant_slug='tenant-a' and title='Lesson'; select refresh_client_runtime_memory_graph('tenant-a')");
    const afterRemoval = await db.query<{ kind: string; url: string | null }>("select kind, metadata ->> 'url' as url from client_runtime_memory_graph_nodes where tenant_slug='tenant-a'");
    expect(afterRemoval.rows.filter((row) => row.kind === "document")).toHaveLength(1);
    expect(afterRemoval.rows.some((row) => row.url === "https://example.org/new-resource")).toBe(false);
    const restored = await db.query<{ value: { imported: number; updated: number; duplicates: number } }>(sql, ["tenant-a", artifactId, "b".repeat(64), JSON.stringify(revisedPack.sources)]);
    expect(restored.rows[0].value).toEqual({ imported: 1, updated: 0, duplicates: 1, graphRefreshed: true });
    await db.exec("select refresh_client_runtime_memory_graph('tenant-a')");
    const afterRestore = await db.query<{ kind: string; url: string | null }>("select kind, metadata ->> 'url' as url from client_runtime_memory_graph_nodes where tenant_slug='tenant-a'");
    expect(afterRestore.rows.filter((row) => row.kind === "document")).toHaveLength(2);
    expect(afterRestore.rows.some((row) => row.url === "https://example.org/new-resource")).toBe(true);
    await expect(db.query(sql, ["tenant-b", artifactId, "a".repeat(64), JSON.stringify(pack.sources)])).rejects.toThrow(/tenant_not_authorized/);
    expect((await db.query<{ value: boolean }>("select refresh_client_runtime_memory_graph('tenant-b') as value")).rows[0].value).toBe(false);
    await db.exec(`
      insert into client_runtime_records (tenant_slug, created_by, kind, title, content, created_at)
      select 'tenant-a', '${userId}', 'memory', 'Archive memory ' || n, 'Archived course text', now() + n * interval '1 minute'
      from generate_series(1, 125) as n;
    `);
    const searchSql = "select search_client_runtime_memories($1,$2,$3,$4) as value";
    const firstPage = await db.query<{ value: { records: Array<{ title: string }>; hasMore: boolean } }>(searchSql, ["tenant-a", "archive", 0, 50]);
    expect(firstPage.rows[0].value.records).toHaveLength(50);
    expect(firstPage.rows[0].value.hasMore).toBe(true);
    const lastPage = await db.query<{ value: { records: Array<{ title: string }>; hasMore: boolean } }>(searchSql, ["tenant-a", "archive", 100, 50]);
    expect(lastPage.rows[0].value.records).toHaveLength(25);
    expect(lastPage.rows[0].value.records.some((record) => record.title === "Archive memory 1")).toBe(true);
    expect(lastPage.rows[0].value.hasMore).toBe(false);
    const linkMatch = await db.query<{ value: { records: Array<{ title: string }> } }>(searchSql, ["tenant-a", "new-resource", 0, 50]);
    expect(linkMatch.rows[0].value.records.map((record) => record.title)).toEqual(["Lesson"]);
    await expect(db.query(searchSql, ["tenant-b", "archive", 0, 50])).rejects.toThrow(/tenant_not_authorized/);
    await expect(db.query(searchSql, ["tenant-a", "a", 0, 50])).rejects.toThrow(/memory_search_invalid/);
    await db.exec("delete from client_runtime_records where tenant_slug='tenant-a'; select refresh_client_runtime_memory_graph('tenant-a')");
    expect((await db.query("select id from client_runtime_memory_graph_nodes where tenant_slug='tenant-a'")).rows).toHaveLength(0);

    if (process.env.AGENTOS_SOURCE_PACK_FILE) {
      const bytes = readFileSync(process.env.AGENTOS_SOURCE_PACK_FILE);
      const realPack = parseClientSourcePack(JSON.parse(bytes.toString("utf8")));
      const realHash = createHash("sha256").update(bytes).digest("hex");
      const imported = await db.query<{ value: { imported: number; updated: number; duplicates: number } }>(sql, ["tenant-a", artifactId, realHash, JSON.stringify(realPack.sources)]);
      expect(imported.rows[0].value).toEqual({ imported: realPack.sources.length, updated: 0, duplicates: 0, graphRefreshed: true });
      const audit = await db.query<{ metadata: { sourceCount: number; linkCount: number; packSha256: string } }>("select metadata from client_runtime_audit_events order by id desc limit 1");
      expect(audit.rows[0].metadata).toMatchObject({ sourceCount: realPack.sources.length, linkCount: realPack.linkCount, packSha256: realHash });
      const stored = await db.query<{ source_key: string; content: string; links: { url: string; text: string }[] }>(
        "select metadata ->> 'source_import_key' as source_key, content, metadata -> 'source_links' as links from client_runtime_records where tenant_slug='tenant-a' and kind='memory'",
      );
      expect(stored.rows).toHaveLength(realPack.sources.length);
      for (const source of realPack.sources) {
        expect(stored.rows.find((row) => row.source_key === source.sourceImportKey)).toMatchObject({ content: source.text, links: source.links });
      }
      expect((await db.query<{ value: boolean }>("select refresh_client_runtime_memory_graph('tenant-a') as value")).rows[0].value).toBe(true);
      const graphUrls = (await db.query<{ url: string }>("select metadata ->> 'url' as url from client_runtime_memory_graph_nodes where tenant_slug='tenant-a' and kind='url'")).rows.map((row) => row.url).sort();
      const packUrls = [...new Set(realPack.sources.flatMap((source) => [source.sourceUrl, ...source.links.map((link) => link.url)]))].sort();
      expect(graphUrls).toEqual(packUrls);
      const repeated = await db.query<{ value: { imported: number; updated: number; duplicates: number } }>(sql, ["tenant-a", artifactId, realHash, JSON.stringify(realPack.sources)]);
      expect(repeated.rows[0].value).toEqual({ imported: 0, updated: 0, duplicates: realPack.sources.length, graphRefreshed: false });
      await expect(db.query(sql, ["tenant-b", artifactId, realHash, JSON.stringify(realPack.sources)])).rejects.toThrow(/tenant_not_authorized/);
      await db.exec("delete from client_runtime_records where tenant_slug='tenant-a'; select refresh_client_runtime_memory_graph('tenant-a')");
      expect((await db.query("select id from client_runtime_memory_graph_nodes where tenant_slug='tenant-a'")).rows).toHaveLength(0);
    }
    const largeStartUrl = "https://example.org/classroom";
    const largeSources = Array.from({ length: 205 }, (_, index) => ({
      title: `Synthetic lesson ${String(index + 1).padStart(3, "0")}`,
      url: `${largeStartUrl}/lesson-${index + 1}`,
      text: `Synthetic lesson ${index + 1} body with searchable marker ${index === 204 ? "lastlessonmarker" : "ordinarylessonmarker"}.`,
      links: [{ url: `${largeStartUrl}/resource-${index + 1}`, text: `Resource ${index + 1}` }],
    }));
    for (let offset = 0; offset < largeSources.length; offset += 100) {
      const batch = parseClientSourcePack({ startUrl: largeStartUrl, sources: largeSources.slice(offset, offset + 100) });
      const imported = await db.query<{ value: { imported: number; updated: number; duplicates: number; graphRefreshed: boolean } }>(
        sql, ["tenant-a", artifactId, createHash("sha256").update(JSON.stringify(batch.sources)).digest("hex"), JSON.stringify(batch.sources)],
      );
      expect(imported.rows[0].value).toEqual({ imported: batch.sources.length, updated: 0, duplicates: 0, graphRefreshed: true });
    }
    expect((await db.query("select id from client_runtime_records where tenant_slug='tenant-a' and kind='memory'")).rows).toHaveLength(205);
    const largeGraph = await db.query<{ kind: string; url: string | null }>(
      "select kind, metadata ->> 'url' as url from client_runtime_memory_graph_nodes where tenant_slug='tenant-a'",
    );
    expect(largeGraph.rows.filter((row) => row.kind === "document")).toHaveLength(205);
    expect(largeGraph.rows.filter((row) => row.kind === "url").map((row) => row.url).sort()).toEqual(
      largeSources.flatMap((source) => [source.url, source.links[0].url]).sort(),
    );
    const lastLesson = await db.query<{ value: { records: Array<{ title: string }> } }>(searchSql, ["tenant-a", "lastlessonmarker", 0, 50]);
    expect(lastLesson.rows[0].value.records.map((row) => row.title)).toEqual(["Synthetic lesson 205"]);
    await db.exec("delete from client_runtime_records where tenant_slug='tenant-a'; select refresh_client_runtime_memory_graph('tenant-a')");
    expect((await db.query("select id from client_runtime_memory_graph_nodes where tenant_slug='tenant-a'")).rows).toHaveLength(0);
    await db.exec(`
      create function reject_source_import_audit() returns trigger language plpgsql as $$ begin raise exception 'source_audit_failed'; end $$;
      create trigger source_import_audit_failure before insert on client_runtime_audit_events
        for each row execute function reject_source_import_audit();
    `);
    const auditFailurePack = parseClientSourcePack({ startUrl: "https://example.org/audit-fail", sources: [{ title: "Audit must roll back", url: "https://example.org/audit-fail", text: "Never committed", links: [] }] });
    await expect(db.query(sql, ["tenant-a", artifactId, "d".repeat(64), JSON.stringify(auditFailurePack.sources)])).rejects.toThrow(/source_audit_failed/);
    expect((await db.query("select id from client_runtime_records where tenant_slug='tenant-a' and title='Audit must roll back'")).rows).toHaveLength(0);
    await db.exec("drop trigger source_import_audit_failure on client_runtime_audit_events; drop function reject_source_import_audit()");
    await db.exec("create or replace function refresh_client_runtime_memory_graph(p_tenant_slug text) returns boolean language sql as $$ select false $$");
    const failedPack = parseClientSourcePack({ startUrl: "https://example.org/new", sources: [{ title: "Must roll back", url: "https://example.org/new", text: "Never committed", links: [] }] });
    await expect(db.query(sql, ["tenant-a", artifactId, "c".repeat(64), JSON.stringify(failedPack.sources)])).rejects.toThrow(/source_graph_refresh_failed/);
    expect((await db.query("select id from client_runtime_records where tenant_slug='tenant-a' and title='Must roll back'")).rows).toHaveLength(0);
  } finally { await db.close(); }
});
