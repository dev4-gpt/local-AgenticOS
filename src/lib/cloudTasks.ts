import { Buffer } from "node:buffer";

const METADATA_ROOT = "http://metadata.google.internal/computeMetadata/v1";

export async function enqueueClientRuntimeTask(input: { jobId?: string; actionId?: string; tenantSlug: string; delaySeconds?: number; path?: "jobs" | "delivery" }) {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCLOUD_PROJECT?.trim();
  const region = process.env.CLIENT_RUNTIME_TASK_REGION?.trim();
  const queue = process.env.CLIENT_RUNTIME_TASK_QUEUE?.trim();
  const baseUrl = process.env.CLIENT_RUNTIME_BASE_URL?.trim().replace(/\/$/, "");
  const serviceAccount = (process.env.CLIENT_TASK_INVOKER_SERVICE_ACCOUNT || process.env.CLIENT_RUNTIME_SERVICE_ACCOUNT)?.trim();
  if (!project || !region || !queue || !baseUrl || !serviceAccount) return { ok: false, status: 503, error: "task_runtime_not_configured" };

  let parsedBase: URL;
  try { parsedBase = new URL(baseUrl); } catch { return { ok: false, status: 503, error: "task_base_url_invalid" }; }
  if (process.env.VELOCE_CLIENT_EDITION === "1" && (parsedBase.protocol !== "https:" || /localhost|127\.0\.0\.1/.test(parsedBase.hostname))) {
    return { ok: false, status: 503, error: "task_base_url_not_public" };
  }

  const token = await metadataAccessToken();
  if (!token) return { ok: false, status: 503, error: "gcp_identity_unavailable" };
  const identifier = input.jobId || input.actionId;
  if (!identifier) return { ok: false, status: 400, error: "task_identifier_missing" };
  const taskPath = input.path === "delivery" ? "delivery" : "jobs";
  const taskUrl = `${baseUrl}/api/internal/client-runtime/${taskPath}`;
  const taskName = `projects/${project}/locations/${region}/queues/${queue}/tasks/${identifier}`;
  const payload = { tenantSlug: input.tenantSlug, ...(input.jobId ? { jobId: input.jobId } : {}), ...(input.actionId ? { actionId: input.actionId } : {}) };
  const response = await fetch(`https://cloudtasks.googleapis.com/v2/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(region)}/queues/${encodeURIComponent(queue)}/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      task: {
        name: taskName,
        ...(input.delaySeconds && input.delaySeconds > 0 ? { scheduleTime: new Date(Date.now() + Math.min(input.delaySeconds, 300) * 1000).toISOString() } : {}),
        httpRequest: {
          httpMethod: "POST",
          url: taskUrl,
          headers: { "Content-Type": "application/json" },
          body: Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
          oidcToken: { serviceAccountEmail: serviceAccount, audience: baseUrl },
        },
      },
    }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return { ok: false, status: response?.status ?? 502, error: "task_enqueue_failed" };
  return { ok: true, status: 202, error: null };
}

async function metadataAccessToken() {
  const response = await fetch(`${METADATA_ROOT}/instance/service-accounts/default/token`, {
    headers: { "Metadata-Flavor": "Google" },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const data = await response.json().catch(() => null) as { access_token?: unknown } | null;
  return typeof data?.access_token === "string" ? data.access_token : null;
}
