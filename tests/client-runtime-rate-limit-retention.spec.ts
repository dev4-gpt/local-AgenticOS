import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "@playwright/test";

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$
      select '00000000-0000-4000-8000-000000000010'::uuid
    $$;
    create function extensions.digest(text, text) returns bytea language sql immutable as $$
      select convert_to($1, 'UTF8')
    $$;
    create function client_member(p_tenant_slug text) returns boolean language sql stable as $$
      select p_tenant_slug = 'tenant-a'
    $$;
    create table client_runtime_rate_limits (
      tenant_slug text not null,
      bucket text not null,
      key_hash text not null,
      window_started_at timestamptz not null default now(),
      request_count integer not null default 0 check (request_count >= 0),
      primary key (tenant_slug, bucket, key_hash)
    );
    insert into client_runtime_rate_limits(tenant_slug,bucket,key_hash,window_started_at,request_count) values
      ('tenant-a','oldest','hash-a',now()-interval '9 days',2),
      ('tenant-b','old-tenant','hash-b',now()-interval '9 days',1),
      ('tenant-a','recovery','hash-c',now()-interval '7 days',1),
      ('tenant-a','current','hash-d',now()-interval '20 minutes',1);
  `);
  const migration = readFileSync("product-experience/supabase-client-runtime-rate-limit-retention.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration);
  return db;
}

const purge = "select public.purge_expired_client_runtime_rate_limits($1, $2) as result";

test("rate-limit rows retain their actual window plus seven recovery days", async () => {
  const db = await database();
  try {
    const legacy = await db.query<{ bucket: string; window_seconds: number }>(
      "select bucket, window_seconds from client_runtime_rate_limits order by bucket",
    );
    expect(legacy.rows).toEqual([
      { bucket: "current", window_seconds: 3600 },
      { bucket: "old-tenant", window_seconds: 3600 },
      { bucket: "oldest", window_seconds: 3600 },
      { bucket: "recovery", window_seconds: 3600 },
    ]);
    const preview = await db.query<{ result: Record<string, unknown> }>(purge, [false, 1]);
    expect(preview.rows[0].result).toMatchObject({ candidates: 2, deleted: 0, remainingCandidates: 2, recoveryDays: 7, applied: false });
    const first = await db.query<{ result: Record<string, unknown> }>(purge, [true, 1]);
    expect(first.rows[0].result).toMatchObject({ candidates: 2, deleted: 1, remainingCandidates: 1, applied: true });
    expect((await db.query("select bucket from client_runtime_rate_limits order by bucket")).rows).toEqual([
      { bucket: "current" }, { bucket: "old-tenant" }, { bucket: "recovery" },
    ]);
  } finally {
    await db.close();
  }
});

test("runtime limiter records the active duration, preserves the stricter live window, and bounds inputs", async () => {
  const db = await database();
  try {
    await db.exec("set role authenticated");
    const call = `select public.consume_client_runtime_rate_limit($1,$2,$3,$4,$5) as allowed`;
    expect((await db.query<{ allowed: boolean }>(call, ["tenant-a", "short", "key-short", 2, 900])).rows[0].allowed).toBe(true);
    expect((await db.query<{ allowed: boolean }>(call, ["tenant-a", "short", "key-short", 2, 900])).rows[0].allowed).toBe(true);
    expect((await db.query<{ allowed: boolean }>(call, ["tenant-a", "short", "key-short", 2, 900])).rows[0].allowed).toBe(false);
    expect((await db.query<{ allowed: boolean }>(call, ["tenant-a", "long", "key-long", 10, 3600])).rows[0].allowed).toBe(true);
    expect((await db.query<{ allowed: boolean }>(call, ["tenant-a", "long", "key-long", 10, 900])).rows[0].allowed).toBe(true);
    await db.exec("reset role");
    const windows = await db.query<{ bucket: string; window_seconds: number; request_count: number }>(
      "select bucket, window_seconds, request_count from client_runtime_rate_limits where bucket in ('short','long') order by bucket",
    );
    expect(windows.rows).toEqual([
      { bucket: "long", window_seconds: 3600, request_count: 2 },
      { bucket: "short", window_seconds: 900, request_count: 3 },
    ]);
    expect((await db.query<{ allowed: boolean }>(call, ["tenant-a", "too-long", "key", 1, 3601])).rows[0].allowed).toBe(false);
    expect((await db.query<{ allowed: boolean }>(call, ["tenant-a", "null-window", "key", 1, null])).rows[0].allowed).toBe(false);
  } finally {
    await db.close();
  }
});

test("rate-limit purge is bounded and service-role only", async () => {
  const db = await database();
  try {
    const privileges = await db.query<{ anon: boolean; authenticated: boolean; operator: boolean }>(`
      select has_function_privilege('anon', 'public.purge_expired_client_runtime_rate_limits(boolean,integer)', 'EXECUTE') as anon,
        has_function_privilege('authenticated', 'public.purge_expired_client_runtime_rate_limits(boolean,integer)', 'EXECUTE') as authenticated,
        has_function_privilege('service_role', 'public.purge_expired_client_runtime_rate_limits(boolean,integer)', 'EXECUTE') as operator
    `);
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: false, operator: true });
    await expect(db.query(purge, [true, 1001])).rejects.toThrow(/runtime_rate_limit_retention_invalid_input/);
    await expect(db.query(purge, [null, 1])).rejects.toThrow(/runtime_rate_limit_retention_invalid_input/);
  } finally {
    await db.close();
  }
});
