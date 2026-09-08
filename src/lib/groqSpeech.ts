import { clientExecutionCredential } from "@/lib/clientExecutionCredential";
import { providerEnvKey } from "@/lib/providerKeys";

export const GROQ_STT_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
export const GROQ_STT_MODEL = "whisper-large-v3-turbo";
export const GROQ_STT_MAX_BYTES = 25 * 1024 * 1024;

export type GroqTranscription = {
  text: string;
  requestId: string | null;
  model: string;
};

export function groqSpeechConfigured() {
  return Boolean(providerEnvKey("GROQ_API_KEY"));
}

/**
 * Server-only Groq transcription boundary. The browser never receives the
 * provider key; every microphone surface posts a bounded recording here.
 */
export async function transcribeWithGroq(input: {
  audio: Buffer;
  filename: string;
  contentType: string;
  language?: string;
  prompt?: string;
}): Promise<GroqTranscription> {
  if (input.audio.length < 1 || input.audio.length > GROQ_STT_MAX_BYTES) {
    throw new Error("groq_audio_size_invalid");
  }
  const key = await clientExecutionCredential("GROQ_API_KEY");
  if (!key) throw new Error("groq_not_configured");

  const form = new FormData();
  const audioBytes = new Uint8Array(input.audio.length);
  audioBytes.set(input.audio);
  form.set("file", new Blob([audioBytes.buffer as ArrayBuffer], { type: input.contentType }), input.filename);
  form.set("model", GROQ_STT_MODEL);
  form.set("response_format", "json");
  form.set("temperature", "0");
  const language = input.language?.trim().match(/^[a-z]{2}$/i)?.[0].toLowerCase();
  if (language) form.set("language", language);
  const prompt = input.prompt?.trim().slice(0, 800);
  if (prompt) form.set("prompt", prompt);

  const response = await fetch(GROQ_STT_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as {
    text?: unknown;
    error?: { message?: unknown };
    x_groq?: { id?: unknown };
  };
  if (!response.ok) {
    const reason = typeof body.error?.message === "string" ? body.error.message.slice(0, 160) : `http_${response.status}`;
    throw new Error(`groq_transcription_failed:${reason}`);
  }
  return {
    text: typeof body.text === "string" ? body.text.trim() : "",
    requestId: typeof body.x_groq?.id === "string" ? body.x_groq.id : null,
    model: GROQ_STT_MODEL,
  };
}
