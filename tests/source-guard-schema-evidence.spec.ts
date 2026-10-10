import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  SOURCE_GUARD_BODY_MD5, SOURCE_GUARD_SCHEMA_QUERY,
  captureSourceGuardSchemaEvidence, validSourceGuardSchemaEvidence,
} from "../scripts/lib/source-guard-schema-evidence.mjs";

const projectRef = "ppmoqjtmjtfxadsnejqc";

test("hosted source guard query matches the tested migration and rejects legacy grants", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      alter default privileges in schema public grant execute on functions to service_role;
      create function public.import_client_runtime_source_pack(text,uuid,text,jsonb)
        returns jsonb language sql as $$ select null::jsonb $$;
      grant execute on function public.import_client_runtime_source_pack(text,uuid,text,jsonb)
        to authenticated, service_role;
    `);
    expect((await db.query(SOURCE_GUARD_SCHEMA_QUERY)).rows).toEqual([]);
    await db.exec(readFileSync("product-experience/supabase-client-runtime-source-pack-rpc-guard.sql", "utf8"));
    const rows = (await db.query<Record<string, unknown>>(SOURCE_GUARD_SCHEMA_QUERY)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].guard_body_md5).toBe(SOURCE_GUARD_BODY_MD5);
    const fetchImpl = async (url: string, options: { headers: Record<string, string>; body: string }) => {
      expect(url).toBe(`https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`);
      expect(options.headers.authorization).toBe("Bearer private-test-token");
      expect(JSON.parse(options.body).query).toBe(SOURCE_GUARD_SCHEMA_QUERY);
      return { status: 201, json: async () => rows };
    };
    const evidence = await captureSourceGuardSchemaEvidence({ projectRef, token: "private-test-token", fetchImpl });
    expect(evidence).toMatchObject({ passed: true, failures: [], guardBodyMd5: SOURCE_GUARD_BODY_MD5 });
    expect(JSON.stringify(evidence)).not.toContain("private-test-token");
    expect(validSourceGuardSchemaEvidence(evidence, evidence, projectRef, { requireCurrent: true })).toBe(true);
    expect(validSourceGuardSchemaEvidence(evidence, null, projectRef, { requireCurrent: true })).toBe(false);
    expect(validSourceGuardSchemaEvidence(evidence, evidence, "different-project-ref", { requireCurrent: true })).toBe(false);
    expect(validSourceGuardSchemaEvidence({ ...evidence, projectRef: undefined }, evidence, undefined)).toBe(false);

    const staleRows = [{ ...rows[0], guard_body_md5: "0".repeat(32) }];
    const stale = await captureSourceGuardSchemaEvidence({ projectRef, token: "private-test-token", fetchImpl: async () => ({ status: 201, json: async () => staleRows }) });
    expect(stale.failures).toContain("guard_body_mismatch");
    expect(validSourceGuardSchemaEvidence(evidence, stale, projectRef, { requireCurrent: true })).toBe(false);

    await db.exec("grant execute on function public.import_client_runtime_source_pack_legacy(text,uuid,text,jsonb) to service_role");
    const unsafeRows = (await db.query(SOURCE_GUARD_SCHEMA_QUERY)).rows;
    const unsafe = await captureSourceGuardSchemaEvidence({ projectRef, token: "private-test-token", fetchImpl: async () => ({ status: 201, json: async () => unsafeRows }) });
    expect(unsafe.failures).toContain("legacy_service_denied");
    expect(validSourceGuardSchemaEvidence(unsafe, unsafe, projectRef)).toBe(false);
  } finally {
    await db.close();
  }
});

test("source guard evidence fails closed without scoped access or a valid read-only result", async () => {
  const missing = await captureSourceGuardSchemaEvidence({ projectRef, token: "", fetchImpl: async () => { throw new Error("must not call"); } });
  expect(missing.failures).toContain("read_only_token_unavailable");
  const unavailable = await captureSourceGuardSchemaEvidence({ projectRef, token: "private-test-token", fetchImpl: async () => ({ status: 403 }) });
  expect(unavailable.failures).toEqual(["read_only_query_http_403"]);
  const empty = await captureSourceGuardSchemaEvidence({ projectRef, token: "private-test-token", fetchImpl: async () => ({ status: 201, json: async () => [] }) });
  expect(empty.failures).toEqual(["read_only_query_result_invalid"]);
});
