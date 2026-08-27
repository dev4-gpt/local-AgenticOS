import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("Vercel verifier checks names and types without retrieving values", () => {
  const verifier = readFileSync(resolve(process.cwd(), "scripts/verify-vercel-production-env.mjs"), "utf8");

  expect(verifier).toContain('"OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID", "OPENROUTER_MANAGED_PRICING_JSON"');
  expect(verifier).toContain('row.type === "sensitive"');
  expect(verifier).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  expect(verifier).toContain('["env", "ls", "production", "--json"');
  expect(verifier).not.toContain("env pull");
  expect(verifier).not.toContain("env get");
});
