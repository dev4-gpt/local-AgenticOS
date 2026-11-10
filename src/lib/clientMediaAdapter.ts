import { clientExecutionCredential } from "@/lib/clientExecutionCredential";
import { Buffer } from "node:buffer";
import { clientProviderEnabled } from "@/lib/clientRuntimePolicy";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { isPrivateAddress, readBoundedResponseBytes } from "@/lib/clientNetworkSafety";
import {
  buildHiggsfieldRequest,
  higgsfieldEstimateUrl,
  higgsfieldModel,
  higgsfieldOutcome,
  higgsfieldStatusUrl,
  higgsfieldSubmitUrl,
  isHiggsfieldCredential,
  isHiggsfieldRequestId,
  type HiggsfieldModel,
} from "@/lib/higgsfieldCatalog";

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

  const key = await clientExecutionCredential("ELEVENLABS_API_KEY");
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

/**
 * The upstream error code, not just "the request failed".
 *
 * A 429 from OpenAI means two very different things: a real rate limit, which
 * resolves by waiting, or `insufficient_quota`, which means the account has no
 * credit and waiting will never help. Collapsing both into one code sent a
 * debugging session to the Cloud Run logs to learn something the response
 * already said.
 *
 * Only the provider's short machine code is surfaced. The message body can
 * echo request content, so it is deliberately not propagated.
 */
async function imageFailureCode(response: Response | null) {
  if (!response) return "provider_unreachable";
  const body = await response.text().catch(() => "");
  let code = "";
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown; type?: unknown } };
    const raw = parsed?.error?.code ?? parsed?.error?.type;
    if (typeof raw === "string") code = raw.trim().slice(0, 40).replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  } catch { /* fall through to the status-derived code */ }
  if (code) return `provider_${code}`;
  if (response.status === 429) return "provider_rate_limited_or_no_quota";
  if (response.status === 401 || response.status === 403) return "provider_key_rejected";
  return "provider_request_failed";
}

export async function runClientImageAdapter(input: {
  prompt: string;
  size?: string;
  quality?: string;
}): Promise<ClientImageResult | ClientMediaFailure> {
  const prompt = input.prompt.trim();
  if (prompt.length < 1 || prompt.length > 4_000 || containsClientSecretLike(prompt)) return { ok: false, status: 400, error: prompt.length > 4_000 ? "image_prompt_invalid" : "secret_like_input_rejected" };
  if (!clientProviderEnabled("OPENAI_API_KEY")) return { ok: false, status: 403, error: "provider_not_allowlisted" };
  const key = await clientExecutionCredential("OPENAI_API_KEY");
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
  if (!response?.ok) return { ok: false, status: response?.status ?? 503, error: await imageFailureCode(response) };
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
  const key = await clientExecutionCredential("HEYGEN_API_KEY");
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
  const key = await clientExecutionCredential("ELEVENLABS_MUSIC_API_KEY");
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
  const key = await clientExecutionCredential("SUNO_API_KEY");
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

export interface ClientHiggsfieldQuote {
  ok: true;
  provider: "higgsfield";
  model: string;
  estimatedCostMicros: number;
}

export interface ClientHiggsfieldResult {
  ok: true;
  provider: "higgsfield";
  model: string;
  state: "processing" | "completed" | "failed";
  providerJobId: string;
  outputUrls?: string[];
  error?: string;
}

const MAX_HIGGSFIELD_RESPONSE_BYTES = 256 * 1024;
// A single quote above this is refused rather than reserved; it is far beyond any documented clip.
const MAX_HIGGSFIELD_QUOTE_MICROS = 50_000_000;

/**
 * Higgsfield image and video (Phase 6, off by default). The client's own key, "id:secret", goes through the same
 * execution gate as every other provider key and is sent only in the Authorization header. Nothing here logs:
 * prompts and result links stay out of every log (ADR-013). The order is quote, reserve in the budget, submit with
 * the job's idempotency key, then poll. Higgsfield keeps results for at least seven days, so a completed result is
 * copied into the client's own storage by the caller straight away.
 */
export async function quoteClientHiggsfield(input: {
  model: string;
  prompt: string;
  settings?: Record<string, unknown>;
}): Promise<ClientHiggsfieldQuote | ClientMediaFailure> {
  const request = higgsfieldRequest(input);
  if (!request.ok) return request;
  const key = await higgsfieldKey();
  if (typeof key !== "string") return key;
  const response = await fetch(higgsfieldEstimateUrl(request.model), {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response?.ok) return { ok: false, status: response?.status ?? 503, error: higgsfieldFailureCode(response) };
  const data = await higgsfieldJson(response);
  const usd = typeof data?.usd === "string" || typeof data?.usd === "number" ? Number(data.usd) : Number.NaN;
  if (!Number.isFinite(usd) || usd < 0) return { ok: false, status: 502, error: "provider_estimate_invalid" };
  const estimatedCostMicros = Math.ceil(usd * 1_000_000);
  if (estimatedCostMicros > MAX_HIGGSFIELD_QUOTE_MICROS) return { ok: false, status: 400, error: "provider_estimate_over_limit" };
  return { ok: true, provider: "higgsfield", model: request.model.id, estimatedCostMicros };
}

export async function runClientHiggsfieldAdapter(input: {
  model: string;
  prompt?: string;
  settings?: Record<string, unknown>;
  idempotencyKey?: string;
  providerJobId?: string;
}): Promise<ClientHiggsfieldResult | ClientMediaFailure> {
  if (input.providerJobId !== undefined) {
    const model = higgsfieldModel(input.model);
    if (!model) return { ok: false, status: 400, error: "higgsfield_model_unknown" };
    if (!isHiggsfieldRequestId(input.providerJobId)) return { ok: false, status: 400, error: "provider_job_invalid" };
    const key = await higgsfieldKey();
    if (typeof key !== "string") return key;
    const response = await fetch(higgsfieldStatusUrl(input.providerJobId), {
      headers: { Authorization: `Key ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!response?.ok) {
      const code = higgsfieldFailureCode(response);
      return { ok: false, status: response?.status ?? 503, error: code === "provider_request_failed" ? "provider_status_failed" : code };
    }
    const data = await higgsfieldJson(response);
    if (!data || data.request_id !== input.providerJobId) return { ok: false, status: 502, error: "provider_output_invalid" };
    const outcome = higgsfieldOutcome(data.status);
    const base = { ok: true as const, provider: "higgsfield" as const, model: model.id, providerJobId: input.providerJobId };
    if (outcome.state === "completed") {
      const outputUrls = higgsfieldOutputUrls(data, model);
      if (!outputUrls) return { ok: false, status: 502, error: "provider_output_invalid" };
      return { ...base, state: "completed", outputUrls };
    }
    return outcome.error ? { ...base, state: outcome.state, error: outcome.error } : { ...base, state: outcome.state };
  }

  const request = higgsfieldRequest({ model: input.model, prompt: input.prompt ?? "", settings: input.settings });
  if (!request.ok) return request;
  // Without the job's own key a timed-out submit could be retried into a second, separately charged generation.
  const idempotencyKey = input.idempotencyKey ?? "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) return { ok: false, status: 400, error: "higgsfield_idempotency_key_required" };
  const key = await higgsfieldKey();
  if (typeof key !== "string") return key;
  const response = await fetch(higgsfieldSubmitUrl(request.model), {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(request.body),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!response?.ok) return { ok: false, status: response?.status ?? 503, error: higgsfieldFailureCode(response) };
  const data = await higgsfieldJson(response);
  const providerJobId = data?.request_id;
  if (!isHiggsfieldRequestId(providerJobId)) return { ok: false, status: 502, error: "provider_output_invalid" };
  return { ok: true, provider: "higgsfield", model: request.model.id, state: "processing", providerJobId };
}

function higgsfieldRequest(input: { model: string; prompt: string; settings?: Record<string, unknown> }):
  | { ok: true; model: HiggsfieldModel; body: Record<string, unknown> }
  | ClientMediaFailure {
  if (containsClientSecretLike(input.prompt)) return { ok: false, status: 400, error: "secret_like_input_rejected" };
  const built = buildHiggsfieldRequest(input.model, input.prompt, input.settings ?? {});
  return built.ok ? { ok: true, model: built.model, body: built.body } : { ok: false, status: 400, error: built.error };
}

async function higgsfieldKey(): Promise<string | ClientMediaFailure> {
  if (!clientProviderEnabled("HIGGSFIELD_API_KEY")) return { ok: false, status: 403, error: "provider_not_allowlisted" };
  const key = await clientExecutionCredential("HIGGSFIELD_API_KEY");
  if (!key || !isHiggsfieldCredential(key)) return { ok: false, status: 503, error: "provider_not_configured" };
  return key;
}

/** Status-derived codes only: a Higgsfield error body can echo the prompt, so it is never read into a result or a log. */
function higgsfieldFailureCode(response: Response | null) {
  if (!response) return "provider_unreachable";
  if (response.status === 401) return "provider_key_rejected";
  if (response.status === 404 || response.status === 423 || response.status === 503) return "provider_model_unavailable";
  if (response.status === 429) return "provider_rate_limited";
  return "provider_request_failed";
}

async function higgsfieldJson(response: Response): Promise<Record<string, unknown> | null> {
  const bytes = await readBoundedResponseBytes(response, MAX_HIGGSFIELD_RESPONSE_BYTES).catch(() => null);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Every output link must be safe; one unsafe link rejects the whole result rather than passing the rest through. */
function higgsfieldOutputUrls(data: Record<string, unknown>, model: HiggsfieldModel): string[] | null {
  const raw: unknown[] = model.output === "video"
    ? [(data.video as { url?: unknown } | undefined)?.url]
    : Array.isArray(data.images) ? data.images.slice(0, 4).map((image) => (image as { url?: unknown } | null)?.url) : [];
  if (raw.length < 1 || !raw.every((url) => typeof url === "string" && safeProviderOutputUrl(url))) return null;
  return raw as string[];
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
