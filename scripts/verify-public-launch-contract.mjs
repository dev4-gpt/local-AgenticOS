#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const required = [
  ["product-experience/supabase-public-launch-control-plane.sql", "client_onboarding_accounts"],
  ["product-experience/supabase-public-launch-control-plane.sql", "client_credit_transactions"],
  ["product-experience/supabase-public-launch-control-plane.sql", "record_client_provider_connection"],
  ["product-experience/src/app/api/deployment-request/route.ts", "consent_required"],
  ["product-experience/src/app/api/onboarding/verify/route.ts", "token_invalid_or_expired"],
  ["product-experience/src/app/api/onboarding/setup/route.ts", "generate_link"],
  ["product-experience/src/app/api/billing/webhook/route.ts", "verifyStripeSignature"],
  ["product-experience/src/app/api/onboarding/approve/route.ts", "CONTROL_PLANE_OPERATOR_SECRET"],
  ["product-experience/src/app/api/support/route.ts", "secret_like_content"],
  ["src/app/api/client-runtime/credential-submissions/route.ts", "record_client_provider_connection"],
  ["src/app/api/client-runtime/credits/route.ts", "client_credit_account_snapshot"],
  ["workers/public-provisioner/worker.mjs", "gcp_scope_not_allowed"],
  ["workers/public-provisioner/worker.mjs", "secret_in_manifest"],
];
for (const [file, marker] of required) if (!read(file).includes(marker)) throw new Error(`Public launch contract missing ${marker} in ${file}`);
for (const file of ["product-experience/src/app/api/deployment-request/route.ts", "product-experience/src/app/api/support/route.ts", "product-experience/src/app/api/onboarding/setup/route.ts"]) {
  if (/console\.log\([^\n]*(secret|token|password|api.?key)/i.test(read(file))) throw new Error(`Possible secret logging in ${file}`);
}
console.log("Public Veloce launch contract passed.");
