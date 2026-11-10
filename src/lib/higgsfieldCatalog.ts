/**
 * The Higgsfield models a client can use through Veloce, and exactly which settings each one accepts.
 *
 * Endpoints and settings come from Higgsfield's own documentation (docs.higgsfield.ai, checked 2026-10-21). Veloce
 * sends only what is declared here: an unknown model or an undeclared setting is refused, never passed through, so a
 * client cannot reach a model or a parameter nobody reviewed. Adding a model means adding an entry and its tests.
 *
 * Prices are deliberately not listed. Higgsfield does not publish a fixed per-model price; its estimate endpoint returns
 * the amount for the client's own account, and the adapter reserves that before submitting (clientMediaAdapter.ts).
 * The client brings their own key (key ID and secret, joined as "id:secret"); it is used server-side only.
 */

export const HIGGSFIELD_API_BASE = "https://api.higgsfield.ai";

export type HiggsfieldOutput = "image" | "video";

export type HiggsfieldSetting =
  | { kind: "choice"; values: readonly (string | number)[]; fallback: string | number }
  | { kind: "range"; min: number; max: number; fallback: number; step: number }
  | { kind: "toggle"; fallback: boolean };

export interface HiggsfieldModel {
  id: string;
  label: string;
  output: HiggsfieldOutput;
  endpoint: string;
  maxPromptChars: number;
  settings: Readonly<Record<string, HiggsfieldSetting>>;
}

const VIDEO_RATIOS_WIDE = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const;

export const HIGGSFIELD_MODELS: readonly HiggsfieldModel[] = [
  {
    id: "seedance-2.5",
    label: "Seedance 2.5, text to video",
    output: "video",
    endpoint: "bytedance/seedance-2.5/text-to-video",
    maxPromptChars: 2_500,
    settings: {
      duration: { kind: "range", min: 4, max: 30, fallback: 5, step: 1 },
      resolution: { kind: "choice", values: ["480p", "720p", "1080p"], fallback: "720p" },
      aspect_ratio: { kind: "choice", values: VIDEO_RATIOS_WIDE, fallback: "16:9" },
      output_format: { kind: "choice", values: ["mp4", "mov"], fallback: "mp4" },
      generate_audio: { kind: "toggle", fallback: true },
    },
  },
  {
    id: "kling-3-standard",
    label: "Kling 3.0 Standard, text to video",
    output: "video",
    endpoint: "kling-video/v3.0/std/text-to-video",
    // Higgsfield truncates Kling prompts above 2,500 characters; refusing is clearer than silent truncation.
    maxPromptChars: 2_500,
    settings: {
      duration: { kind: "range", min: 3, max: 15, fallback: 5, step: 1 },
      aspect_ratio: { kind: "choice", values: ["16:9", "9:16", "1:1"], fallback: "16:9" },
      sound: { kind: "choice", values: ["on", "off"], fallback: "on" },
      cfg_scale: { kind: "range", min: 0, max: 1, fallback: 0.5, step: 0.01 },
    },
  },
  {
    id: "soul-2",
    label: "Soul 2, text to image",
    output: "image",
    endpoint: "higgsfield-ai/soul/v2/standard",
    maxPromptChars: 2_500,
    settings: {
      aspect_ratio: { kind: "choice", values: ["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"], fallback: "1:1" },
      resolution: { kind: "choice", values: ["720p", "1080p"], fallback: "720p" },
      batch_size: { kind: "choice", values: [1, 4], fallback: 1 },
      enhance_prompt: { kind: "toggle", fallback: false },
    },
  },
];

export function higgsfieldModel(id: unknown): HiggsfieldModel | null {
  return typeof id === "string" ? HIGGSFIELD_MODELS.find((model) => model.id === id) ?? null : null;
}

export type HiggsfieldRequest =
  | { ok: true; model: HiggsfieldModel; endpoint: string; body: Record<string, unknown> }
  | { ok: false; error: string };

/** The exact request body for one model: the prompt plus every declared setting, defaults filled in, nothing else. */
export function buildHiggsfieldRequest(modelId: unknown, prompt: unknown, settings: unknown = {}): HiggsfieldRequest {
  const model = higgsfieldModel(modelId);
  if (!model) return { ok: false, error: "higgsfield_model_unknown" };
  const text = typeof prompt === "string" ? prompt.trim() : "";
  if (text.length < 1 || text.length > model.maxPromptChars) return { ok: false, error: "higgsfield_prompt_invalid" };
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) return { ok: false, error: "higgsfield_settings_invalid" };
  const given = settings as Record<string, unknown>;
  if (Object.keys(given).some((key) => !Object.hasOwn(model.settings, key))) return { ok: false, error: "higgsfield_setting_unknown" };

  const body: Record<string, unknown> = { prompt: text };
  for (const [key, setting] of Object.entries(model.settings)) {
    const value = Object.hasOwn(given, key) ? given[key] : setting.fallback;
    if (setting.kind === "choice") {
      if (!setting.values.includes(value as string | number)) return { ok: false, error: "higgsfield_setting_invalid" };
    } else if (setting.kind === "range") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < setting.min || value > setting.max) {
        return { ok: false, error: "higgsfield_setting_invalid" };
      }
      // Whole steps only (1 for seconds, 0.01 for a strength), checked on a rounded count to avoid float noise.
      const steps = (value - setting.min) / setting.step;
      if (Math.abs(steps - Math.round(steps)) > 1e-9) return { ok: false, error: "higgsfield_setting_invalid" };
    } else if (typeof value !== "boolean") {
      return { ok: false, error: "higgsfield_setting_invalid" };
    }
    body[key] = value;
  }
  return { ok: true, model, endpoint: model.endpoint, body };
}

/** A Higgsfield credential is a key ID and a secret joined by one colon, with no spaces. Nothing else is accepted. */
export function isHiggsfieldCredential(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512 && /^[A-Za-z0-9._-]{2,200}:[A-Za-z0-9._-]{8,300}$/.test(value);
}

/** Request ids are UUIDs. A status call is always built from Higgsfield's own address, never from a URL a response sent. */
export function isHiggsfieldRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function higgsfieldStatusUrl(requestId: string) {
  return `${HIGGSFIELD_API_BASE}/requests/${encodeURIComponent(requestId)}/status`;
}

export function higgsfieldSubmitUrl(model: HiggsfieldModel) {
  return `${HIGGSFIELD_API_BASE}/${model.endpoint}`;
}

export function higgsfieldEstimateUrl(model: HiggsfieldModel) {
  return `${HIGGSFIELD_API_BASE}/estimate/${model.endpoint}`;
}

/** Higgsfield's terminal states, mapped to Veloce's. Failed and moderated requests are not charged by Higgsfield. */
export function higgsfieldOutcome(status: unknown): { state: "processing" | "completed" | "failed"; error?: string } {
  if (status === "completed") return { state: "completed" };
  if (status === "failed") return { state: "failed", error: "provider_generation_failed" };
  if (status === "nsfw") return { state: "failed", error: "provider_content_rejected" };
  if (status === "canceled") return { state: "failed", error: "provider_generation_canceled" };
  return { state: "processing" };
}
