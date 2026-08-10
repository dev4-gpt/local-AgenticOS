import { Buffer } from "node:buffer";
import { providerEnvKey } from "@/lib/providerKeys";
import { clientProviderEnabled } from "@/lib/clientRuntimePolicy";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { isPrivateAddress, readBoundedResponseBytes } from "@/lib/clientNetworkSafety";

const ELEVENLABS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
const OPENAI_IMAGE_ENDPOINT = "https://api.openai.com/v1/images/generations";
const ELEVENLABS_MUSIC_ENDPOINT = "https://api.elevenlabs.io/v1/music";
const MAX_TEXT = 10_000;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_RESPONSE_BYTES = 32 * 1024 * 1024;

export interface ClientMediaResult {
  ok: true;
  // Speech and music are separate ElevenLabs products with separate keys and
  // separate meters, so they stay distinguishable in the ledger rather than
  // both settling as "elevenlabs".
  provider: "elevenlabs" | "elevenlabs-music";
  model: string;
  fileName: string;
  contentType: "audio/mpeg";
  bytes: Buffer;
  estimatedCostMicros: number;
}

export interface ClientMediaFailure {
  ok: false;
  status: number;
  error: string;
}

export interface ClientVideoResult {
  ok: true;
  provider: "heygen";
  model: "heygen-video";
  state: "processing" | "completed" | "failed";
  providerJobId: string;
  outputUrl?: string;
  error?: string;
  estimatedCostMicros: number;
}

export interface ClientMusicResult {
  ok: true;
  provider: "suno";
  model: string;
  state: "processing" | "completed" | "failed";
  providerJobId: string;
  outputUrl?: string;
  error?: string;
  estimatedCostMicros: number;
}

export interface ClientImageResult {
  ok: true;
  provider: "openai";
  model: string;
  fileName: string;
  contentType: "image/png";
  bytes: Buffer;
  estimatedCostMicros: number;
}

export async function runClientSpeechAdapter(input: {
  text: string;
  voiceId?: string;
}): Promise<ClientMediaResult | ClientMediaFailure> {
  const text = input.text.trim();
  if (text.length < 1 || text.length > MAX_TEXT) return { ok: false, status: 400, error: "media_text_invalid" };
  if (!clientProviderEnabled("ELEVENLABS_API_KEY")) return { ok: false, status: 403, error: "provider_not_allowlisted" };

  const key = providerEnvKey("ELEVENLABS_API_KEY");
  if (!key) return { ok: false, status: 503, error: "provider_not_configured" };
  const voiceId = /^[A-Za-z0-9]{16,}$/.test(input.voiceId?.trim() ?? "")
    ? input.voiceId!.trim()
    : "21m00Tcm4TlvDq8ikWAM";
  const model = process.env.CLIENT_ELEVENLABS_MODEL?.trim() || "eleven_multilingual_v2";

  const response = await fetch(`${ELEVENLABS_ENDPOINT}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!response?.ok) return { ok: false, status: response?.status ?? 503, error: "provider_request_failed" };

  const bytes = await readBoundedResponseBytes(response, MAX_AUDIO_BYTES);
  if (!bytes || bytes.length < 1) return { ok: false, status: 502, error: "provider_output_invalid" };
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "narration";
  return {
    ok: true,
    provider: "elevenlabs",
    model,
    fileName: `${slug}.mp3`,
    contentType: "audio/mpeg",
    bytes,
    estimatedCostMicros: estimateClientMediaCostMicros(text.length),
  };
}

export async function runClientImageAdapter(input: {
  prompt: string;
  size?: string;
  quality?: string;
}): Promise<ClientImageResult | ClientMediaFailure> {
  const prompt = input.prompt.trim();
  if (prompt.length < 1 || prompt.length > 4_000 || containsClientSecretLike(prompt)) return { ok: false, status: 400, error: prompt.length > 4_000 ? "image_prompt_invalid" : "secret_like_input_rejected" };
  if (!clientProviderEnabled("OPENAI_API_KEY")) return { ok: false, status: 403, error: "provider_not_allowlisted" };
  const key = providerEnvKey("OPENAI_API_KEY");
  if (!key) return { ok: false, status: 503, error: "provider_not_configured" };

  const size = allowedImageSize(input.size);
  const quality = allowedImageQuality(input.quality);
  const model = process.env.CLIENT_IMAGE_MODEL?.trim() || "gpt-image-1";
  const response = await fetch(OPENAI_IMAGE_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, size, quality, output_format: "png", n: 1 }),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (!response?.ok) return { ok: false, status: response?.status ?? 503, error: "provider_request_failed" };
  const data = await boundedJson(response);
  const encoded = data?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || encoded.length < 1) return { ok: false, status: 502, error: "provider_output_invalid" };
  let bytes: Buffer;
  try { bytes = Buffer.from(encoded, "base64"); } catch { return { ok: false, status: 502, error: "provider_output_invalid" }; }
  if (bytes.length < 8 || bytes.length > MAX_IMAGE_BYTES || !isPng(bytes)) return { ok: false, status: 502, error: "provider_output_invalid" };
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "image";
  return {
    ok: true,
    provider: "openai",
    model,
    fileName: `${slug}.png`,
    contentType: "image/png",
    bytes,
    estimatedCostMicros: estimateClientImageCostMicros(quality, size),
  };
}

export async function runClientHeyGenAdapter(input: {
  text: string;
  avatarId?: string;
  voiceId?: string;
  providerJobId?: string;
}): Promise<ClientVideoResult | ClientMediaFailure> {
  if (!clientProviderEnabled("HEYGEN_API_KEY")) return { ok: false, status: 403, error: "provider_not_allowlisted" };
  const key = providerEnvKey("HEYGEN_API_KEY");
  if (!key) return { ok: false, status: 503, error: "provider_not_configured" };

  if (input.providerJobId) {
    const statusResponse = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(input.providerJobId)}`, {
      headers: { "X-Api-Key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!statusResponse?.ok) return { ok: false, status: statusResponse?.status ?? 503, error: "provider_status_failed" };
    const data = await statusResponse.json().catch(() => null) as { data?: { status?: string; video_url?: string; error?: { message?: string } } } | null;
    const status = data?.data?.status;
    if (status === "completed" && typeof data?.data?.video_url === "string" && safeProviderOutputUrl(data.data.video_url)) {
      return { ok: true, provider: "heygen", model: "heygen-video", state: "completed", providerJobId: input.providerJobId, outputUrl: data.data.video_url, estimatedCostMicros: estimateHeyGenCostMicros() };
    }
    if (status === "failed") return { ok: true, provider: "heygen", model: "heygen-video", state: "failed", providerJobId: input.providerJobId, error: "provider_video_failed", estimatedCostMicros: estimateHeyGenCostMicros() };
    return { ok: true, provider: "heygen", model: "heygen-video", state: "processing", providerJobId: input.providerJobId, estimatedCostMicros: estimateHeyGenCostMicros() };
  }

  const text = input.text.trim();
  const avatarId = input.avatarId?.trim() || process.env.CLIENT_HEYGEN_AVATAR_ID?.trim();
  const voiceId = input.voiceId?.trim() || process.env.CLIENT_HEYGEN_VOICE_ID?.trim();
  if (text.length < 1 || text.length > 10_000 || !avatarId || !voiceId) return { ok: false, status: 400, error: "video_input_invalid" };
  const response = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: { "X-Api-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ video_inputs: [{ character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" }, voice: { type: "text", input_text: text, voice_id: voiceId } }], dimension: { width: 1280, height: 720 } }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!response?.ok) return { ok: false, status: response?.status ?? 503, error: "provider_request_failed" };
  const data = await response.json().catch(() => null) as { data?: { video_id?: string } } | null;
  const providerJobId = data?.data?.video_id;
  if (!providerJobId) return { ok: false, status: 502, error: "provider_output_invalid" };
  return { ok: true, provider: "heygen", model: "heygen-video", state: "processing", providerJobId, estimatedCostMicros: estimateHeyGenCostMicros() };
}

/**
 * ElevenLabs music. Unlike Suno this is synchronous - the endpoint returns the
 * audio itself rather than a task id to poll - so the lane behaves like speech
 * and needs no callback URL, no status endpoint, and no stored provider job id.
 *
 * It reads ELEVENLABS_MUSIC_API_KEY rather than falling back to the speech key.
 * Music and speech are separately metered products, and silently charging a
 * speech key for music generation is the kind of surprise a spend meter exists
 * to prevent.
 */
export async function runClientElevenLabsMusicAdapter(input: {
  text: string;
  lengthMs?: number;
}): Promise<ClientMediaResult | ClientMediaFailure> {
  const prompt = input.text.trim();
  if (prompt.length < 1 || prompt.length > 3_000) return { ok: false, status: 400, error: "music_input_invalid" };
  if (!clientProviderEnabled("ELEVENLABS_MUSIC_API_KEY")) return { ok: false, status: 403, error: "provider_not_allowlisted" };
  const key = providerEnvKey("ELEVENLABS_MUSIC_API_KEY");
  if (!key) return { ok: false, status: 503, error: "provider_not_configured" };

  // The API accepts 3s to 10 minutes. Default to 30s: long enough to judge a
  // brand theme, short enough that a test run is not an expensive one.
  const requested = Number.isFinite(input.lengthMs) ? Math.round(Number(input.lengthMs)) : 30_000;
  const musicLengthMs = Math.max(3_000, Math.min(600_000, requested));
  const model = process.env.CLIENT_ELEVENLABS_MUSIC_MODEL?.trim() || "music_v1";

  const response = await fetch(ELEVENLABS_MUSIC_ENDPOINT, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ prompt, music_length_ms: musicLengthMs, model_id: model }),
    cache: "no-store",
    signal: AbortSignal.timeout(180_000),
  }).catch(() => null);
  if (!response?.ok) return { ok: false, status: response?.status ?? 503, error: "provider_request_failed" };

  const bytes = await readBoundedResponseBytes(response, MAX_AUDIO_BYTES);
  if (!bytes || bytes.length < 1) return { ok: false, status: 502, error: "provider_output_invalid" };
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "track";
  return {
    ok: true,
    provider: "elevenlabs-music",
    model,
    fileName: `${slug}.mp3`,
    contentType: "audio/mpeg",
    bytes,
    estimatedCostMicros: estimateElevenLabsMusicCostMicros(musicLengthMs),
  };
}

/**
 * Deliberately conservative. An under-counting ledger lets real spend pass the
 * cap before the guard notices, which is the dangerous direction; over-counting
 * only stops you early. Tune down with CLIENT_ELEVENLABS_MUSIC_COST_MICROS once
 * a real invoice is available.
 */
export function estimateElevenLabsMusicCostMicros(lengthMs: number) {
  const perThirtySeconds = Number(process.env.CLIENT_ELEVENLABS_MUSIC_COST_MICROS ?? 100_000);
  const base = Number.isFinite(perThirtySeconds) && perThirtySeconds >= 0 ? perThirtySeconds : 100_000;
  return Math.max(0, Math.ceil(base * (Math.max(3_000, lengthMs) / 30_000)));
}

export async function runClientMusicAdapter(input: {
  text: string;
  model?: string;
  instrumental?: boolean;
  providerJobId?: string;
}): Promise<ClientMusicResult | ClientMediaFailure> {
  if (!clientProviderEnabled("SUNO_API_KEY")) return { ok: false, status: 403, error: "provider_not_allowlisted" };
  const key = providerEnvKey("SUNO_API_KEY");
  if (!key) return { ok: false, status: 503, error: "provider_not_configured" };
  const base = (process.env.CLIENT_SUNO_API_BASE?.trim() || "https://api.sunoapi.org").replace(/\/$/, "");

  if (input.providerJobId) {
    const statusResponse = await fetch(`${base}/api/v1/generate/record-info?taskId=${encodeURIComponent(input.providerJobId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!statusResponse?.ok) return { ok: false, status: statusResponse?.status ?? 503, error: "provider_status_failed" };
    const data = await statusResponse.json().catch(() => null) as { data?: { status?: string; errorMessage?: string; response?: { sunoData?: Array<{ audioUrl?: unknown }> } }; msg?: string } | null;
    const state = String(data?.data?.status ?? "").toUpperCase();
    if (/FAIL|SENSITIVE|ERROR/.test(state)) return { ok: true, provider: "suno", model: input.model || "V4_5", state: "failed", providerJobId: input.providerJobId, error: "provider_music_failed", estimatedCostMicros: estimateSunoCostMicros() };
    const outputUrl = data?.data?.response?.sunoData?.find((clip) => typeof clip.audioUrl === "string")?.audioUrl;
    if (state === "SUCCESS" && typeof outputUrl === "string" && safeProviderOutputUrl(outputUrl)) {
      return { ok: true, provider: "suno", model: input.model || "V4_5", state: "completed", providerJobId: input.providerJobId, outputUrl, estimatedCostMicros: estimateSunoCostMicros() };
    }
    return { ok: true, provider: "suno", model: input.model || "V4_5", state: "processing", providerJobId: input.providerJobId, estimatedCostMicros: estimateSunoCostMicros() };
  }

  const description = input.text.trim();
  if (description.length < 1 || description.length > 3_000) return { ok: false, status: 400, error: "music_input_invalid" };
  const model = input.model?.trim() || process.env.CLIENT_SUNO_MODEL?.trim() || "V4_5";
  const response = await fetch(`${base}/api/v1/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ customMode: true, instrumental: input.instrumental !== false, style: description.slice(0, 1_000), title: "Veloce client track", model, callBackUrl: process.env.CLIENT_SUNO_CALLBACK_URL || "https://example.com/suno-callback" }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!response?.ok) return { ok: false, status: response?.status ?? 503, error: "provider_request_failed" };
  const data = await response.json().catch(() => null) as { data?: { taskId?: unknown }; msg?: string } | null;
  const providerJobId = typeof data?.data?.taskId === "string" ? data.data.taskId : "";
  if (!providerJobId) return { ok: false, status: 502, error: "provider_output_invalid" };
  return { ok: true, provider: "suno", model, state: "processing", providerJobId, estimatedCostMicros: estimateSunoCostMicros() };
}

export function safeProviderOutputUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !isPrivateAddress(url.hostname);
  } catch {
    return false;
  }
}

function allowedImageSize(value?: string) {
  return value === "1024x1536" || value === "1536x1024" ? value : "1024x1024";
}

function allowedImageQuality(value?: string) {
  return value === "low" || value === "medium" || value === "high" ? value : "auto";
}

export function estimateClientImageCostMicros(quality: string, size: string) {
  const configured = Number(process.env.CLIENT_OPENAI_IMAGE_COST_MICROS ?? 40_000);
  const base = Number.isFinite(configured) && configured >= 0 ? Math.round(configured) : 40_000;
  const qualityMultiplier = quality === "high" ? 2 : quality === "medium" ? 1.5 : 1;
  const sizeMultiplier = size === "1024x1024" ? 1 : 1.5;
  return Math.max(0, Math.ceil(base * qualityMultiplier * sizeMultiplier));
}

async function boundedJson(response: Response) {
  const body = await response.text().catch(() => "");
  if (!body || body.length > MAX_IMAGE_RESPONSE_BYTES) return null;
  try {
    return JSON.parse(body) as { data?: Array<{ b64_json?: unknown }> };
  } catch {
    return null;
  }
}

function isPng(bytes: Buffer) {
  return bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function estimateHeyGenCostMicros() {
  return Math.max(0, Math.round(Number(process.env.CLIENT_HEYGEN_COST_MICROS ?? 100_000)));
}

function estimateSunoCostMicros() {
  return Math.max(0, Math.round(Number(process.env.CLIENT_SUNO_COST_MICROS ?? 100_000)));
}

export function estimateClientMediaCostMicros(characters: number) {
  let perThousand = Number(process.env.CLIENT_ELEVENLABS_COST_MICROS_PER_1K_CHARS ?? 3000);
  try {
    const pricing = JSON.parse(process.env.CLIENT_MEDIA_PRICING_JSON ?? "{}");
    if (Number.isFinite(pricing?.elevenlabs?.inputMicrosPer1k)) perThousand = Number(pricing.elevenlabs.inputMicrosPer1k);
  } catch {
    /* Use the conservative manifest default. */
  }
  return Math.max(0, Math.ceil((Math.max(0, characters) / 1000) * perThousand));
}

export function clientMediaMaxText() {
  return MAX_TEXT;
}
