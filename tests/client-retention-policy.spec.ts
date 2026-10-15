import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";

test("28-day policy caps configured tenant and existing content expiry while preserving shorter settings", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table client_tenants (slug text primary key, retention_days integer not null, updated_at timestamptz not null default now());
      insert into client_tenants (slug, retention_days) values ('tenant-a', 45), ('tenant-short', 14);
      create table client_runtime_artifacts (id integer primary key, created_at timestamptz not null, retention_expires_at timestamptz);
      insert into client_runtime_artifacts values
        (1, now() - interval '2 days', now() + interval '40 days'),
        (2, now() - interval '2 days', null);
      create table client_notebook_sources (id integer primary key, created_at timestamptz not null, retention_expires_at timestamptz);
      insert into client_notebook_sources values
        (1, now() - interval '2 days', now() + interval '40 days'),
        (2, now() - interval '2 days', null);
      create table client_learning_items (id integer primary key, tenant_slug text not null, created_at timestamptz not null, retention_expires_at timestamptz);
      insert into client_learning_items values
        (1, 'tenant-a', now() - interval '2 days', now() + interval '40 days'),
        (2, 'tenant-a', now() - interval '2 days', null);
      create table client_ecc_skill_revisions (id integer primary key, tenant_slug text not null, item_id integer not null, expires_at timestamptz);
      insert into client_ecc_skill_revisions values
        (1, 'tenant-a', 1, now() + interval '40 days'),
        (2, 'tenant-a', 2, null);
    `);
    const migration = readFileSync("product-experience/supabase-client-retention-policy-28.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);

    const tenants = await db.query<{ slug: string; retention_days: number }>("select slug, retention_days from client_tenants order by slug");
    expect(tenants.rows).toEqual([{ slug: "tenant-a", retention_days: 28 }, { slug: "tenant-short", retention_days: 14 }]);
    const artifact = await db.query<{ expiry: string }>("select retention_expires_at as expiry from client_runtime_artifacts order by id");
    const source = await db.query<{ expiry: string }>("select retention_expires_at as expiry from client_notebook_sources order by id");
    const learning = await db.query<{ expiry: string }>("select retention_expires_at as expiry from client_learning_items order by id");
    const revision = await db.query<{ expiry: string }>("select expires_at as expiry from client_ecc_skill_revisions order by id");
    for (const result of [artifact, source, learning, revision]) {
      expect(result.rows).toHaveLength(2);
      for (const row of result.rows) expect(Date.parse(row.expiry)).toBeLessThanOrEqual(Date.now() + 26 * 86_400_000);
    }
    const constraint = await db.query("select conname from pg_constraint where conname='client_tenants_retention_days_max_28'");
    expect(constraint.rows).toHaveLength(1);
  } finally {
    await db.close();
  }
});
