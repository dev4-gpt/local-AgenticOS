import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";

// Real PostgreSQL (PGlite) tests for product-experience/supabase-client-adapter-background-owner.sql (QM-6c).
// Deployment ids are made up here; the table holds no tenant data.
const SQL = readFileSync("product-experience/supabase-client-adapter-background-owner.sql", "utf8");
const A = "release-a";
const B = "release-b";

async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  await db.exec(SQL);
  await db.exec(SQL); // safe to repeat
  return db;
}
const as = (db: PGlite, role: string) => db.exec(`reset role; set role ${role}`);
const mayRun = async (db: PGlite, id: string | null) => {
  await as(db, "service_role");
  return (await db.query<{ v: boolean | null }>("select public.client_adapter_background_owner_may_run($1) as v", [id])).rows[0].v;
};
const set = async (db: PGlite, expected: string | null, next: string | null, by = "operator@example.test") => {
  await as(db, "service_role");
  return (await db.query<{ v: boolean }>("select public.client_adapter_background_owner_set($1,$2,$3) as v", [expected, next, by])).rows[0].v;
};
const status = async (db: PGlite) => {
  await as(db, "service_role");
  return (await db.query<{ owner_deployment_id: string | null; set_by: string | null }>("select * from public.client_adapter_background_owner_status()")).rows[0];
};

test("a fresh database has no owner, so nobody may run background work", async () => {
  const db = await freshDb();
  try {
    expect((await status(db)).owner_deployment_id).toBeNull();
    for (const id of [A, B, "anything-else"]) expect(await mayRun(db, id)).toBe(false);
    expect(await mayRun(db, null)).toBe(false);
  } finally {
    await db.close();
  }
});

test("only the recorded owner may run, and handing over moves the right to exactly one deployment", async () => {
  const db = await freshDb();
  try {
    expect(await set(db, null, A)).toBe(true);
    expect(await mayRun(db, A)).toBe(true);
    expect(await mayRun(db, B)).toBe(false);
    expect(await set(db, A, B, "operator@example.test")).toBe(true);
    expect(await mayRun(db, A)).toBe(false); // the old owner stops at once
    expect(await mayRun(db, B)).toBe(true);
    expect(await status(db)).toMatchObject({ owner_deployment_id: B, set_by: "operator@example.test" });
    expect(await set(db, B, null)).toBe(true); // handing it to nobody
    expect(await mayRun(db, A)).toBe(false);
    expect(await mayRun(db, B)).toBe(false);
  } finally {
    await db.close();
  }
});

test("a stale writer cannot take over: the change is a compare-and-set and only one of two racing writers wins", async () => {
  const db = await freshDb();
  try {
    await set(db, null, A);
    // Two deployments both last saw owner A and both try to claim the record.
    expect(await set(db, A, B, "deployment-b")).toBe(true);
    expect(await set(db, A, "release-c", "deployment-c")).toBe(false);
    expect((await status(db)).owner_deployment_id).toBe(B);
    // A wrong expectation changes nothing, and neither does setting the owner to who it already is.
    expect(await set(db, "release-z", A)).toBe(false);
    expect(await set(db, B, B)).toBe(false);
    expect(await set(db, A, null)).toBe(false);
    expect((await status(db)).owner_deployment_id).toBe(B);
  } finally {
    await db.close();
  }
});

test("malformed ids and a missing or malformed name for who made the change are refused", async () => {
  const db = await freshDb();
  try {
    await as(db, "service_role");
    const bad: [string | null, string | null, string | null][] = [
      [null, "x", "operator"], [null, "has space", "operator"], [null, "a".repeat(129), "operator"], [null, "-leading-dash", "operator"],
      ["bad id", A, "operator"], [null, A, null], [null, A, ""], [null, A, "x".repeat(129)], [null, A, "bad;name"],
    ];
    for (const [expected, next, by] of bad) {
      await expect(db.query("select public.client_adapter_background_owner_set($1,$2,$3)", [expected, next, by]), JSON.stringify([expected, next, by])).rejects.toThrow(/adapter_background_owner_invalid_input/);
    }
    expect((await status(db)).owner_deployment_id).toBeNull();
    for (const id of ["x", "has space", "", "a".repeat(129)]) expect(await mayRun(db, id)).toBe(false);
  } finally {
    await db.close();
  }
});

test("re-applying the migration keeps the current owner", async () => {
  const db = await freshDb();
  try {
    await set(db, null, A);
    await db.exec("reset role");
    await db.exec(SQL);
    expect((await status(db)).owner_deployment_id).toBe(A);
  } finally {
    await db.close();
  }
});

test("only the service role can use it, only through the functions, and there is only ever one row", async () => {
  const db = await freshDb();
  try {
    for (const role of ["anon", "authenticated"]) {
      await as(db, role);
      for (const sql of [
        "select * from public.client_adapter_background_owner",
        "select public.client_adapter_background_owner_status()",
        "select public.client_adapter_background_owner_may_run('release-a')",
        "select public.client_adapter_background_owner_set(null,'release-a','operator')",
      ]) await expect(db.query(sql), `${role}: ${sql}`).rejects.toThrow(/permission denied/);
    }
    await as(db, "service_role");
    await expect(db.query("update public.client_adapter_background_owner set owner_deployment_id = 'release-a'")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.client_adapter_background_owner (singleton) values (true)")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    await expect(db.query("insert into public.client_adapter_background_owner (singleton) values (false)")).rejects.toThrow(/check constraint|violates/);
    await expect(db.query("insert into public.client_adapter_background_owner (singleton) values (true)")).rejects.toThrow(/duplicate key/);
    const grants = await db.query<{ grantee: string; routine_name: string }>(
      "select grantee, routine_name from information_schema.routine_privileges where routine_name like 'client_adapter_background_owner_%' and grantee in ('PUBLIC','anon','authenticated','service_role') order by routine_name, grantee",
    );
    expect(grants.rows.every((g) => g.grantee === "service_role")).toBe(true);
    expect(new Set(grants.rows.map((g) => g.routine_name)).size).toBe(3);
  } finally {
    await db.close();
  }
});

test("the retention command asks before it purges anything, and the new table is classified for the retention verifier", () => {
  const script = readFileSync("scripts/client-lifecycle.mjs", "utf8");
  const guard = script.indexOf("client_adapter_background_owner_may_run");
  expect(guard).toBeGreaterThan(-1);
  expect(script).toContain("--deployment-id");
  const firstPurge = script.indexOf("rpc/purge_expired_client_onboarding_tokens");
  expect(guard).toBeLessThan(firstPurge); // before the first purge
  const block = script.slice(guard, firstPurge);
  expect(block).toMatch(/skipped/);
  expect(block).toMatch(/process\.exit\(0\)/);
  const map = JSON.parse(readFileSync("docs/retention-table-map-2026-10-15.json", "utf8"));
  const classes = map.classes.filter((c: { tables: string[] }) => c.tables.includes("client_adapter_background_owner"));
  expect(classes.map((c: { id: string }) => c.id)).toEqual(["tenant-control-and-identity"]);
});

// Runs the real script against a stub that stands in for Supabase, so what the command does is observed, not guessed.
async function runRetention(ownerAnswer: { status: number; body: unknown }, deploymentId: string | null) {
  const paths: string[] = [];
  const stub = createServer((req, res) => {
    paths.push(String(req.url).replace("/rest/v1/", ""));
    const owner = String(req.url).endsWith("client_adapter_background_owner_may_run");
    res.writeHead(owner ? ownerAnswer.status : 500, { "content-type": "application/json" });
    res.end(JSON.stringify(owner ? ownerAnswer.body : { message: "stub: nothing else is implemented" }));
    req.resume();
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  const port = (stub.address() as AddressInfo).port;
  const child = spawn(process.execPath, ["scripts/client-lifecycle.mjs", "--mode", "retention", "--slug", "tenant-a", ...(deploymentId ? ["--deployment-id", deploymentId] : [])], {
    env: { PATH: process.env.PATH ?? "", SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_SERVICE_ROLE_KEY: "stub-key-for-this-test-only-0000000000" },
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.resume();
  const code: number = await new Promise((resolve) => child.on("close", (c) => resolve(c ?? -1)));
  await new Promise((resolve) => stub.close(resolve));
  return { code, stdout, paths };
}

test("a scheduled retention run that is not the background owner stops before touching anything, and the owner goes on", async () => {
  const notOwner = await runRetention({ status: 200, body: false }, "release-b");
  expect(notOwner.code).toBe(0);
  expect(JSON.parse(notOwner.stdout.trim())).toMatchObject({ skipped: true, deploymentId: "release-b" });
  expect(notOwner.paths).toEqual(["rpc/client_adapter_background_owner_may_run"]); // nothing was purged

  const owner = await runRetention({ status: 200, body: true }, "release-a");
  expect(owner.paths[0]).toBe("rpc/client_adapter_background_owner_may_run");
  expect(owner.paths).toContain("rpc/purge_expired_client_onboarding_tokens"); // it carried on (the stub then refuses it)

  const unanswered = await runRetention({ status: 500, body: { message: "down" } }, "release-a");
  expect(unanswered.code).toBe(1); // an unanswered check is a stop, not a yes
  expect(unanswered.paths).toEqual(["rpc/client_adapter_background_owner_may_run"]);

  const manual = await runRetention({ status: 200, body: false }, null); // a manual operator run names no deployment
  expect(manual.paths).not.toContain("rpc/client_adapter_background_owner_may_run");
  expect(manual.paths[0]).toBe("rpc/purge_expired_client_onboarding_tokens");

  const malformed = await runRetention({ status: 200, body: true }, "bad id!");
  expect(malformed.code).toBe(1);
  expect(malformed.paths).toEqual([]);
});
