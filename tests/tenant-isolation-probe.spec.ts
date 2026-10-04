import { expect, test } from "@playwright/test";
import { evaluateTenantProbe } from "../scripts/lib/tenant-isolation-probe.mjs";

const ok = (rows: Array<{ tenant_slug: string }>) => ({ ok: true, status: 200, rows });
const denied = { ok: false, status: 401, rows: [] };

test("two populated tenants with empty cross-reads pass the isolation probe", () => {
  expect(evaluateTenantProbe("records", "alpha", "beta", {
    aOwn: ok([{ tenant_slug: "alpha" }]), aOther: ok([]),
    bOwn: ok([{ tenant_slug: "beta" }]), bOther: ok([]),
  })).toEqual([]);
});

test("empty or mismatched own reads are inconclusive, not isolation evidence", () => {
  const failures = evaluateTenantProbe("records", "alpha", "beta", {
    aOwn: ok([]), aOther: ok([]),
    bOwn: ok([{ tenant_slug: "alpha" }]), bOther: ok([]),
  });
  expect(failures).toContain("records: tenant A own sentinel missing or mismatched - isolation inconclusive");
  expect(failures).toContain("records: tenant B own sentinel missing or mismatched - isolation inconclusive");
});

test("cross-tenant rows fail and expired cross-read tokens stay inconclusive", () => {
  const failures = evaluateTenantProbe("jobs", "alpha", "beta", {
    aOwn: ok([{ tenant_slug: "alpha" }]), aOther: ok([{ tenant_slug: "beta" }]),
    bOwn: ok([{ tenant_slug: "beta" }]), bOther: denied,
  });
  expect(failures).toContain("jobs: tenant A token crossed into tenant B");
  expect(failures).toContain("jobs: tenant B cross-read failed (401) - inconclusive, refresh the token and re-run");
});
