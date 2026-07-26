export interface ClientCredentialOption {
  key: string;
  label: string;
  category: string;
  secret: boolean;
}

export const CLIENT_CREDENTIAL_OPTIONS: readonly ClientCredentialOption[] = [
  { key: "OPENAI_API_KEY", label: "OpenAI", category: "Models", secret: true },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic", category: "Models", secret: true },
  { key: "OPENROUTER_API_KEY", label: "OpenRouter", category: "Models", secret: true },
  { key: "GEMINI_API_KEY", label: "Google Gemini", category: "Models", secret: true },
  { key: "MOONSHOT_API_KEY", label: "Moonshot / Kimi", category: "Models", secret: true },
  { key: "GLM_API_KEY", label: "GLM / Z.ai", category: "Models", secret: true },
  { key: "XAI_API_KEY", label: "xAI / Grok", category: "Models", secret: true },
  { key: "SAKANA_API_KEY", label: "Sakana Fugu", category: "Models", secret: true },
  { key: "ELEVENLABS_API_KEY", label: "ElevenLabs", category: "Audio", secret: true },
  { key: "ELEVENLABS_MUSIC_API_KEY", label: "ElevenLabs Music", category: "Audio", secret: true },
  { key: "HEYGEN_API_KEY", label: "HeyGen", category: "Video", secret: true },
  { key: "SUNO_API_KEY", label: "Suno", category: "Audio", secret: true },
  { key: "FIRECRAWL_API_KEY", label: "Firecrawl", category: "Research", secret: true },
  { key: "HUNTER_API_KEY", label: "Hunter", category: "Growth", secret: true },
  { key: "SUPABASE_URL", label: "Supabase URL", category: "Data", secret: false },
  { key: "SUPABASE_ANON_KEY", label: "Supabase publishable key", category: "Data", secret: true },
] as const;

export function clientCredentialOption(key: string) {
  return CLIENT_CREDENTIAL_OPTIONS.find((option) => option.key === key) ?? null;
}
