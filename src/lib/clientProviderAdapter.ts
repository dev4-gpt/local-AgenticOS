import { clientExecutionCredential } from "@/lib/clientExecutionCredential";
import { clientContextCompressionEnabled, clientProviderCallsEnabled, clientProviderEnabled } from "@/lib/clientRuntimePolicy";
import { providerEnvKey, openRouterKey } from "@/lib/providerKeys";
import { reserveClientRuntimeBudget } from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientProviderAttributionHeaders, clientProviderContract, clientProviderToolPayload, serializeClientReviewedPlan } from "@/lib/clientProviderContracts";
import { compressProviderContext } from "@/lib/contextCompression";
import { measureStandingInstructionBudget, standingInstructionSegmentsFromMessages } from "@/lib/instructionBudget";
import { traceClientJobStage } from "@/lib/clientJobTrace";

export type ClientProviderMessage = { role: "system" | "user" | "assistant"; content: string };
type Message = ClientProviderMessage;
type ProviderUsage = { inputTokens: number; outputTokens: number };

interface ProviderSpec {
  key: string;
  protocol: "openai" | "anthropic" | "gemini";
  endpoint: string;
  defaultModel: string;
}

const PROVIDERS: Record<string, ProviderSpec> = {
  anthropic: { key: "ANTHROPIC_API_KEY", protocol: "anthropic", endpoint: "https://api.anthropic.com/v1/messages", defaultModel: "claude-3-5-haiku-latest" },
  openai: { key: "OPENAI_API_KEY", protocol: "openai", endpoint: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o-mini" },
  codex: { key: "OPENAI_API_KEY", protocol: "openai", endpoint: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o-mini" },
  openrouter: { key: "OPENROUTER_API_KEY", protocol: "openai", endpoint: "https://openrouter.ai/api/v1/chat/completions", defaultModel: "openai/gpt-4o-mini" },
  openclaw: { key: "OPENROUTER_API_KEY", protocol: "openai", endpoint: "https://openrouter.ai/api/v1/chat/completions", defaultModel: "meta-llama/llama-3.3-70b-instruct" },
  hermes: { key: "OPENROUTER_API_KEY", protocol: "openai", endpoint: "https://openrouter.ai/api/v1/chat/completions", defaultModel: "nousresearch/hermes-4-70b" },
  freeclaude: { key: "OPENROUTER_API_KEY", protocol: "openai", endpoint: "https://openrouter.ai/api/v1/chat/completions", defaultModel: "qwen/qwen3-coder:free" },
  fusion: { key: "OPENROUTER_API_KEY", protocol: "openai", endpoint: "https://openrouter.ai/api/v1/chat/completions", defaultModel: "openai/gpt-4o-mini" },
  // Direct, OpenAI-compatible BYOK lane. It remains unusable until the tenant
  // explicitly supplies GROQ_API_KEY, allowlists the provider/model, enables
  // calls, and supplies a per-model pricing entry. No browser-selected
  // endpoint is ever accepted. GPT-OSS 120B is Groq's current production
  // successor to the deprecated Llama 3.3 70B free/developer lane.
  groq: { key: "GROQ_API_KEY", protocol: "openai", endpoint: "https://api.groq.com/openai/v1/chat/completions", defaultModel: "openai/gpt-oss-120b" },
  moonshot: { key: "MOONSHOT_API_KEY", protocol: "openai", endpoint: "https://api.moonshot.ai/v1/chat/completions", defaultModel: "moonshot-v1-8k" },
  kimi: { key: "MOONSHOT_API_KEY", protocol: "openai", endpoint: "https://api.moonshot.ai/v1/chat/completions", defaultModel: "moonshot-v1-8k" },
  glm: { key: "GLM_API_KEY", protocol: "openai", endpoint: "https://api.z.ai/api/coding/paas/v4/chat/completions", defaultModel: "glm-5.2" },
  "glm-code": { key: "GLM_API_KEY", protocol: "openai", endpoint: "https://api.z.ai/api/coding/paas/v4/chat/completions", defaultModel: "glm-5.2" },
  xai: { key: "XAI_API_KEY", protocol: "openai", endpoint: "https://api.x.ai/v1/chat/completions", defaultModel: "grok-3-mini" },
  grok: { key: "XAI_API_KEY", protocol: "openai", endpoint: "https://api.x.ai/v1/chat/completions", defaultModel: "grok-3-mini" },
  sakana: { key: "SAKANA_API_KEY", protocol: "openai", endpoint: "https://api.sakana.ai/v1/chat/completions", defaultModel: "fugu-ultra-20260615" },
  gemini: { key: "GEMINI_API_KEY", protocol: "gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", defaultModel: "gemini-3.1-flash-lite" },
  antigravity: { key: "GEMINI_API_KEY", protocol: "gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", defaultModel: "gemini-3.1-flash-lite" },
};

const OPENROUTER_ALIAS_PROVIDERS = new Set(["openclaw", "hermes", "freeclaude", "fusion"]);

export function clientProviderNames() {
  return Object.keys(PROVIDERS);
}

export function clientProviderDefaultModel(provider: string) {
  return PROVIDERS[provider.trim().toLowerCase()]?.defaultModel ?? null;
}

export function clientProviderRequestAllowed(provider: string, requestedModel?: string | null) {
  const normalizedProvider = provider.trim().toLowerCase();
  const spec = PROVIDERS[normalizedProvider];
  if (!spec || !clientProviderEnabled(spec.key)) return { ok: false as const, status: 403, error: "provider_not_allowlisted" };
  const providerModels = configuredProviderModels(normalizedProvider)
    ?? (OPENROUTER_ALIAS_PROVIDERS.has(normalizedProvider) ? configuredProviderModels("openrouter") : null);
  // The hosted workspace deliberately does not let a browser pick an arbitrary
  // model. When it omits a model, use the reviewed provider allowlist first.
  const model = requestedModel?.trim() || providerModels?.[0] || spec.defaultModel;
  if (!configuredModels().includes(model)) return { ok: false as const, status: 403, error: "model_not_allowlisted" };
  if (providerModels && !providerModels.includes(model)) return { ok: false as const, status: 403, error: "provider_model_not_allowlisted" };
  return { ok: true as const, provider: normalizedProvider, model, key: spec.key };
}

export function prepareClientProviderMessages(input: {
  provider: string;
  messages: readonly ClientProviderMessage[];
  capability?: string | null;
}) {
  const contract = clientProviderContract(input.provider);
  const budget = measureStandingInstructionBudget({ segments: standingInstructionSegmentsFromMessages(input.messages) });
  if (!contract || !clientContextCompressionEnabled()) return { ok: true as const, messages: [...input.messages], compression: null, instructionBudget: budget.evidence };
  const compression = compressProviderContext({ messages: input.messages, maxPromptChars: contract.maxPromptChars, capability: input.capability, provider: input.provider });
  if (!compression.ok) return { ok: false as const, error: compression.error, compression: compression.evidence, instructionBudget: budget.evidence };
  return { ok: true as const, messages: [...compression.messages], compression: compression.evidence, instructionBudget: budget.evidence };
}

export async function runClientTextAdapter(input: {
  provider: string;
  model?: string;
  prompt: string;
  history?: Message[];
  reserveBudget?: boolean;
  jobId?: string;
  capability?: string | null;
  /** Semantic jobs (pipeline/loop) need their requested response shape. */
  disableReviewedPlanTool?: boolean;
}) {
  const provider = input.provider.trim().toLowerCase();
  const spec = PROVIDERS[provider];
  const contract = clientProviderContract(provider);
  if (!clientProviderCallsEnabled()) return { ok: false as const, status: 403, error: "provider_calls_require_approval" };
  const requestPolicy = clientProviderRequestAllowed(provider, input.model);
  if (!requestPolicy.ok) return requestPolicy;
  const model = requestPolicy.model;
  if (!contract || contract.protocol !== spec.protocol) return { ok: false as const, status: 503, error: "provider_contract_not_configured" };
  if (input.prompt.length < 1 || input.prompt.length > contract.maxPromptChars) return { ok: false as const, status: 400, error: "prompt_invalid" };
  if (containsClientSecretLike(input.prompt, input.history)) return { ok: false as const, status: 400, error: "secret_like_input_rejected" };

  const key = await clientExecutionCredential(spec.key);
  if (!key) return { ok: false as const, status: 503, error: "provider_not_configured" };
  const rawMessages: Message[] = [
    ...(input.history ?? []).slice(-contract.maxHistoryMessages).filter((item) => item && typeof item.content === "string"),
    { role: "user", content: input.prompt },
  ];
  const prepared = prepareClientProviderMessages({ provider, messages: rawMessages, capability: input.capability });
  if (!prepared.ok) return { ok: false as const, status: 400, error: prepared.error, compression: prepared.compression, instructionBudget: prepared.instructionBudget };
  const messages: Message[] = prepared.messages;
  const maxOutputTokens = Math.min(contract.maxOutputTokens, Math.min(4096, Math.max(256, Number(process.env.CLIENT_MAX_OUTPUT_TOKENS ?? 2048))));
  const estimate = estimateClientTextCostMicros(model, messages, maxOutputTokens);
  if (estimate === null) return { ok: false as const, status: 503, error: "model_pricing_not_configured", instructionBudget: prepared.instructionBudget };
  if (input.reserveBudget !== false && !(await reserveClientRuntimeBudget(provider, model, estimate, input.jobId))) {
    return { ok: false as const, status: 429, error: "budget_exceeded", instructionBudget: prepared.instructionBudget };
  }

  const toolPayload = input.disableReviewedPlanTool ? {} : clientProviderToolPayload(provider);
  const response = await traceClientJobStage("provider_call", async () => spec.protocol === "anthropic"
    ? callAnthropic(spec, key, model, messages, maxOutputTokens, toolPayload)
    : spec.protocol === "gemini"
      ? callGemini(spec, key, model, messages, maxOutputTokens, toolPayload)
      : callOpenAiCompatible(spec, key, model, messages, maxOutputTokens, clientProviderAttributionHeaders(provider), toolPayload), (result) => result.ok);
  if (!response.ok) return { ok: false as const, status: response.status, error: providerFailureCode(response.status), instructionBudget: prepared.instructionBudget };
  return { ok: true as const, provider, model, output: response.output, usage: response.usage, finishReason: "finishReason" in response ? response.finishReason : null, instructionBudget: prepared.instructionBudget, ...(prepared.compression ? { compression: prepared.compression } : {}) };
}

function providerFailureCode(status: number) {
  if (status === 401 || status === 403) return "provider_auth_failed";
  if (status === 404) return "provider_model_unavailable";
  if (status === 408 || status === 504) return "provider_timeout";
  if (status === 429) return "provider_rate_limited";
  if (status >= 400 && status < 500) return "provider_request_rejected";
  return "provider_request_failed";
}

function configuredModels() {
  return (process.env.CLIENT_MODEL_ALLOWLIST ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

function configuredProviderModels(provider: string) {
  const raw = process.env.CLIENT_PROVIDER_MODEL_ALLOWLIST_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const models = parsed[provider];
    return Array.isArray(models) ? models.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()) : null;
  } catch {
    return [];
  }
}

export function estimateClientTextCostMicros(model: string, messages: Message[], maxOutputTokens: number) {
  const rate = clientTextPricing(model);
  if (!rate || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 0) return null;
  // Price the supplied prompt conservatively; a multi-call worker must still
  // reserve its complete envelope and reconcile measured usage separately.
  const inputTokens = Math.max(1, messages.reduce((total, item) => total + item.content.length, 0));
  return pricedTextTokens(rate, inputTokens, maxOutputTokens);
}

export function clientTextUsageCostMicros(model: string, usage: ProviderUsage) {
  const rate = clientTextPricing(model);
  if (!rate || !usage || !Number.isSafeInteger(usage.inputTokens) || !Number.isSafeInteger(usage.outputTokens) || usage.inputTokens < 0 || usage.outputTokens < 0) return null;
  return pricedTextTokens(rate, usage.inputTokens, usage.outputTokens);
}

type TextPricing = { inputMicrosPer1k: number; outputMicrosPer1k: number };

function clientTextPricing(model: string): TextPricing | null {
  let pricing: unknown;
  try { pricing = JSON.parse(process.env.CLIENT_MODEL_PRICING_JSON ?? "{}"); } catch { return null; }
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing) || !Object.hasOwn(pricing, model)) return null;
  const rate = (pricing as Record<string, unknown>)[model];
  if (!rate || typeof rate !== "object" || Array.isArray(rate)) return null;
  const { inputMicrosPer1k, outputMicrosPer1k } = rate as TextPricing;
  return Number.isFinite(inputMicrosPer1k) && inputMicrosPer1k >= 0 && Number.isFinite(outputMicrosPer1k) && outputMicrosPer1k >= 0
    ? { inputMicrosPer1k, outputMicrosPer1k } : null;
}

function pricedTextTokens(rate: TextPricing, inputTokens: number, outputTokens: number) {
  const cost = Math.ceil((inputTokens / 1000) * rate.inputMicrosPer1k + (outputTokens / 1000) * rate.outputMicrosPer1k);
  return Number.isSafeInteger(cost) && cost >= 0 ? cost : null;
}

export function safeClientProviderOutput(value: string) {
  const output = redactKnownProviderSecrets(value.trim().slice(0, 40_000));
  return containsClientSecretLike(output)
    ? "[Provider output withheld because it matched secret-like content.]"
    : output;
}

function redactKnownProviderSecrets(value: string) {
  let output = value;
  const names = new Set(Object.values(PROVIDERS).map((spec) => spec.key));
  for (const name of names) {
    const secret = name === "OPENROUTER_API_KEY" ? openRouterKey() : providerEnvKey(name);
    if (secret && secret.length >= 8) output = output.split(secret).join("[Redacted provider secret.]");
  }
  return output;
}

export function safeClientProviderMetadata(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[Provider metadata truncated.]";
  if (typeof value === "string") return safeClientProviderOutput(value.slice(0, 4_000));
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => safeClientProviderMetadata(item, depth + 1));
  if (!value || typeof value !== "object") return null;
  const safe: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    if (/(api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token)/i.test(key)) {
      safe[key] = "[Redacted provider metadata field.]";
      continue;
    }
    safe[key] = safeClientProviderMetadata(item, depth + 1);
  }
  return safe;
}

export function clientTextMaxOutputTokens() {
  return Math.min(4096, Math.max(256, Number(process.env.CLIENT_MAX_OUTPUT_TOKENS ?? 2048)));
}

async function callOpenAiCompatible(spec: ProviderSpec, key: string, model: string, messages: Message[], maxTokens: number, extraHeaders: Record<string, string> = {}, toolPayload: Record<string, unknown> = {}) {
  const response = await fetch(spec.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2, ...toolPayload }),
    cache: "no-store",
    signal: providerAbortSignal(),
  }).catch(() => null);
  if (!response?.ok) return { ok: false as const, status: response?.status ?? 503, output: "" };
  const data = await responseJson(response) as { choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown; tool_calls?: Array<{ function?: { name?: unknown; arguments?: unknown } }> } }>; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null;
  const message = data?.choices?.[0]?.message;
  const toolCall = message?.tool_calls?.find((call) => call.function?.name === "propose_reviewed_plan");
  if (toolCall) {
    const raw = parseToolArguments(toolCall.function?.arguments);
    if (raw === null) return { ok: false as const, status: 502, output: "" };
    const output = serializeClientReviewedPlan(raw);
    return output ? { ok: true as const, status: 200, output, usage: normalizeUsage(data?.usage?.prompt_tokens, data?.usage?.completion_tokens) } : { ok: false as const, status: 502, output: "" };
  }
  const output = message?.content;
  const reason = data?.choices?.[0]?.finish_reason;
  const finishReason = typeof reason === "string" && ["stop", "length", "content_filter", "tool_calls"].includes(reason) ? reason : null;
  return typeof output === "string" ? { ok: true as const, status: 200, output, finishReason, usage: normalizeUsage(data?.usage?.prompt_tokens, data?.usage?.completion_tokens) } : { ok: false as const, status: 502, output: "" };
}

async function callAnthropic(spec: ProviderSpec, key: string, model: string, messages: Message[], maxTokens: number, toolPayload: Record<string, unknown> = {}) {
  const system = messages.filter((item) => item.role === "system").map((item) => item.content).join("\n");
  const response = await fetch(spec.endpoint, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, system: system || undefined, messages: messages.filter((item) => item.role !== "system"), max_tokens: maxTokens, ...toolPayload }),
    cache: "no-store",
    signal: providerAbortSignal(),
  }).catch(() => null);
  if (!response?.ok) return { ok: false as const, status: response?.status ?? 503, output: "" };
  const data = await responseJson(response) as { content?: Array<{ type?: string; text?: unknown; input?: unknown; name?: unknown }>; usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null;
  const toolUse = data?.content?.find((item) => item.type === "tool_use" && item.name === "propose_reviewed_plan");
  if (toolUse) {
    const output = serializeClientReviewedPlan(toolUse.input);
    return output ? { ok: true as const, status: 200, output, usage: normalizeUsage(data?.usage?.input_tokens, data?.usage?.output_tokens) } : { ok: false as const, status: 502, output: "" };
  }
  const output = data?.content?.find((item) => item.type === "text")?.text;
  return typeof output === "string" ? { ok: true as const, status: 200, output, usage: normalizeUsage(data?.usage?.input_tokens, data?.usage?.output_tokens) } : { ok: false as const, status: 502, output: "" };
}

async function callGemini(spec: ProviderSpec, key: string, model: string, messages: Message[], maxTokens: number, toolPayload: Record<string, unknown> = {}) {
  const contents = messages.filter((item) => item.role !== "system").map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] }));
  const response = await fetch(`${spec.endpoint}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 }, ...toolPayload }),
    cache: "no-store",
    signal: providerAbortSignal(),
  }).catch(() => null);
  if (!response?.ok) return { ok: false as const, status: response?.status ?? 503, output: "" };
  const data = await responseJson(response) as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; functionCall?: { name?: unknown; args?: unknown } }> } }>; usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown } } | null;
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const functionCall = parts.find((part) => part.functionCall?.name === "propose_reviewed_plan")?.functionCall;
  if (functionCall) {
    const output = serializeClientReviewedPlan(functionCall.args);
    return output ? { ok: true as const, status: 200, output, usage: normalizeUsage(data?.usageMetadata?.promptTokenCount, data?.usageMetadata?.candidatesTokenCount) } : { ok: false as const, status: 502, output: "" };
  }
  const output = parts.map((part) => typeof part.text === "string" ? part.text : "").join("");
  return output ? { ok: true as const, status: 200, output, usage: normalizeUsage(data?.usageMetadata?.promptTokenCount, data?.usageMetadata?.candidatesTokenCount) } : { ok: false as const, status: 502, output: "" };
}

function normalizeUsage(inputTokens: unknown, outputTokens: unknown): ProviderUsage | undefined {
  return typeof inputTokens === "number" && typeof outputTokens === "number"
    && Number.isSafeInteger(inputTokens) && Number.isSafeInteger(outputTokens) && inputTokens >= 0 && outputTokens >= 0
    ? { inputTokens, outputTokens }
    : undefined;
}

function parseToolArguments(value: unknown) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function providerAbortSignal() {
  const configured = Number(process.env.CLIENT_PROVIDER_TIMEOUT_MS ?? 90_000);
  const timeout = Number.isFinite(configured) ? Math.min(120_000, Math.max(5_000, configured)) : 90_000;
  return AbortSignal.timeout(timeout);
}

async function responseJson(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body || body.length > 2_000_000) return null;
  try { return JSON.parse(body); } catch { return null; }
}
