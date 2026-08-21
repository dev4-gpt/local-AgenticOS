import { timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createServer } from "node:http";
import { isIP } from "node:net";

export const CONTRACT_VERSION = "v96-research-worker-v1";
export const MAX_BODY_BYTES = 32_000;
export const MAX_OUTPUT_CHARS = 40_000;
export const MAX_URL_LENGTH = 2_000;

const port = Number(process.env.PORT || 8080);
const workerToken = String(process.env.VELOCE_WORKER_TOKEN || "").trim();
const jinaApiKey = String(process.env.JINA_API_KEY || "").trim();
const jinaBaseUrl = String(process.env.JINA_READER_BASE_URL || "https://r.jina.ai").trim().replace(/\/$/, "");

export function isAllowedTarget(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && !isPrivateHostname(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedReaderBase(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname === "r.jina.ai";
  } catch {
    return false;
  }
}

export function buildReaderUrl(baseUrl, targetUrl) {
  if (!isAllowedReaderBase(baseUrl) || !isAllowedTarget(targetUrl)) return null;
  return `${baseUrl}/${targetUrl}`;
}

export function authorizeWorkerRequest(value, expected = workerToken) {
  const received = typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7).trim() : "";
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeJinaPayload(payload, requestedUrl) {
  if (!isAllowedTarget(requestedUrl) || payload == null) return null;
  const row = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : row;
  const rawUrl = typeof data.url === "string" && isAllowedTarget(data.url) ? data.url : requestedUrl;
  const content = [data.content, data.markdown, data.text].find((value) => typeof value === "string") || (typeof payload === "string" ? payload : "");
  const markdown = content.slice(0, MAX_OUTPUT_CHARS);
  const title = typeof data.title === "string" ? data.title.trim().slice(0, 240) : "";
  const description = typeof data.description === "string" ? data.description.trim().slice(0, 600) : markdown.slice(0, 600);
  const retrievedAt = typeof data.publishedTime === "string" && Number.isFinite(Date.parse(data.publishedTime))
    ? data.publishedTime
    : new Date().toISOString();
  const status = markdown || description ? "complete" : "partial";
  return {
    url: rawUrl,
    title,
    description,
    markdown,
    retrievedAt,
    status,
    ...(status === "partial" ? { failureReason: "reader_returned_no_content" } : {}),
  };
}

export async function targetResolvesPublicly(value, lookupImpl = lookup) {
  try {
    const hostname = new URL(value).hostname;
    const addresses = await lookupImpl(hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  }
}

async function handle(request, response) {
  if (request.method === "GET" && request.url === "/healthz") return send(response, 200, { ok: true });
  if (request.method !== "POST" || request.url !== "/v1/extract") return send(response, 404, { ok: false, error: "not_found" });
  if (!authorizeWorkerRequest(request.headers.authorization)) return send(response, 401, { ok: false, error: "worker_unauthorized" });
  if (request.headers["x-veloce-worker-contract"] !== CONTRACT_VERSION) return send(response, 400, { ok: false, error: "worker_contract_invalid" });
  const body = await readBody(request);
  if (!body) return send(response, 413, { ok: false, error: "request_too_large" });
  let input;
  try { input = JSON.parse(body); } catch { return send(response, 400, { ok: false, error: "request_invalid" }); }
  if (!input || input.contractVersion !== CONTRACT_VERSION || input.operation !== "extract" || typeof input.requestId !== "string" || !/^[a-f0-9]{24}$/.test(String(input.tenantScope || "")) || !isAllowedTarget(input.url)) {
    return send(response, 400, { ok: false, error: "request_contract_invalid" });
  }
  if (!isAllowedReaderBase(jinaBaseUrl)) return send(response, 503, { ok: false, error: "reader_endpoint_invalid" });
  if (!(await targetResolvesPublicly(input.url))) return send(response, 400, { ok: false, error: "source_url_not_public" });
  const readerUrl = buildReaderUrl(jinaBaseUrl, input.url);
  if (!readerUrl) return send(response, 400, { ok: false, error: "source_url_not_allowed" });
  const headers = { Accept: "application/json", "X-Timeout": "30", "X-Veloce-Worker-Contract": CONTRACT_VERSION };
  if (jinaApiKey) headers.Authorization = `Bearer ${jinaApiKey}`;
  const upstream = await fetch(readerUrl, { headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(45_000) }).catch(() => null);
  if (!upstream) return send(response, 503, { ok: false, error: "reader_unreachable" });
  if (!upstream.ok) return send(response, upstream.status === 429 ? 429 : upstream.status >= 500 ? 503 : 502, { ok: false, error: upstream.status === 429 ? "reader_rate_limited" : "reader_request_failed" });
  const raw = await upstream.text();
  if (Buffer.byteLength(raw, "utf8") > 2_000_000) return send(response, 502, { ok: false, error: "reader_output_too_large" });
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = raw; }
  const result = normalizeJinaPayload(payload, input.url);
  return result ? send(response, 200, result) : send(response, 502, { ok: false, error: "reader_output_invalid" });
}

function readBody(request) {
  return new Promise((resolve) => {
    let bytes = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes <= MAX_BODY_BYTES) chunks.push(chunk);
      else request.destroy();
    });
    request.on("end", () => resolve(bytes <= MAX_BODY_BYTES ? Buffer.concat(chunks).toString("utf8") : null));
    request.on("error", () => resolve(null));
  });
}

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "metadata.google.internal" || host.endsWith(".local") || host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:") || /^10\.|^127\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\.|^0\./.test(host);
}

function isPrivateAddress(address) {
  if (isPrivateHostname(address)) return true;
  if (isIP(address) === 6) return address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:");
  return false;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).pathname === new URL(import.meta.url).pathname) {
  if (!workerToken) throw new Error("VELOCE_WORKER_TOKEN is required");
  createServer((request, response) => { void handle(request, response); }).listen(port, "0.0.0.0");
}
