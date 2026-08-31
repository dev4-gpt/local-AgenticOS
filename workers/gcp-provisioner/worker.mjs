import { timingSafeEqual } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 8080);
const workerToken = process.env.CONTROL_PLANE_WORKER_TOKEN?.trim() || "";
const allowedProject = process.env.GCP_ALLOWED_PROJECT?.trim() || "";
const allowedRegion = process.env.GCP_ALLOWED_REGION?.trim() || "";
const allowedRepository = process.env.GCP_ALLOWED_ARTIFACT_REPOSITORY?.trim() || "veloce";
const allowApply = process.env.GCP_PROVISIONER_ALLOW_APPLY?.trim() === "1";
const provisionScript = process.env.GCP_PROVISIONER_SCRIPT?.trim() || "/app/scripts/provision-gcp-client.mjs";
const callbackUrl = process.env.CONTROL_PLANE_CALLBACK_URL?.trim() || "";
const callbackSecret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function authorized(request) {
  // Cloud Run consumes the Google ID token in Authorization. Keep the
  // control-plane's independent application token in its own header so this
  // check remains meaningful after Cloud Run has authenticated the request.
  // Fall back to Authorization during the rolling deployment from the legacy
  // header layout, then remove that compatibility path in a later migration.
  const value = request.headers["x-control-plane-worker-token"]?.trim()
    || request.headers.authorization?.replace(/^Bearer\s+/i, "").trim()
    || "";
  if (!workerToken || !value) return false;
  try { return timingSafeEqual(Buffer.from(workerToken), Buffer.from(value)); } catch { return false; }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 250_000) reject(new Error("payload_too_large"));
    });
    request.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("bad_json")); }
    });
    request.on("error", reject);
  });
}

function validate(input) {
  const manifest = input?.manifest;
  if (!input?.runId || !input?.requestId || !input?.onboardingId) return "missing_identifiers";
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return "manifest_missing";
  if (manifest.approved !== true || manifest.acknowledgeClientSafeRuntime !== true) return "manifest_not_approved";
  if (typeof manifest.clientSlug !== "string" || !/^[a-z][a-z0-9-]{2,40}$/.test(manifest.clientSlug)) return "client_slug_not_approved";
  const gcp = manifest.gcp;
  if (!gcp || typeof gcp !== "object" || Array.isArray(gcp)) return "gcp_manifest_missing";
  if (gcp.projectId !== allowedProject || gcp.region !== allowedRegion) return "gcp_scope_not_allowed";
  const expectedImagePrefix = `${allowedRegion}-docker.pkg.dev/${allowedProject}/${allowedRepository}/`;
  if (typeof gcp.image !== "string" || !gcp.image.startsWith(expectedImagePrefix)) return "image_not_approved";
  if (gcp.artifactRegistryRepository && gcp.artifactRegistryRepository !== allowedRepository) return "artifact_repository_not_allowed";
  if (typeof manifest.secretEnv === "object" && manifest.secretEnv !== null && containsInlineSecret(manifest.secretEnv)) return "secret_in_manifest";
  if (containsOperatorOnlyEnvironment(manifest.runtimeEnv)) return "operator_secret_in_manifest";
  return null;
}

function containsInlineSecret(value) {
  if (Array.isArray(value)) return value.some(containsInlineSecret);
  if (!value || typeof value !== "object") return typeof value === "string" && value.length > 160;
  return Object.values(value).some((entry) => {
    if (typeof entry !== "string") return containsInlineSecret(entry);
    // Client manifests can name Secret Manager entries, but never supply a
    // credential value. Secret names are short, lowercase, and hyphenated.
    if (/^(?:sk|rk|pk|whsec|gsk|ghp|xox[bap])[_-][A-Za-z0-9_-]{12,}$/i.test(entry) || /^AIza[A-Za-z0-9_-]{20,}$/i.test(entry) || /^eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./.test(entry)) return true;
    return !/^[a-z][a-z0-9_-]{1,120}$/.test(entry);
  });
}

function containsOperatorOnlyEnvironment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => /(?:SERVICE_ROLE|GOOGLE_APPLICATION_CREDENTIALS|AWS_SECRET|CONTROL_PLANE|STRIPE_|RESEND_|TURNSTILE_)/.test(key));
}

async function runProvisioning(manifest) {
  const requestedPhase = manifest.provisioning?.phase;
  const phase = requestedPhase === "deploy" ? "deploy" : "prepare";
  // Both script phases mutate project resources. Safe mode must not allow a
  // seemingly harmless prepare request to create a tenant service account,
  // bucket, queue, or secret before the scoped role and acceptance evidence
  // have been reviewed.
  if (!allowApply) throw new Error("gcp_apply_disabled");

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "veloce-provision-"));
  const configPath = path.join(temporaryDirectory, "manifest.json");
  try {
    await writeFile(configPath, JSON.stringify(manifest), { encoding: "utf8", mode: 0o600 });
    const args = [provisionScript, "--config", configPath, "--phase", phase, "--apply"];
    const output = await run("node", args, 15 * 60_000);
    if (output.code !== 0) throw new Error("gcp_provisioning_command_failed");
    return {
      completedSteps: phase === "prepare" ? ["validated_manifest", "gcp_prepare"] : ["validated_manifest", "gcp_deploy"],
      resourceManifest: redactManifest(manifest),
      evidenceBundle: {
        phase,
        command: "provision-gcp-client",
        output: redactOutput(output.stdout).slice(-12_000),
      },
      imageDigest: imageDigest(manifest.gcp.image),
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function run(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, String(chunk)); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, String(chunk)); });
    child.on("error", () => { clearTimeout(timer); resolve({ code: 1, stdout, stderr }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
  });
}

function append(current, next) {
  const value = current + next;
  return value.length > 24_000 ? value.slice(-24_000) : value;
}

function imageDigest(image) {
  const match = typeof image === "string" ? image.match(/@?(sha256:[a-f0-9]{64})$/i) : null;
  return match?.[1] || null;
}

function redactManifest(manifest) {
  const copy = structuredClone(manifest);
  if (copy.secretEnv) copy.secretEnv = Object.fromEntries(Object.keys(copy.secretEnv).map((name) => [name, "Secret Manager reference"]));
  return copy;
}

function redactOutput(value) {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,]+/gi, "$1=[REDACTED]");
}

async function callback(input, result) {
  if (!callbackUrl || !callbackSecret || !input?.runId) return false;
  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-control-plane-secret": callbackSecret },
    body: JSON.stringify({ runId: input.runId, ...result }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return response?.ok === true;
}

function callbackConfigured() {
  return /^https:\/\//i.test(callbackUrl) && callbackSecret.length > 0;
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && (request.url === "/readyz" || request.url === "/healthz")) {
    return json(response, 200, { ok: true, worker: "gcp-provisioner", applyEnabled: allowApply });
  }
  if (request.method === "POST" && request.url === "/queue-authz") {
    if (!authorized(request)) {
      console.warn(JSON.stringify({
        event: "gcp_adapter_queue_authz_denied",
        workerTokenConfigured: workerToken.length > 0,
        workerTokenHeaderPresent: typeof request.headers["x-control-plane-worker-token"] === "string",
        authorizationHeaderPresent: typeof request.headers.authorization === "string",
      }));
      return json(response, 401, { ok: false, error: "not_authorized" });
    }
    return json(response, 200, { ok: true, worker: "gcp-provisioner", queueAuthz: true, applyEnabled: allowApply });
  }
  if (request.method !== "POST" || request.url !== "/provision") return json(response, 404, { ok: false, error: "not_found" });
  if (!authorized(request)) return json(response, 401, { ok: false, error: "not_authorized" });
  let input;
  try { input = await readBody(request); } catch (error) { return json(response, 400, { ok: false, error: error.message }); }
  if (!callbackConfigured()) return json(response, 503, { ok: false, runId: input?.runId || null, error: "control_plane_callback_not_configured" });
  const invalid = validate(input);
  if (invalid) {
    const callbackDelivered = await callback(input, { status: "failed", errorCode: invalid, errorMessage: "Provisioning manifest was rejected before mutation." });
    return json(response, 400, { ok: false, runId: input?.runId || null, error: invalid, callbackDelivered });
  }
  try {
    const result = await runProvisioning(input.manifest);
    const callbackDelivered = await callback(input, { status: "succeeded", ...result });
    if (!callbackDelivered) return json(response, 502, { ok: false, runId: input.runId, error: "control_plane_callback_failed" });
    return json(response, 200, { ok: true, runId: input.runId, ...result, callbackDelivered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "gcp_provisioning_failed";
    const callbackDelivered = await callback(input, { status: "failed", errorCode: message, errorMessage: "Provisioning adapter failed; inspect the redacted adapter logs." });
    return json(response, message === "gcp_apply_disabled" ? 409 : 502, { ok: false, runId: input.runId, error: message, callbackDelivered });
  }
});

server.listen(port, "0.0.0.0");
