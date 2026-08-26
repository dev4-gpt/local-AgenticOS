export type ManagedVideoPrice = {
  microsPerSecond: number;
  durations: number[];
  resolutions: string[];
  aspectRatios: string[];
};

export type ManagedVideoPricing = Record<string, ManagedVideoPrice>;

export type ManagedVideoInput = {
  model: string;
  prompt: string;
  duration: number;
  resolution: string;
  aspect_ratio: string;
  generate_audio: false;
  input_references?: Array<{ type: "image_url"; image_url: { url: string } }>;
  frame_images?: Array<{ type: "image_url"; image_url: { url: string }; frame_type: "first_frame" | "last_frame" }>;
  seed?: number;
};

export type ManagedVideoQuote = {
  estimatedMicros: number;
  currency: "usd";
  pricingSnapshotId: string;
  expiresAt: string;
};

/**
 * Normalizes the only video fields Veloce will ever forward. The reviewed
 * pricing snapshot is also the capability allowlist, so a marketing-page
 * model name or a provider passthrough value cannot create a paid job.
 */
export function normalizeManagedVideoInput(value: unknown, pricing: ManagedVideoPricing): ManagedVideoInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const model = string(input.model);
  const prompt = string(input.prompt);
  const duration = Number(input.duration);
  const resolution = string(input.resolution);
  const aspectRatio = string(input.aspect_ratio);
  const rate = pricing[model];
  if (!rate || !prompt || prompt.length > 4_000 || !Number.isSafeInteger(duration)) return null;
  if (!rate.durations.includes(duration) || !rate.resolutions.includes(resolution) || !rate.aspectRatios.includes(aspectRatio)) return null;
  const output: ManagedVideoInput = { model, prompt, duration, resolution, aspect_ratio: aspectRatio, generate_audio: false };
  const references = imageReferences(input.input_references);
  const frames = frameImages(input.frame_images);
  if (input.input_references !== undefined && !references) return null;
  if (input.frame_images !== undefined && !frames) return null;
  if (references) output.input_references = references;
  if (frames) output.frame_images = frames;
  if (Number.isSafeInteger(Number(input.seed))) output.seed = Number(input.seed);
  return output;
}

export function quoteManagedVideo(input: ManagedVideoInput, pricing: ManagedVideoPricing, pricingSnapshotId: string): ManagedVideoQuote {
  const rate = pricing[input.model];
  const microsPerSecond = Number(rate?.microsPerSecond);
  if (!Number.isSafeInteger(microsPerSecond) || microsPerSecond <= 0) throw new Error("managed_video_pricing_not_configured");
  const estimatedMicros = input.duration * microsPerSecond;
  if (!Number.isSafeInteger(estimatedMicros) || estimatedMicros <= 0) throw new Error("managed_video_quote_invalid");
  return {
    estimatedMicros,
    currency: "usd",
    pricingSnapshotId: pricingSnapshotId.trim() || "openrouter-managed-video-unconfigured",
    // Video jobs can remain queued longer than a text completion. The wallet
    // reservation therefore lives for one hour, never indefinitely.
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  };
}

export function parseManagedVideoPricing(value: string | undefined): ManagedVideoPricing {
  try {
    const parsed = JSON.parse(value ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const output: ManagedVideoPricing = {};
    for (const [model, candidate] of Object.entries(parsed as Record<string, unknown>)) {
      if (!model.trim() || !candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const row = candidate as Record<string, unknown>;
      const microsPerSecond = Number(row.microsPerSecond);
      const durations = numbers(row.durations);
      const resolutions = strings(row.resolutions);
      const aspectRatios = strings(row.aspectRatios);
      if (!Number.isSafeInteger(microsPerSecond) || microsPerSecond <= 0 || !durations.length || !resolutions.length || !aspectRatios.length) continue;
      output[model.trim()] = { microsPerSecond, durations, resolutions, aspectRatios };
    }
    return output;
  } catch {
    return {};
  }
}

function imageReferences(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return null;
  const rows = value.map((item) => image(item));
  return rows.every(Boolean) ? rows as Array<{ type: "image_url"; image_url: { url: string } }> : null;
}

function frameImages(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return null;
  const rows = value.map((item) => {
    const source = image(item);
    const frameType = item && typeof item === "object" && !Array.isArray(item) ? string((item as Record<string, unknown>).frame_type) : "";
    return source && (frameType === "first_frame" || frameType === "last_frame") ? { ...source, frame_type: frameType } : null;
  });
  if (!rows.every(Boolean)) return null;
  return new Set(rows.map((row) => row!.frame_type)).size === rows.length
    ? rows as Array<{ type: "image_url"; image_url: { url: string }; frame_type: "first_frame" | "last_frame" }>
    : null;
}

function image(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const nested = input.image_url;
  const url = nested && typeof nested === "object" && !Array.isArray(nested) ? string((nested as Record<string, unknown>).url) : "";
  return input.type === "image_url" && /^https:\/\/.{1,4096}$/.test(url) ? { type: "image_url" as const, image_url: { url } } : null;
}

function string(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function strings(value: unknown) { return Array.isArray(value) ? [...new Set(value.map(string).filter(Boolean))] : []; }
function numbers(value: unknown) { return Array.isArray(value) ? [...new Set(value.map(Number).filter((item) => Number.isSafeInteger(item) && item > 0))] : []; }
