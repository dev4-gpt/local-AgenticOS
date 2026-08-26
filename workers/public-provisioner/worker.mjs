import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT || 8080);
const operatorToken = process.env.CONTROL_PLANE_WORKER_TOKEN?.trim() || "";
const adapterUrl = process.env.GCP_PROVISIONER_URL?.trim() || "";
const adapterAudience = process.env.GCP_PROVISIONER_AUDIENCE?.trim() || "";
const identityTokenSource = process.env.GCP_PROVISIONER_ID_TOKEN_SOURCE?.trim() || "metadata";
const callbackUrl = process.env.CONTROL_PLANE_CALLBACK_URL?.trim() || "";
const callbackSecret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";
const allowedProject = process.env.GCP_ALLOWED_PROJECT?.trim() || "";
const allowedRegion = process.env.GCP_ALLOWED_REGION?.trim() || "";
const allowedRepository = process.env.GCP_ALLOWED_ARTIFACT_REPOSITORY?.trim() || "veloce";

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

async function dispatch(input) {
  if (!adapterUrl) throw new Error("gcp_adapter_not_configured");
  const identity = await cloudRunIdentity(adapterUrl);
  if (!identity) throw new Error("gcp_adapter_identity_unavailable");
  const response = await fetch(adapterUrl, {
    method: "POST",
    // Keep the Cloud Run OIDC identity in the standard Authorization header.
    // The application-level token is deliberately separate, so neither
    // authentication layer shadows the other at the Cloud Run front door.
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${identity.token}`,
      "x-control-plane-worker-token": operatorToken,
    },
    body: JSON.stringify({ runId: input.runId, requestId: input.requestId, onboardingId: input.onboardingId, manifest: input.manifest }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`gcp_adapter_failed_${response.status}`);
  return response.json().catch(() => ({}));
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
    healthUrl = new URL("/healthz", adapterUrl).toString();
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
  let audience;
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".run.app")) return null;
    // Production uses an explicit custom audience accepted by the adapter.
    // The URL-derived value remains a backwards-compatible local fallback.
    audience = adapterAudience || `${url.origin}/`;
    if (!/^[\x21-\x7e]{1,512}$/.test(audience)) return null;
  } catch { return null; }
  let token;
  if (identityTokenSource === "metadata") token = await metadataIdentityToken(audience);
  else if (identityTokenSource === "iam-credentials") token = await iamCredentialsIdentityToken(audience);
  else return null;
  if (!token || token.split(".").length !== 3) return null;
  return { token, audience, claims: safeIdentityClaims(token) };
}

async function metadataIdentityToken(audience) {
  const response = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  return (await response.text().catch(() => "")).trim() || null;
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

async function callback(input, result) {
  if (!callbackUrl || !callbackSecret) return;
  await fetch(callbackUrl, { method: "POST", headers: { "content-type": "application/json", "x-control-plane-secret": callbackSecret }, body: JSON.stringify({ runId: input.runId, ...result }), signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") return json(response, 200, { ok: true, worker: "public-provisioner" });
  if (request.method === "POST" && request.url === "/adapter-healthz") {
    if (!authorized(request)) return json(response, 401, { ok: false, error: "not_authorized" });
    try {
      return json(response, 200, { ok: true, adapter: await adapterHealth() });
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "gcp_adapter_health_failed";
      return json(response, 502, { ok: false, error: errorCode });
    }
  }
  if (request.method !== "POST" || request.url !== "/provision") return json(response, 404, { ok: false, error: "not_found" });
  if (!authorized(request)) return json(response, 401, { ok: false, error: "not_authorized" });
  let input;
  try { input = await readBody(request); } catch (error) { return json(response, 400, { ok: false, error: error.message }); }
  const validationError = validate(input);
  if (validationError) return json(response, 400, { ok: false, error: validationError });
  try {
    const result = await dispatch(input);
    await callback(input, { status: "succeeded", ...result });
    return json(response, 200, { ok: true, runId: input.runId, status: "succeeded" });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "provisioning_failed";
    await callback(input, { status: "failed", errorCode, errorMessage: "Provisioning adapter failed; inspect the redacted worker logs." });
    return json(response, 502, { ok: false, runId: input.runId, status: "failed", error: errorCode });
  }
});

server.listen(port, "0.0.0.0");
