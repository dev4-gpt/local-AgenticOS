import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

test("paid OpenRouter canary is one-cent bounded, health-gated, and disposable", () => {
  const sql = readFileSync(resolve(root, "product-experience/supabase-v34-managed-openrouter-paid-canary.sql"), "utf8");
  expect(sql).toContain("managed-openrouter-paid-20260831");
  expect(sql).toContain("10000");
  expect(sql).toContain("openai/gpt-4o-mini");
  expect(sql).toContain("managed_route_enabled");
  expect(sql).toContain("'not_checked'");
  expect(sql).toContain("'validating'");
  expect(sql).toContain("'matched'");
  expect(sql).toContain("external_charge', false");
  expect(sql).toContain("paid_execution_preflight_ready");
  expect(sql).toContain("max_spend_is_one_cent");
  expect(sql).toContain("interval '168 hours'");
  expect(sql).not.toMatch(/sk-or-v1-/);
});

test("paid OpenRouter canary cleanup is exact and retains only shared pricing evidence", () => {
  const cleanup = readFileSync(resolve(root, "product-experience/supabase-v34-managed-openrouter-paid-canary-cleanup.sql"), "utf8");
  expect(cleanup).toContain("delete from public.client_tenants");
  expect(cleanup).toContain("managed-openrouter-paid-20260831");
  expect(cleanup).toContain("claims_removed");
  expect(cleanup).toContain("shared_pricing_snapshot_retained");
  expect(cleanup).not.toContain("delete from public.client_pricing_snapshots");
});
