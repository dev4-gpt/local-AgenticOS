import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const canaryPath = resolve(process.cwd(), "product-experience/supabase-v34-managed-openrouter-health-canary.sql");
const cleanupPath = resolve(process.cwd(), "product-experience/supabase-v34-managed-openrouter-health-canary-cleanup.sql");

test("managed OpenRouter health canary remains zero-spend and execution-disabled", () => {
  const sql = readFileSync(canaryPath, "utf8");

  expect(sql).toContain("'managed-openrouter-hc-20260831'");
  expect(sql).toContain("'provider-openrouter_api_key'");
  expect(sql).toContain("'OPENROUTER_API_KEY'");
  expect(sql).toContain("'projects/veloce-agenticos-2026/secrets/openrouter-managed-api-key/versions/latest'");
  expect(sql).toContain("'provider_not_enabled'");
  expect(sql).toContain("'pending'");
  expect(sql).toContain("'not_checked'");
  expect(sql).toContain("'validating'");
  expect(sql).toContain("(not f.managed_route_enabled)");
  expect(sql).toContain("and f.purchased_micros = 0");
  expect(sql).toContain("and f.reserved_micros = 0");
  expect(sql).toContain("and f.spent_micros = 0");
  expect(sql).toContain("as execution_blocked");
  expect(sql).not.toContain("managed_route_enabled = true");
});

test("managed OpenRouter health canary cleanup is exact and isolated", () => {
  const sql = readFileSync(cleanupPath, "utf8");

  expect(sql).toContain("delete from public.client_tenants");
  expect(sql).toContain("slug = 'managed-openrouter-hc-20260831'");
  expect(sql).toContain("fixture_removed");
  expect(sql).not.toContain("dofgfood");
});
