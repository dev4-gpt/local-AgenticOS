import { timingSafeEqual } from "node:crypto";
import http from "node:http";

const port = Number(process.env.PORT || 8080);
const operatorSecret = process.env.CONTROL_PLANE_OPERATOR_SECRET?.trim() || "";
const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
const siteUrl = process.env.PUBLIC_SITE_URL?.trim() || "https://veloceos.cloud";
const upstreamBaseUrl = "https://openrouter.ai/api/v1";
const allowedCalls = new Map([
  ["GET:/models", "/models"],
  ["GET:/credits", "/credits"],
  ["POST:/chat/completions", "/chat/completions"],
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
  return allowedCalls.get(`${method}:${path}`) ? { path, method } : null;
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
  if (request.method === "GET" && request.url === "/healthz") return json(response, 200, { ok: true, worker: "managed-openrouter", configured: Boolean(openRouterApiKey) });
  if (request.method !== "POST" || request.url !== "/v1/openrouter") return json(response, 404, { ok: false, error: "not_found" });
  if (!authorized(request)) return json(response, 401, { ok: false, error: "not_authorized" });
  let body;
  try { body = await readBody(request); } catch (error) { return json(response, 400, { ok: false, error: error instanceof Error ? error.message : "bad_json" }); }
  const input = validInput(body);
  if (!input) return json(response, 400, { ok: false, error: "managed_provider_request_not_allowed" });
  return forward(response, { ...input, body: body.body });
});

server.listen(port, "0.0.0.0");
