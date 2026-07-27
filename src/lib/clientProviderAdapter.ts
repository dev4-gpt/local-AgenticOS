import { clientProviderEnabled } from "@/lib/clientRuntimePolicy";
import { providerEnvKey, openRouterKey } from "@/lib/providerKeys";
import { reserveClientRuntimeBudget } from "@/lib/clientDataPlane";

type Message = { role: "system" | "user" | "assistant"; content: string };

interface ProviderSpec {
  key: string;
  protocol: "openai" | "anthropic" | "gemini";
  endpoint: string;
  defaultModel: string;
}

const PROVIDERS: Record<string, ProviderSpec> = {
  anthropic: { key: "ANTHROPIC_API_KEY", protocol: "anthropic", endpoint: "https://api.anthropic.com/v1/messages", defaultModel: "claude-3-5-haiku-latest" },
  openai: { key: "OPENAI_API_KEY", protocol: "openai", endpoint: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o-mini" },
  openrouter: { key: "OPENROUTER_API_KEY", protocol: "openai", endpoint: "https://openrouter.ai/api/v1/chat/completions", defaultModel: "openai/gpt-4o-mini" },
  moonshot: { key: "MOONSHOT_API_KEY", protocol: "openai", endpoint: "https://api.moonshot.ai/v1/chat/completions", defaultModel: "moonshot-v1-8k" },
  glm: { key: "GLM_API_KEY", protocol: "openai", endpoint: "https://api.z.ai/api/coding/paas/v4/chat/completions", defaultModel: "glm-5.2" },
  xai: { key: "XAI_API_KEY", protocol: "openai", endpoint: "https://api.x.ai/v1/chat/completions", defaultModel: "grok-3-mini" },
  sakana: { key: "SAKANA_API_KEY", protocol: "openai", endpoint: "https://api.sakana.ai/v1/chat/completions", defaultModel: "fugu-ultra-20260615" },
  gemini: { key: "GEMINI_API_KEY", protocol: "gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", defaultModel: "gemini-2.0-flash" },
};

export function clientProviderNames() {
  return Object.keys(PROVIDERS);
}

export function clientProviderDefaultModel(provider: string) {
  return PROVIDERS[provider.trim().toLowerCase()]?.defaultModel ?? null;
}

export async function runClientTextAdapter(input: {
  provider: string;
  model?: string;
  prompt: string;
  history?: Message[];
  reserveBudget?: boolean;
  jobId?: string;
}) {
  const provider = input.provider.trim().toLowerCase();
  const spec = PROVIDERS[provider];
  if (!spec || !clientProviderEnabled(spec.key)) return { ok: false as const, status: 403, error: "provider_not_allowlisted" };
  const model = input.model?.trim() || spec.defaultModel;
  const models = configuredModels();
  if (models.length === 0 || !models.includes(model)) return { ok: false as const, status: 403, error: "model_not_allowlisted" };
  if (input.prompt.length < 1 || input.prompt.length > 20000) return { ok: false as const, status: 400, error: "prompt_invalid" };

  const key = spec.key === "OPENROUTER_API_KEY" ? openRouterKey() : providerEnvKey(spec.key);
  if (!key) return { ok: false as const, status: 503, error: "provider_not_configured" };
  const messages: Message[] = [
    ...(input.history ?? []).slice(-16).filter((item) => item && typeof item.content === "string"),
    { role: "user", content: input.prompt },
  ];
  const maxOutputTokens = Math.min(4096, Math.max(256, Number(process.env.CLIENT_MAX_OUTPUT_TOKENS ?? 2048)));
  const estimate = estimateClientTextCostMicros(model, messages, maxOutputTokens);
  if (estimate === null) return { ok: false as const, status: 503, error: "model_pricing_not_configured" };
  if (input.reserveBudget !== false && !(await reserveClientRuntimeBudget(provider, model, estimate, input.jobId))) {
    return { ok: false as const, status: 429, error: "budget_exceeded" };
  }

  const response = spec.protocol === "anthropic"
    ? await callAnthropic(spec, key, model, messages, maxOutputTokens)
    : spec.protocol === "gemini"
      ? await callGemini(spec, key, model, messages, maxOutputTokens)
      : await callOpenAiCompatible(spec, key, model, messages, maxOutputTokens);
  if (!response.ok) return { ok: false as const, status: response.status, error: "provider_request_failed" };
  return { ok: true as const, provider, model, output: response.output };
}

function configuredModels() {
  return (process.env.CLIENT_MODEL_ALLOWLIST ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

export function estimateClientTextCostMicros(model: string, messages: Message[], maxOutputTokens: number) {
  let pricing: Record<string, { inputMicrosPer1k: number; outputMicrosPer1k: number }>;
  try { pricing = JSON.parse(process.env.CLIENT_MODEL_PRICING_JSON ?? "{}"); } catch { return null; }
  const rate = pricing[model];
  if (!rate || !Number.isFinite(rate.inputMicrosPer1k) || !Number.isFinite(rate.outputMicrosPer1k)) return null;
  const inputTokens = Math.ceil(messages.reduce((total, item) => total + item.content.length, 0) / 4);
  return Math.ceil((inputTokens / 1000) * rate.inputMicrosPer1k + (maxOutputTokens / 1000) * rate.outputMicrosPer1k);
}

export function clientTextMaxOutputTokens() {
  return Math.min(4096, Math.max(256, Number(process.env.CLIENT_MAX_OUTPUT_TOKENS ?? 2048)));
}

async function callOpenAiCompatible(spec: ProviderSpec, key: string, model: string, messages: Message[], maxTokens: number) {
  const response = await fetch(spec.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2 }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return { ok: false as const, status: response?.status ?? 503, output: "" };
  const data = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
  const output = data?.choices?.[0]?.message?.content;
  return typeof output === "string" ? { ok: true as const, status: 200, output } : { ok: false as const, status: 502, output: "" };
}

async function callAnthropic(spec: ProviderSpec, key: string, model: string, messages: Message[], maxTokens: number) {
  const system = messages.filter((item) => item.role === "system").map((item) => item.content).join("\n");
  const response = await fetch(spec.endpoint, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, system: system || undefined, messages: messages.filter((item) => item.role !== "system"), max_tokens: maxTokens }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return { ok: false as const, status: response?.status ?? 503, output: "" };
  const data = await response.json().catch(() => null) as { content?: Array<{ type?: string; text?: unknown }> } | null;
  const output = data?.content?.find((item) => item.type === "text")?.text;
  return typeof output === "string" ? { ok: true as const, status: 200, output } : { ok: false as const, status: 502, output: "" };
}

async function callGemini(spec: ProviderSpec, key: string, model: string, messages: Message[], maxTokens: number) {
  const contents = messages.filter((item) => item.role !== "system").map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] }));
  const response = await fetch(`${spec.endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 } }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return { ok: false as const, status: response?.status ?? 503, output: "" };
  const data = await response.json().catch(() => null) as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> } | null;
  const output = data?.candidates?.[0]?.content?.parts?.map((part) => typeof part.text === "string" ? part.text : "").join("");
  return output ? { ok: true as const, status: 200, output } : { ok: false as const, status: 502, output: "" };
}
