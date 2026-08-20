import { createHash } from "node:crypto";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { isPrivateAddress, readBoundedResponseBytes } from "@/lib/clientNetworkSafety";
import { providerEnvKey } from "@/lib/providerKeys";
import { isAllowedV96ResearchUrl } from "@/lib/v96Contracts";

/**
 * Veloce's external research-worker boundary.
 *
 * These are adapters, not bundled runtimes. A worker must implement the
 * Veloce contract at its configured HTTPS endpoint; Crawl4AI, Crawlee, and
 * Jina Reader remain outside the Next.js image and outside client control.
 */
export const RESEARCH_WORKER_IDS = ["crawl4ai", "crawlee", "jina-reader"] as const;
export type ResearchWorkerId = (typeof RESEARCH_WORKER_IDS)[number];
export type ResearchWorkerOperation = "extract";
export type ResearchWorkerContentType = "html" | "javascript" | "pdf" | "document" | "unknown";

export const RESEARCH_WORKER_POLICY_VERSION = "research-worker-routing-v1" as const;
export const RESEARCH_WORKER_MAX_OUTPUT_BYTES = 2_000_000;
export const RESEARCH_WORKER_MAX_TEXT_CHARS = 40_000;

export type ResearchWorkerConfig = {
  id: ResearchWorkerId;
  endpoint: string;
  secretEnv: string;
  enabled: boolean;
  allowed: boolean;
  capabilities: readonly ResearchWorkerOperation[];
  costMicros: number;
  latencyMs: number;
  reliability: number;
};

export type ResearchWorkerState = ResearchWorkerConfig & { available: boolean };

export type ResearchWorkerDecision = {
  worker: ResearchWorkerId;
  mode: "automatic";
  policyVersion: typeof RESEARCH_WORKER_POLICY_VERSION;
  reason: "content-fit" | "cost-latency-reliability";
  contentType: ResearchWorkerContentType;
  eligibleWorkers: ResearchWorkerId[];
  estimatedCostMicros: number;
};

export type ResearchWorkerExtraction = {
  url: string;
  title: string;
  description: string;
  markdown: string;
  retrievedAt: string;
  status: "complete" | "partial" | "failed";
  failureReason?: string;
};

const SECRET_ENV = /^[A-Z][A-Z0-9_]{1,80}$/;
const WORKER_ENDPOINT = /^https:\/\/[^\s]+$/i;
const MAX_ENDPOINT_LENGTH = 500;
const MAX_WORKER_COST_MICROS = 100_000_000;
const MAX_WORKER_LATENCY_MS = 120_000;

const CONTENT_FIT: Record<ResearchWorkerContentType, Record<ResearchWorkerId, number>> = {
  html: { crawl4ai: 25, crawlee: 30, "jina-reader": 20 },
  javascript: { crawl4ai: 40, crawlee: 28, "jina-reader": 5 },
  pdf: { crawl4ai: 8, crawlee: 10, "jina-reader": 40 },
  document: { crawl4ai: 10, crawlee: 12, "jina-reader": 40 },
  unknown: { crawl4ai: 18, crawlee: 20, "jina-reader": 22 },
};

const DEFAULT_CAPABILITIES: readonly ResearchWorkerOperation[] = ["extract"];

export function normalizeResearchWorkerConfigs(value: unknown): ResearchWorkerConfig[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value as Record<string, unknown>).map(([id, config]) => ({ id, ...(asRecord(config)) }))
      : [];
  const seen = new Set<ResearchWorkerId>();
  const configs: ResearchWorkerConfig[] = [];
  for (const entry of entries) {
    const row = asRecord(entry);
    const id = normalizeWorkerId(row.id);
    const endpoint = typeof row.endpoint === "string" ? row.endpoint.trim() : "";
    const secretEnv = typeof row.secretEnv === "string" ? row.secretEnv.trim().toUpperCase() : "";
    if (!id || seen.has(id) || !isValidWorkerEndpoint(endpoint) || !SECRET_ENV.test(secretEnv)) continue;
    const capabilities = Array.isArray(row.capabilities)
      ? row.capabilities.filter((value): value is ResearchWorkerOperation => value === "extract")
      : [...DEFAULT_CAPABILITIES];
    if (!capabilities.includes("extract")) continue;
    const costMicros = boundedNumber(row.costMicros, 0, MAX_WORKER_COST_MICROS, 0);
    const latencyMs = boundedNumber(row.latencyMs, 0, MAX_WORKER_LATENCY_MS, 30_000);
    const reliability = boundedNumber(row.reliability, 0, 1, 0.9);
    seen.add(id);
    configs.push({
      id,
      endpoint,
      secretEnv,
      enabled: row.enabled === true,
      allowed: row.allowed !== false,
      capabilities,
      costMicros,
      latencyMs,
      reliability,
    });
  }
  return configs;
}

export function configuredResearchWorkerStates(raw = process.env.CLIENT_RESEARCH_WORKER_CONFIG_JSON): ResearchWorkerState[] {
  let parsed: unknown = [];
  if (raw?.trim()) {
    try { parsed = JSON.parse(raw); } catch { parsed = []; }
  }
  return normalizeResearchWorkerConfigs(parsed).map((config) => ({
    ...config,
    available: Boolean(providerEnvKey(config.secretEnv)),
  }));
}

export function selectResearchWorker(input: {
  operation: ResearchWorkerOperation;
  contentType?: ResearchWorkerContentType;
  workers: readonly ResearchWorkerState[];
}): ResearchWorkerDecision | { error: "worker_not_configured" | "worker_not_allowlisted" } {
  const contentType = input.contentType ?? "unknown";
  const eligible = input.workers.filter((worker) => (
    worker.enabled
    && worker.allowed
    && worker.available
    && worker.capabilities.includes(input.operation)
  ));
  if (eligible.length === 0) {
    const declared = input.workers.some((worker) => worker.enabled && worker.capabilities.includes(input.operation));
    const allowlisted = input.workers.some((worker) => worker.enabled && worker.allowed && worker.capabilities.includes(input.operation));
    return { error: !declared || allowlisted ? "worker_not_configured" : "worker_not_allowlisted" };
  }

  // Lower is better. The fit bonus prevents a nominally cheaper worker from
  // winning when it is a poor match for PDFs, JavaScript-heavy pages, etc.
  // All inputs are manifest-owned, so the result is deterministic and auditable.
  const score = (worker: ResearchWorkerState) => (
    worker.costMicros * 1_000
    + worker.latencyMs
    + Math.round((1 - worker.reliability) * 100_000)
    - CONTENT_FIT[contentType][worker.id] * 1_000
  );
  const ordered = [...eligible].sort((left, right) => score(left) - score(right) || left.id.localeCompare(right.id));
  const selected = ordered[0];
  return {
    worker: selected.id,
    mode: "automatic",
    policyVersion: RESEARCH_WORKER_POLICY_VERSION,
    reason: CONTENT_FIT[contentType][selected.id] >= 30 ? "content-fit" : "cost-latency-reliability",
    contentType,
    eligibleWorkers: ordered.map((worker) => worker.id),
    estimatedCostMicros: selected.costMicros,
  };
}

export async function runResearchWorkerAdapter(input: {
  worker: ResearchWorkerId;
  url: string;
  requestId: string;
  tenantSlug: string;
  contentType?: ResearchWorkerContentType;
  config?: ResearchWorkerConfig;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; worker: ResearchWorkerId; result: ResearchWorkerExtraction; estimatedCostMicros: number } | { ok: false; status: number; error: string }> {
  if (!isAllowedV96ResearchUrl(input.url)) return { ok: false, status: 400, error: "worker_source_url_not_allowed" };
  const config = input.config ?? configuredResearchWorkerStates().find((item) => item.id === input.worker);
  if (!config || config.id !== input.worker || !config.enabled || !config.allowed) return { ok: false, status: 403, error: "worker_not_allowlisted" };
  const token = providerEnvKey(config.secretEnv);
  if (!token) return { ok: false, status: 503, error: "worker_not_configured" };
  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = new URL(config.endpoint);
  const requestBody = {
    contractVersion: "v96-research-worker-v1",
    operation: "extract",
    requestId: input.requestId,
    tenantScope: tenantScopeHash(input.tenantSlug),
    url: input.url,
    contentType: input.contentType ?? "unknown",
    maxBytes: RESEARCH_WORKER_MAX_OUTPUT_BYTES,
    redirects: "disabled",
    network: "public-https-only",
  };
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Veloce-Worker-Contract": "v96-research-worker-v1",
      "X-Veloce-Job-Id": input.requestId,
    },
    body: JSON.stringify(requestBody),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(Math.max(1_000, config.latencyMs * 2)),
  }).catch(() => null);
  if (!response) return { ok: false, status: 503, error: "worker_unreachable" };
  if (!response.ok) return { ok: false, status: response.status === 429 ? 429 : response.status >= 500 ? 503 : 502, error: response.status === 429 ? "worker_rate_limited" : "worker_request_failed" };
  const bytes = await readBoundedResponseBytes(response, RESEARCH_WORKER_MAX_OUTPUT_BYTES);
  if (!bytes) return { ok: false, status: 502, error: "worker_output_too_large" };
  let payload: unknown = null;
  try { payload = JSON.parse(bytes.toString("utf8")); } catch { return { ok: false, status: 502, error: "worker_output_invalid" }; }
  const result = normalizeResearchWorkerResponse(payload, input.url);
  if (!result) return { ok: false, status: 502, error: "worker_output_invalid" };
  return { ok: true, worker: input.worker, result, estimatedCostMicros: config.costMicros };
}

export function normalizeResearchWorkerResponse(payload: unknown, requestedUrl: string): ResearchWorkerExtraction | null {
  if (!isAllowedV96ResearchUrl(requestedUrl) || !payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const rawUrl = typeof row.url === "string" ? row.url.trim() : requestedUrl;
  if (!isAllowedV96ResearchUrl(rawUrl)) return null;
  const markdownValue = [row.markdown, row.content, row.text].find((value) => typeof value === "string");
  const markdown = typeof markdownValue === "string" ? markdownValue.slice(0, RESEARCH_WORKER_MAX_TEXT_CHARS) : "";
  const title = typeof row.title === "string" ? row.title.trim().slice(0, 240) : "";
  const descriptionValue = typeof row.description === "string" ? row.description : markdown;
  const description = descriptionValue.trim().slice(0, 600);
  const retrievedAt = typeof row.retrievedAt === "string" && Number.isFinite(Date.parse(row.retrievedAt)) ? row.retrievedAt : new Date().toISOString();
  if (containsClientSecretLike(`${title}\n${description}\n${markdown}`)) {
    return { url: rawUrl, title: "", description: "", markdown: "", retrievedAt, status: "partial", failureReason: "worker_output_redacted" };
  }
  const requestedStatus = row.status === "partial" || row.status === "failed" || row.status === "complete" ? row.status : null;
  const status = requestedStatus ?? (markdown || description ? "complete" : "partial");
  return {
    url: rawUrl,
    title,
    description,
    markdown,
    retrievedAt,
    status,
    ...(status === "failed" || (!markdown && !description) ? { failureReason: typeof row.failureReason === "string" ? row.failureReason.slice(0, 160) : "worker_returned_no_content" } : {}),
  };
}

export function isValidWorkerEndpoint(value: string) {
  if (!value || value.length > MAX_ENDPOINT_LENGTH || !WORKER_ENDPOINT.test(value)) return false;
  try {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password && !isPrivateAddress(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeWorkerId(value: unknown): ResearchWorkerId | null {
  return typeof value === "string" && (RESEARCH_WORKER_IDS as readonly string[]).includes(value.trim().toLowerCase())
    ? value.trim().toLowerCase() as ResearchWorkerId
    : null;
}

function tenantScopeHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
