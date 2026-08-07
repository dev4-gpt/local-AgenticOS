const METADATA_ROOT = "http://metadata.google.internal/computeMetadata/v1";

export function clientWorkspaceJobConfigured() {
  return process.env.CLIENT_EXECUTION_BACKEND === "cloud-run-job"
    && Boolean(process.env.CLIENT_WORKSPACE_RUN_JOB?.trim())
    && Boolean(process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCLOUD_PROJECT?.trim())
    && Boolean(process.env.CLIENT_RUNTIME_TASK_REGION?.trim());
}

export async function executeClientWorkspaceJob(input: { jobId: string; tenantSlug: string }) {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCLOUD_PROJECT?.trim();
  const region = process.env.CLIENT_RUNTIME_TASK_REGION?.trim();
  const jobName = process.env.CLIENT_WORKSPACE_RUN_JOB?.trim();
  if (!project || !region || !jobName || !clientWorkspaceJobConfigured()) return { ok: false, status: 503, error: "workspace_job_not_configured" };
  const token = await metadataAccessToken();
  if (!token) return { ok: false, status: 503, error: "gcp_identity_unavailable" };
  const response = await fetch(`https://run.googleapis.com/v2/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/jobs/${encodeURIComponent(jobName)}:run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      overrides: {
        containerOverrides: [{
          name: "workspace-runner",
          env: [
            { name: "CLIENT_RUNTIME_JOB_ID", value: input.jobId },
            { name: "CLIENT_RUNTIME_JOB_TENANT", value: input.tenantSlug },
          ],
        }],
      },
    }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return { ok: false, status: response?.status ?? 502, error: "workspace_job_start_failed" };
  return { ok: true, status: 202, error: null };
}

async function metadataAccessToken() {
  const response = await fetch(`${METADATA_ROOT}/instance/service-accounts/default/token`, {
    headers: { "Metadata-Flavor": "Google" },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const value = await response.json().catch(() => null) as { access_token?: unknown } | null;
  return typeof value?.access_token === "string" ? value.access_token : null;
}
