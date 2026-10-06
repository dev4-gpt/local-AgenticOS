import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("tenant deletion cannot cascade managed-credit history or nonzero balances", async () => {
  const db = new PGlite();
  const historyTables = [
    "client_credit_transactions",
    "client_credit_purchase_plans",
    "client_credit_purchase_plan_allocations",
    "client_credit_reservations",
    "client_credit_reservation_events",
    "client_credit_execution_claims",
  ];
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create table client_tenants(slug text primary key); insert into client_tenants values ('tenant-a'); grant delete on client_tenants to service_role; grant select(slug) on client_tenants to service_role;");
    for (const table of historyTables) {
      await db.exec(`create table ${table}(id serial primary key, tenant_slug text references client_tenants(slug) on delete cascade);`);
    }
    await db.exec(`
      create table client_credit_accounts(tenant_slug text primary key references client_tenants(slug) on delete cascade, balance_micros bigint, reserved_micros bigint);
      create table client_credit_budgets(tenant_slug text references client_tenants(slug) on delete cascade, purchased_micros bigint, reserved_micros bigint, spent_micros bigint);
    `);
    const migration = readFileSync("product-experience/supabase-v47-financial-offboard-guard.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    await expect(db.exec("truncate client_tenants cascade")).rejects.toThrow(/not an approved offboarding operation/);

    for (const table of historyTables) {
      await db.exec(`insert into ${table}(tenant_slug) values ('tenant-a')`);
      await expect(db.exec("delete from client_tenants where slug='tenant-a'")).rejects.toThrow(/managed-credit history or balance/);
      expect((await db.query(`select id from ${table} where tenant_slug='tenant-a'`)).rows).toHaveLength(1);
      await db.exec(`delete from ${table} where tenant_slug='tenant-a'`);
    }

    await db.exec("insert into client_credit_transactions(tenant_slug) values ('tenant-a'); set role service_role");
    await expect(db.exec("delete from client_tenants where slug='tenant-a'")).rejects.toThrow(/managed-credit history or balance/);
    await db.exec("reset role; delete from client_credit_transactions where tenant_slug='tenant-a'");

    await db.exec("insert into client_credit_accounts values ('tenant-a', 1, 0)");
    await expect(db.exec("delete from client_tenants where slug='tenant-a'")).rejects.toThrow(/managed-credit history or balance/);
    await db.exec("update client_credit_accounts set balance_micros=0, reserved_micros=1");
    await expect(db.exec("delete from client_tenants where slug='tenant-a'")).rejects.toThrow(/managed-credit history or balance/);
    await db.exec("update client_credit_accounts set reserved_micros=0");

    await db.exec("insert into client_credit_budgets values ('tenant-a', 1, 0, 0)");
    await expect(db.exec("delete from client_tenants where slug='tenant-a'")).rejects.toThrow(/managed-credit history or balance/);
    await db.exec("update client_credit_budgets set purchased_micros=0, reserved_micros=1");
    await expect(db.exec("delete from client_tenants where slug='tenant-a'")).rejects.toThrow(/managed-credit history or balance/);
    await db.exec("update client_credit_budgets set reserved_micros=0, spent_micros=1");
    await expect(db.exec("delete from client_tenants where slug='tenant-a'")).rejects.toThrow(/managed-credit history or balance/);
    await db.exec("update client_credit_budgets set spent_micros=0");

    await db.exec("delete from client_tenants where slug='tenant-a'");
    expect((await db.query("select slug from client_tenants")).rows).toHaveLength(0);
    expect((await db.query("select tenant_slug from client_credit_accounts")).rows).toHaveLength(0);
    expect((await db.query("select tenant_slug from client_credit_budgets")).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
});
