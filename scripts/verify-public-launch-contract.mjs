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
  ["product-experience/src/app/api/deployment-request/route.ts", "recommendCommercialScope"],
  ["product-experience/src/app/api/deployment-request/route.ts", "TURNSTILE_SECRET_KEY"],
  ["product-experience/src/components/editions/StartIntakeForm.tsx", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
  ["product-experience/src/components/editions/StartIntakeForm.tsx", "challenges.cloudflare.com/turnstile"],
  ["product-experience/src/components/editions/StartIntakeForm.tsx", "captchaToken"],
  ["product-experience/src/app/api/onboarding/scope/approve/route.ts", "commercial_scope_status"],
  ["product-experience/src/app/api/onboarding/approve/route.ts", "applyCommercialScopeToManifest"],
  ["product-experience/supabase-commercial-scope.sql", "commercial_scope_recommendation"],
  ["product-experience/src/app/api/onboarding/verify/route.ts", "token_invalid_or_expired"],
  ["product-experience/src/app/api/onboarding/setup/route.ts", "generate_link"],
  ["product-experience/src/app/api/billing/webhook/route.ts", "verifyStripeSignature"],
  ["product-experience/src/app/api/onboarding/approve/route.ts", "CONTROL_PLANE_OPERATOR_SECRET"],
  ["product-experience/src/app/api/support/route.ts", "secret_like_content"],
  ["product-experience/src/app/api/support/route.ts", "managed_provider_access"],
  ["product-experience/src/app/api/support/route.ts", "requestedBudgetMicros"],
  ["product-experience/src/app/api/support/route.ts", "notifyLead"],
  ["product-experience/src/app/api/support/route.ts", "teamNotification"],
  ["product-experience/src/app/api/internal/managed-provider/openrouter/route.ts", "managed_route_enabled"],
  ["product-experience/src/app/api/internal/managed-provider/openrouter/route.ts", "managed_provider_disable_persist_failed"],
  ["product-experience/src/app/api/internal/managed-provider/openrouter/route.ts", "restore_requires_health_check"],
  ["product-experience/src/components/SupportForm.tsx", "managed_provider_access"],
  ["src/app/api/client-runtime/credential-submissions/route.ts", "record_client_provider_connection"],
  ["src/app/api/client-runtime/credits/route.ts", "client_credit_account_snapshot"],
  ["workers/public-provisioner/worker.mjs", "gcp_scope_not_allowed"],
  ["workers/public-provisioner/worker.mjs", "secret_in_manifest"],
  ["workers/public-provisioner/worker.mjs", "GCP_PROVISIONER_AUDIENCE"],
  ["workers/public-provisioner/worker.mjs", "X-Control-Plane-Worker-Token"],
  ["workers/public-provisioner/worker.mjs", "cloudtasks.googleapis.com"],
  ["workers/public-provisioner/worker.mjs", "GCP_PROVISIONER_TASK_QUEUE"],
  ["workers/public-provisioner/worker.mjs", "alreadyQueued"],
  ["workers/gcp-provisioner/worker.mjs", "gcp_apply_disabled"],
  ["workers/gcp-provisioner/worker.mjs", "control_plane_callback_not_configured"],
  ["workers/gcp-provisioner/worker.mjs", "Both script phases mutate project resources"],
  ["workers/gcp-provisioner/worker.mjs", "artifact_repository_not_allowed"],
  ["workers/managed-openrouter/worker.mjs", "managed_provider_request_not_allowed"],
  ["workers/managed-openrouter/worker.mjs", "managed_video_generation_disabled"],
  ["product-experience/src/app/api/internal/managed-provider/openrouter/route.ts", "OPENROUTER_MANAGED_GATEWAY_URL"],
  ["product-experience/src/app/api/internal/managed-provider/openrouter/route.ts", "videoModels"],
  ["product-experience/src/app/api/internal/managed-provider/openrouter/route.ts", "managed_video_job_invalid"],
  ["product-experience/src/lib/cloudRunOidc.ts", "x-vercel-oidc-token"],
  ["product-experience/src/app/api/onboarding/approve/route.ts", "cloudRunIdTokenFromVercel"],
];
for (const [file, marker] of required) if (!read(file).includes(marker)) throw new Error(`Public launch contract missing ${marker} in ${file}`);
for (const file of ["product-experience/src/app/api/deployment-request/route.ts", "product-experience/src/app/api/support/route.ts", "product-experience/src/app/api/onboarding/setup/route.ts"]) {
  if (/console\.log\([^\n]*(secret|token|password|api.?key)/i.test(read(file))) throw new Error(`Possible secret logging in ${file}`);
}
console.log("Public Veloce launch contract passed.");
