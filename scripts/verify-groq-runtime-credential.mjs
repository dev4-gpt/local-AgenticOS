#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

// Read-only credential validation. No prompt, generation, or token charge.
const project = "veloce-agenticos-2026";
const service = "veloce-cloud-test";
const region = "asia-south1";
function gcloud(args) {
  return execFileSync("gcloud", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
const runtime = JSON.parse(gcloud(["run", "services", "describe", service, "--project", project, "--region", region, "--format=json"]));
const env = runtime.spec.template.spec.containers[0].env;
const binding = env.find((entry) => entry.name === "GROQ_API_KEY")?.valueFrom?.secretKeyRef;
assert(binding?.name && binding?.key, "Groq secret binding missing");
const key = gcloud(["secrets", "versions", "access", binding.key, "--secret", binding.name, "--project", project]);
assert(key.length > 10, "Groq credential is empty");
const response = await fetch("https://api.groq.com/openai/v1/models", {
  headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  console.log(JSON.stringify({ ok: false, providerStatus: response.status, generationTested: false }));
  process.exit(1);
}
const models = await response.json();
const expectedModel = "openai/gpt-oss-120b";
const modelAvailable = Array.isArray(models.data) && models.data.some((model) => model.id === expectedModel);
console.log(JSON.stringify({ ok: modelAvailable, credentialAccepted: true, expectedModel, modelAvailable, generationTested: false }));
if (!modelAvailable) process.exit(1);

// Explicit activation is limited to this tenant's already-bound, validated key.
// Never overwrite an existing (especially revoked) connection.
if (process.argv.includes("--activate")) {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(base && serviceKey, "Operator database configuration required");
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const query = "/rest/v1/client_provider_connections?tenant_slug=eq.veloce-cloud-test&provider_key=eq.GROQ_API_KEY&select=id,status";
  const existing = await fetch(base + query, { headers });
  assert(existing.ok, "Connection lookup failed");
  const rows = await existing.json();
  assert(Array.isArray(rows) && rows.length === 0, "Connection already exists; review it rather than overwriting it");
  const tenant = await fetch(base + "/rest/v1/client_tenants?slug=eq.veloce-cloud-test&select=status", { headers });
  assert(tenant.ok && (await tenant.json())[0]?.status === "active", "Tenant must be active");
  const now = new Date().toISOString();
  const inserted = await fetch(base + "/rest/v1/client_provider_connections", {
    method: "POST", headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      tenant_slug: service, provider_key: "GROQ_API_KEY", catalog_id: "provider-groq_api_key",
      credential_mode: "byok", status: "connected", secret_resource: `projects/${project}/secrets/${binding.name}`,
      last_validated_at: now, updated_at: now,
      validation_metadata: { check: "authenticated-model-list", expectedModel, generationTested: false, validatedAt: now },
    }),
  });
  assert(inserted.ok, `Connection activation failed (${inserted.status})`);
  const created = await inserted.json();
  const readback = await fetch(base + query, { headers });
  assert(readback.ok, "Activation readback failed");
  const confirmed = await readback.json();
  assert(confirmed.length === 1 && confirmed[0].id === created[0].id && confirmed[0].status === "connected", "Activation not confirmed");
  console.log(JSON.stringify({ activated: true, tenant: service, provider: "GROQ_API_KEY", connectionId: confirmed[0].id, generationTested: false }));
}
