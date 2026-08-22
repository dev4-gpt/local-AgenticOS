#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const catalog = read("src/lib/publicProviderCatalog.ts");
const middleware = read("src/middleware.ts");
const policy = read("src/lib/clientRuntimePolicy.ts");
const activation = read("src/lib/clientActivationManifest.ts");
const provisioner = read("scripts/provision-gcp-client.mjs");
const intake = read("product-experience/src/app/api/deployment-request/route.ts");
const productCatalog = read("product-experience/src/data/publicBetaCatalog.ts");
const productStart = read("product-experience/src/app/start/page.tsx");
const runbook = read("docs/public-beta-runbook.md");

function expect(condition, message) {
  if (!condition) {
    console.error(`Public beta contract failed: ${message}`);
    process.exit(1);
  }
}

for (const label of ["available-now", "client-key", "review-required", "isolated-worker", "operator-only", "reference-only"]) {
  expect(catalog.includes(`"${label}"`), `catalog must retain ${label}`);
}
for (const required of ["Ponytail restraint guard", "Research to delivery", "secretEnv", "providerCallsEnabled: false", "evidenceRequired"]) {
  expect(catalog.includes(required) || activation.includes(required), `catalog/activation contract must contain ${required}`);
}
expect(middleware.includes('pathname === "/provider-catalog"') && middleware.includes('pathname === "/credits"'), "public pages must bypass client auth middleware");
expect(policy.includes('"/provider-catalog"') && policy.includes('"/credits"'), "public pages must be allowed by the client route policy");
expect(provisioner.includes("/provider-catalog,/credits"), "client provisioning must preserve public catalog and credits routes");
expect(intake.includes('status: "pending_approval"') && intake.includes("requestId"), "public intake must persist and confirm a review request");
for (const required of ["Ponytail restraint guard", "Brave Search", "Jina Reader", "OpenSEO", "OpenReply / Infobip", "Strix / PentAGI / HexStrike"]) {
  expect(productCatalog.includes(required), `public product catalog must include ${required}`);
}
for (const required of ["Available now", "Available with client key", "Review required", "Isolated worker", "Operator only", "Reference only"]) {
  expect(productCatalog.includes(required), `public product catalog must include ${required} status ${required}`);
}
expect(productStart.includes('href="/provider-catalog"') && productStart.includes('href="/credits"'), "public intake must link to the catalog and credits policy");
expect(runbook.includes("citation") && runbook.includes("deletion-lineage") && runbook.includes("rollback"), "runbook must define the evidence gate");
console.log("Public beta contract verification passed.");
