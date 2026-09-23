import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("selected notebook is sent when saving a library note", () => {
  const source = readFileSync("src/components/ClientDataWorkspace.tsx", "utf8");
  expect(source).toMatch(/body: JSON\.stringify\(\{ kind: copy\.kind, title, content, notebookId:/);
});

test("record creation verifies notebook membership in the current tenant", () => {
  const source = readFileSync("src/app/api/client-runtime/records/route.ts", "utf8");
  expect(source).toContain('selectClientRecords("client_notebooks"');
  expect(source).toContain('tenant_slug: `eq.${tenantSlug}`');
  expect(source).toContain('status: "eq.active"');
});
