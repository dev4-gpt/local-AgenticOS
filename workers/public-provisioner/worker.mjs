import http from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT || 8080);
const operatorToken = process.env.CONTROL_PLANE_WORKER_TOKEN?.trim() || "";
const adapterUrl = process.env.GCP_PROVISIONER_URL?.trim() || "";
const adapterAudience = process.env.GCP_PROVISIONER_AUDIENCE?.trim() || "";
const identityTokenSource = process.env.GCP_PROVISIONER_ID_TOKEN_SOURCE?.trim() || "metadata";
const allowedProject = process.env.GCP_ALLOWED_PROJECT?.trim() || "";
const allowedRegion = process.env.GCP_ALLOWED_REGION?.trim() || "";
const allowedRepository = process.env.GCP_ALLOWED_ARTIFACT_REPOSITORY?.trim() || "veloce";
const taskProject = process.env.GCP_PROVISIONER_TASK_PROJECT?.trim() || allowedProject;
const taskLocation = process.env.GCP_PROVISIONER_TASK_LOCATION?.trim() || allowedRegion;
const taskQueue = process.env.GCP_PROVISIONER_TASK_QUEUE?.trim() || "";
const taskServiceAccount = process.env.GCP_PROVISIONER_TASK_SERVICE_ACCOUNT?.trim() || "";

function authorized(request) {
  const value = request.headers.authorization?.replace(/^Bearer\s+/i, "").trim() || "";
  if (!operatorToken || !value) return false;
  try { return timingSafeEqual(Buffer.from(operatorToken), Buffer.from(value)); } catch { return false; }
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; if (raw.length > 200_000) reject(new Error("payload_too_large")); });
    request.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("bad_json")); } });
    request.on("error", reject);
  });
}

function validate(input) {
  const manifest = input?.manifest;
  if (!input?.runId || !input?.requestId || !input?.onboardingId) return "missing_identifiers";
  if (!manifest || manifest.approved !== true || manifest.acknowledgeClientSafeRuntime !== true || typeof manifest.clientSlug !== "string") return "manifest_not_approved";
  if (!manifest.gcp || manifest.gcp.projectId !== allowedProject || manifest.gcp.region !== allowedRegion) return "gcp_scope_not_allowed";
  const expectedImagePrefix = `${allowedRegion}-docker.pkg.dev/${allowedProject}/${allowedRepository}/`;
  if (typeof manifest.gcp.image !== "string" || !manifest.gcp.image.startsWith(expectedImagePrefix)) return "image_not_approved";
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(manifest.clientSlug)) return "client_slug_not_approved";
  const serialized = JSON.stringify(manifest);
  if (/(SERVICE_ROLE_KEY|PRIVATE_KEY|PASSWORD|ACCESS_TOKEN|API_KEY)\s*[:=]/i.test(serialized)) return "secret_in_manifest";
  return null;
}

async function enqueueProvisioning(input) {
  const config = queueConfig();
  const accessToken = await metadataAccessToken();
  if (!accessToken) throw new Error("gcp_provisioner_queue_identity_unavailable");
  const taskId = `provision-${createHash("sha256").update(String(input.runId)).digest("hex").slice(0, 48)}`;
  return enqueueTask({
    accessToken,
    taskId,
    queuePath: config.queuePath,
    url: adapterUrl,
    body: { runId: input.runId, requestId: input.requestId, onboardingId: input.onboardingId, manifest: input.manifest },
  });
}

async function enqueueAdapterQueueAuthProbe() {
  const config = queueConfig();
  const accessToken = await metadataAccessToken();
  if (!accessToken) throw new Error("gcp_provisioner_queue_identity_unavailable");
  const target = new URL("/queue-authz", adapterUrl).toString();
  const taskId = `queue-authz-${randomUUID().replace(/-/g, "")}`;
  return enqueueTask({ accessToken, taskId, queuePath: config.queuePath, url: target, body: { probe: "queue_authz" } });
}

function queueConfig() {
  const canonicalAudience = canonicalAdapterAudience();
  if (!adapterUrl || !adapterAudience || !canonicalAudience || !operatorToken || !taskProject || !taskLocation || !taskQueue || !taskServiceAccount) {
    throw new Error("gcp_provisioner_queue_not_configured");
  }
  if (adapterAudience !== canonicalAudience) throw new Error("gcp_provisioner_audience_must_match_target_url");
  if (!/^[a-z][a-z0-9-]{2,62}$/.test(taskProject) || !/^[a-z][a-z0-9-]{2,62}$/.test(taskLocation) || !/^[a-z][a-z0-9-]{2,62}$/.test(taskQueue)) {
    throw new Error("gcp_provisioner_queue_config_invalid");
  }
  if (!/^[a-z][a-z0-9-]{4,29}@[a-z][a-z0-9-]{4,62}\.iam\.gserviceaccount\.com$/i.test(taskServiceAccount)) {
    throw new Error("gcp_provisioner_task_identity_invalid");
  }
  return { queuePath: `projects/${taskProject}/locations/${taskLocation}/queues/${taskQueue}` };
}

async function enqueueTask({ accessToken, taskId, queuePath, url, body }) {
  const response = await fetch(`https://cloudtasks.googleapis.com/v2/${queuePath}/tasks`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      task: {
        name: `${queuePath}/tasks/${taskId}`,
        // HTTP tasks otherwise default to a 10-minute deadline. Provisioning
        // can run for 15 minutes, and must retain time for its final callback.
        // Keep this below the adapter's 1000-second Cloud Run timeout.
        dispatchDeadline: "960s",
        httpRequest: {
          httpMethod: "POST",
          url,
          headers: {
            "Content-Type": "application/json",
            "X-Control-Plane-Worker-Token": operatorToken,
          },
          body: Buffer.from(JSON.stringify(body)).toString("base64"),
          oidcToken: { serviceAccountEmail: taskServiceAccount, audience: adapterAudience },
        },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (response?.ok) return { taskId, alreadyQueued: false };
  // The fixed task name makes a retried approval request idempotent. A 409
  // means the durable dispatch already exists; do not create a second task.
  if (response?.status === 409) return { taskId, alreadyQueued: true };
  throw new Error(`gcp_provisioner_queue_failed_${response?.status || "network"}`);
}

// This is an operator-only acceptance probe. It deliberately uses the same
// Cloud Run identity path as a provisioning dispatch, but can only read the
// private adapter's health endpoint and never invokes the provision script.
async function adapterHealth() {
  if (!adapterUrl) throw new Error("gcp_adapter_not_configured");
  const identity = await cloudRunIdentity(adapterUrl);
  if (!identity) throw new Error("gcp_adapter_identity_unavailable");
  let healthUrl;
  try {
    // The Google Front End returns its own 1568-byte HTML 404 for the exact
    // /healthz path before the request reaches some Cloud Run containers.
    // Use a non-reserved readiness path for service-to-service acceptance.
    healthUrl = new URL("/readyz", adapterUrl).toString();
  } catch {
    throw new Error("gcp_adapter_not_configured");
  }
  const response = await fetch(healthUrl, {
    headers: { authorization: `Bearer ${identity.token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // These claims and response attributes are non-secret diagnostics. Never
    // log the ID token or an upstream response body.
    console.error(JSON.stringify({
      event: "gcp_adapter_health_failed",
      status: response.status,
      targetHost: new URL(healthUrl).host,
      responseHost: new URL(response.url).host,
      responsePath: new URL(response.url).pathname,
      responseRedirected: response.redirected,
      identityTokenSource,
      configuredAudience: identity.audience,
      tokenAudience: identity.claims.aud,
      tokenEmail: identity.claims.email,
      tokenSubject: identity.claims.sub,
      tokenIssuer: identity.claims.iss,
      responseContentType: response.headers.get("content-type"),
    }));
    throw new Error(`gcp_adapter_health_failed_${response.status}`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("gcp_adapter_health_invalid");
  return body;
}

async function cloudRunIdentity(target) {
  if (target !== adapterUrl) return null;
  const audience = canonicalAdapterAudience();
  if (!audience || adapterAudience !== audience) return null;
  let token;
  if (identityTokenSource === "metadata") token = await metadataIdentityToken(audience);
  else if (identityTokenSource === "iam-credentials") token = await iamCredentialsIdentityToken(audience);
  else return null;
  if (!token || token.split(".").length !== 3) return null;
  return { token, audience, claims: safeIdentityClaims(token) };
}

function canonicalAdapterAudience() {
  try {
    const url = new URL(adapterUrl);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".run.app") || url.pathname !== "/provision" || url.search || url.hash) return "";
    return url.origin;
  } catch { return ""; }
}

async function metadataIdentityToken(audience) {
  const response = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  return (await response.text().catch(() => "")).trim() || null;
}

async function metadataAccessToken() {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  const body = await response?.json().catch(() => null);
  return response?.ok && typeof body?.access_token === "string" ? body.access_token.trim() || null : null;
}

async function iamCredentialsIdentityToken(audience) {
  const [serviceAccountResponse, accessTokenResponse] = await Promise.all([
    metadata("instance/service-accounts/default/email"),
    metadata("instance/service-accounts/default/token"),
  ]);
  if (!serviceAccountResponse?.ok || !accessTokenResponse?.ok) return null;
  const serviceAccount = (await serviceAccountResponse.text().catch(() => "")).trim();
  const access = await accessTokenResponse.json().catch(() => null);
  const accessToken = typeof access?.access_token === "string" ? access.access_token.trim() : "";
  if (!/^[a-z0-9][a-z0-9._-]{1,62}@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/i.test(serviceAccount) || !accessToken) return null;

  const response = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateIdToken`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ audience, includeEmail: true }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const result = await response.json().catch(() => null);
  return typeof result?.token === "string" ? result.token.trim() || null : null;
}

function metadata(path) {
  return fetch(`http://metadata.google.internal/computeMetadata/v1/${path}`, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
}

function safeIdentityClaims(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return {
      aud: typeof payload.aud === "string" ? payload.aud : null,
      email: typeof payload.email === "string" ? payload.email : null,
      sub: typeof payload.sub === "string" ? payload.sub : null,
      iss: typeof payload.iss === "string" ? payload.iss : null,
    };
  } catch {
    return { aud: null, email: null, sub: null, iss: null };
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && (request.url === "/readyz" || request.url === "/healthz")) return json(response, 200, { ok: true, worker: "public-provisioner" });
  if (request.method === "POST" && request.url === "/adapter-healthz") {
    if (!authorized(request)) return json(response, 401, { ok: false, error: "not_authorized" });
    try {
      return json(response, 200, { ok: true, adapter: await adapterHealth() });
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "gcp_adapter_health_failed";
      return json(response, 502, { ok: false, error: errorCode });
    }
  }
  if (request.method === "POST" && request.url === "/adapter-queue-authz") {
    if (!authorized(request)) return json(response, 401, { ok: false, error: "not_authorized" });
    try {
      const task = await enqueueAdapterQueueAuthProbe();
      return json(response, 202, { ok: true, status: "queued", taskId: task.taskId, alreadyQueued: task.alreadyQueued });
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "queue_authz_unavailable";
      return json(response, 503, { ok: false, error: errorCode });
    }
  }
  if (request.method !== "POST" || request.url !== "/provision") return json(response, 404, { ok: false, error: "not_found" });
  if (!authorized(request)) return json(response, 401, { ok: false, error: "not_authorized" });
  let input;
  try { input = await readBody(request); } catch (error) { return json(response, 400, { ok: false, error: error.message }); }
  const validationError = validate(input);
  if (validationError) return json(response, 400, { ok: false, error: validationError });
  try {
    const task = await enqueueProvisioning(input);
    return json(response, 202, { ok: true, runId: input.runId, status: "queued", taskId: task.taskId, alreadyQueued: task.alreadyQueued });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "provisioning_failed";
    return json(response, 503, { ok: false, runId: input.runId, status: "queue_unavailable", error: errorCode });
  }
});

server.listen(port, "0.0.0.0");
