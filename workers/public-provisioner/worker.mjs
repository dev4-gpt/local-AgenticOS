import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT || 8080);
const operatorToken = process.env.CONTROL_PLANE_WORKER_TOKEN?.trim() || "";
const adapterUrl = process.env.GCP_PROVISIONER_URL?.trim() || "";
const callbackUrl = process.env.CONTROL_PLANE_CALLBACK_URL?.trim() || "";
const callbackSecret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";
const allowedProject = process.env.GCP_ALLOWED_PROJECT?.trim() || "";
const allowedRegion = process.env.GCP_ALLOWED_REGION?.trim() || "";

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
  if (!manifest || manifest.approved !== true || typeof manifest.clientSlug !== "string") return "manifest_not_approved";
  if (!manifest.gcp || manifest.gcp.projectId !== allowedProject || manifest.gcp.region !== allowedRegion) return "gcp_scope_not_allowed";
  if (typeof manifest.gcp.image !== "string" || !manifest.gcp.image.includes("-docker.pkg.dev/")) return "image_not_approved";
  const serialized = JSON.stringify(manifest);
  if (/(SERVICE_ROLE_KEY|PRIVATE_KEY|PASSWORD|ACCESS_TOKEN|API_KEY)\s*[:=]/i.test(serialized)) return "secret_in_manifest";
  return null;
}

async function dispatch(input) {
  if (!adapterUrl) throw new Error("gcp_adapter_not_configured");
  const response = await fetch(adapterUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({ runId: input.runId, requestId: input.requestId, onboardingId: input.onboardingId, manifest: input.manifest }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`gcp_adapter_failed_${response.status}`);
  return response.json().catch(() => ({}));
}

async function callback(input, result) {
  if (!callbackUrl || !callbackSecret) return;
  await fetch(callbackUrl, { method: "POST", headers: { "content-type": "application/json", "x-control-plane-secret": callbackSecret }, body: JSON.stringify({ runId: input.runId, ...result }), signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") return json(response, 200, { ok: true, worker: "public-provisioner" });
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
