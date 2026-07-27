export type ClientProviderProtocol = "openai" | "anthropic" | "gemini";
export type ClientProviderToolMode = "none" | "reviewed-plan";

export type ClientProviderContract = {
  protocol: ClientProviderProtocol;
  workspace: "tenant-records" | "tenant-workflow" | "tenant-code-plan" | "tenant-media";
  toolMode: ClientProviderToolMode;
  maxPromptChars: number;
  maxHistoryMessages: number;
  maxOutputTokens: number;
  attribution: "none" | "openrouter";
};

const CONTRACTS: Record<string, ClientProviderContract> = {
  anthropic: { protocol: "anthropic", workspace: "tenant-records", toolMode: "none", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  openai: { protocol: "openai", workspace: "tenant-records", toolMode: "none", maxPromptChars: 20000, maxHistoryMessages: 16, maxOutputTokens: 4096, attribution: "none" },
  codex: { protocol: "openai", workspace: "tenant-code-plan", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 10, maxOutputTokens: 4096, attribution: "none" },
  openrouter: { protocol: "openai", workspace: "tenant-workflow", toolMode: "none", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 3072, attribution: "openrouter" },
  openclaw: { protocol: "openai", workspace: "tenant-workflow", toolMode: "reviewed-plan", maxPromptChars: 14000, maxHistoryMessages: 8, maxOutputTokens: 3072, attribution: "openrouter" },
  hermes: { protocol: "openai", workspace: "tenant-workflow", toolMode: "reviewed-plan", maxPromptChars: 14000, maxHistoryMessages: 8, maxOutputTokens: 3072, attribution: "openrouter" },
  freeclaude: { protocol: "openai", workspace: "tenant-records", toolMode: "none", maxPromptChars: 12000, maxHistoryMessages: 8, maxOutputTokens: 2048, attribution: "openrouter" },
  fusion: { protocol: "openai", workspace: "tenant-workflow", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 10, maxOutputTokens: 3072, attribution: "openrouter" },
  moonshot: { protocol: "openai", workspace: "tenant-code-plan", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  kimi: { protocol: "openai", workspace: "tenant-code-plan", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  glm: { protocol: "openai", workspace: "tenant-code-plan", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  "glm-code": { protocol: "openai", workspace: "tenant-code-plan", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  xai: { protocol: "openai", workspace: "tenant-records", toolMode: "none", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 3072, attribution: "none" },
  grok: { protocol: "openai", workspace: "tenant-records", toolMode: "none", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 3072, attribution: "none" },
  sakana: { protocol: "openai", workspace: "tenant-workflow", toolMode: "reviewed-plan", maxPromptChars: 14000, maxHistoryMessages: 8, maxOutputTokens: 3072, attribution: "none" },
  gemini: { protocol: "gemini", workspace: "tenant-records", toolMode: "none", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  antigravity: { protocol: "gemini", workspace: "tenant-workflow", toolMode: "reviewed-plan", maxPromptChars: 14000, maxHistoryMessages: 8, maxOutputTokens: 4096, attribution: "none" },
};

export function clientProviderContract(provider: string) {
  return CONTRACTS[provider.trim().toLowerCase()] ?? null;
}

export function clientProviderContractNames() {
  return Object.keys(CONTRACTS);
}

export function clientProviderAttributionHeaders(provider: string) {
  const contract = clientProviderContract(provider);
  if (contract?.attribution !== "openrouter") return {};
  const referer = process.env.CLIENT_RUNTIME_BASE_URL?.trim();
  return {
    ...(referer ? { "HTTP-Referer": referer } : {}),
    "X-Title": "Veloce Client Runtime",
  };
}
