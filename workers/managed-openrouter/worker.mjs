import { timingSafeEqual } from "node:crypto";
import http from "node:http";

const port = Number(process.env.PORT || 8080);
const operatorSecret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";
const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
const siteUrl = process.env.PUBLIC_SITE_URL?.trim() || "https://veloceos.cloud";
const upstreamBaseUrl = "https://openrouter.ai/api/v1";
const allowedTextModels = new Set((process.env.OPENROUTER_MODEL_ALLOWLIST || "").split(",").map((value) => value.trim()).filter(Boolean));
// Video creation is intentionally opt-in. Listing the current catalog and
// polling an existing job are safe read operations; submitting a job can
// spend managed OpenRouter credits and therefore requires both flags below.
const videoGenerationEnabled = process.env.OPENROUTER_VIDEO_GENERATION_ENABLED === "1";
const allowedVideoModels = new Set((process.env.OPENROUTER_VIDEO_MODEL_ALLOWLIST || "").split(",").map((value) => value.trim()).filter(Boolean));
const allowedCalls = new Map([
  ["GET:/models", "/models"],
  ["GET:/credits", "/credits"],
  ["POST:/chat/completions", "/chat/completions"],
  ["GET:/videos/models", "/videos/models"],
]);

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function authorized(request) {
  const value = request.headers["x-control-plane-secret"]?.trim() || "";
  if (!operatorSecret || !value) return false;
  try { return timingSafeEqual(Buffer.from(operatorSecret), Buffer.from(value)); } catch { return false; }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 750_000) reject(new Error("payload_too_large"));
    });
    request.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("bad_json")); }
    });
    request.on("error", reject);
  });
}

function validInput(value) {
  const path = typeof value?.path === "string" ? value.path : "";
  const method = typeof value?.method === "string" ? value.method.toUpperCase() : "";
  if (method === "POST" && path === "/chat/completions") {
    const body = normalizedChatInput(value.body);
    return body ? { path, method, body } : null;
  }
  if (allowedCalls.get(`${method}:${path}`)) return { path, method, body: value.body };
  if (method === "GET" && /^\/videos\/[A-Za-z0-9_-]{1,128}$/.test(path)) return { path, method, body: undefined };
  if (method !== "POST" || path !== "/videos") return null;
  const body = normalizedVideoInput(value.body);
  return body ? { path, method, body, requiresVideoGeneration: true } : null;
}

function normalizedChatInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const model = typeof value.model === "string" ? value.model.trim() : "";
  if (!model || !allowedTextModels.has(model)) return null;
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 64) return null;
  const messages = value.messages.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) return null;
    const role = typeof message.role === "string" ? message.role.trim() : "";
    const content = typeof message.content === "string" ? message.content : "";
    if (!["system", "user", "assistant"].includes(role) || !content || content.length > 100_000) return null;
    return { role, content };
  });
  if (!messages.every(Boolean)) return null;
  const maxTokens = Number(value.max_tokens);
  const temperature = Number(value.temperature ?? 0.2);
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 16_384) return null;
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) return null;
  return { model, messages, max_tokens: maxTokens, temperature, stream: false };
}

function normalizedVideoInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value;
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const duration = Number(input.duration);
  const resolution = typeof input.resolution === "string" ? input.resolution.trim() : "";
  const aspectRatio = typeof input.aspect_ratio === "string" ? input.aspect_ratio.trim() : "";
  if (!model || !allowedVideoModels.has(model) || !prompt || prompt.length > 4_000) return null;
  if (!Number.isSafeInteger(duration) || duration < 4 || duration > 15) return null;
  if (!["480p", "720p"].includes(resolution) || !["9:16", "16:9", "1:1", "3:4", "4:3", "21:9", "9:21"].includes(aspectRatio)) return null;
  const output = { model, prompt, duration, resolution, aspect_ratio: aspectRatio, generate_audio: false };
  const references = normalizeImageReferences(input.input_references);
  const frames = normalizeFrameImages(input.frame_images);
  if (input.input_references !== undefined && !references) return null;
  if (input.frame_images !== undefined && !frames) return null;
  if (references) output.input_references = references;
  if (frames) output.frame_images = frames;
  if (Number.isSafeInteger(Number(input.seed))) output.seed = Number(input.seed);
  return output;
}

function normalizeImageReferences(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return null;
  const rows = value.map((item) => imageReference(item, false));
  return rows.every(Boolean) ? rows : null;
}

function normalizeFrameImages(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return null;
  const rows = value.map((item) => imageReference(item, true));
  if (!rows.every(Boolean)) return null;
  const types = new Set(rows.map((item) => item.frame_type));
  return types.size === rows.length ? rows : null;
}

function imageReference(value, isFrame) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.type !== "image_url") return null;
  const url = typeof value.image_url?.url === "string" ? value.image_url.url.trim() : "";
  if (!/^https:\/\/.{1,4096}$/.test(url)) return null;
  if (!isFrame) return { type: "image_url", image_url: { url } };
  const frameType = typeof value.frame_type === "string" ? value.frame_type.trim() : "";
  return ["first_frame", "last_frame"].includes(frameType) ? { type: "image_url", image_url: { url }, frame_type: frameType } : null;
}

async function forward(response, input) {
  if (!openRouterApiKey) return json(response, 503, { ok: false, error: "managed_provider_not_configured" });
  const body = input.method === "POST" ? JSON.stringify(input.body && typeof input.body === "object" && !Array.isArray(input.body) ? input.body : {}) : undefined;
  const upstream = await fetch(`${upstreamBaseUrl}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": siteUrl,
      "X-Title": "Veloce AgenticOS managed execution",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  }).catch(() => null);
  if (!upstream) return json(response, 502, { ok: false, error: "managed_provider_upstream_unavailable" });
  const text = await upstream.text().catch(() => "");
  response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store" });
  response.end(text.slice(0, 2_000_000));
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && (request.url === "/readyz" || request.url === "/healthz")) return json(response, 200, { ok: true, worker: "managed-openrouter", configured: Boolean(openRouterApiKey) });
  if (request.method !== "POST" || request.url !== "/v1/openrouter") return json(response, 404, { ok: false, error: "not_found" });
  if (!authorized(request)) return json(response, 401, { ok: false, error: "not_authorized" });
  let body;
  try { body = await readBody(request); } catch (error) { return json(response, 400, { ok: false, error: error instanceof Error ? error.message : "bad_json" }); }
  const input = validInput(body);
  if (!input) return json(response, 400, { ok: false, error: "managed_provider_request_not_allowed" });
  if (input.requiresVideoGeneration && !videoGenerationEnabled) return json(response, 409, { ok: false, error: "managed_video_generation_disabled" });
  return forward(response, input);
});

server.listen(port, "0.0.0.0");
