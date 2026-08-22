#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const checks = [
  ["src/app/api/deployment-request/route.ts", "allowPublicRequest"],
  ["src/app/api/lead/route.ts", "allowPublicRequest"],
  ["supabase-public-request-hardening.sql", "consume_public_request_rate_limit"],
  ["next.config.ts", "X-Content-Type-Options"],
  ["src/app/provider-catalog/page.tsx", "PublicBetaCatalog"],
  ["src/app/credits/page.tsx", "Platform setup"],
  ["src/app/api/billing/webhook/route.ts", "verifyStripeSignature"],
  ["src/app/api/onboarding/verify/route.ts", "token_invalid_or_expired"],
  ["src/app/api/support/route.ts", "secret_like_content"],
  ["src/data/publicBetaCatalog.ts", "Ponytail"],
];

for (const [file, marker] of checks) {
  const contents = read(file);
  if (!contents.includes(marker)) throw new Error(`Release gate missing ${marker} in ${file}`);
}

for (const file of ["src/app/api/deployment-request/route.ts", "src/app/api/lead/route.ts"]) {
  if (/error:\s*["'](?:store_failed|store_unreachable)["'][^\n]*detail/.test(read(file))) {
    throw new Error(`Public route still returns backend details: ${file}`);
  }
}

console.log("Public intake release gates passed.");
