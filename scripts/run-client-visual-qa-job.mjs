import process from "node:process";

const metadataRoot = "http://metadata.google.internal/computeMetadata/v1";
const jobId = process.env.CLIENT_RUNTIME_JOB_ID?.trim();
const tenantSlug = process.env.CLIENT_RUNTIME_JOB_TENANT?.trim();
const baseUrl = process.env.CLIENT_RUNTIME_BASE_URL?.trim().replace(/\/$/, "");

if (!jobId || !tenantSlug || !baseUrl || !/^[0-9a-f-]{36}$/i.test(jobId) || !/^https:\/\//.test(baseUrl)) {
  console.error("visual_qa_job_configuration_invalid");
  process.exit(2);
}

const identity = await fetch(`${metadataRoot}/instance/service-accounts/default/identity?audience=${encodeURIComponent(baseUrl)}`, {
  headers: { "Metadata-Flavor": "Google" },
}).catch(() => null);
const token = identity?.ok ? await identity.text() : "";
if (!token) {
  console.error("visual_qa_job_identity_unavailable");
  process.exit(3);
}

const response = await fetch(`${baseUrl}/api/internal/client-runtime/jobs`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ jobId, tenantSlug }),
}).catch(() => null);
if (!response?.ok) {
  console.error(`visual_qa_job_worker_failed:${response?.status ?? 0}`);
  process.exit(4);
}
