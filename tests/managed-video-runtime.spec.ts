import { expect, test } from "@playwright/test";
import { normalizeManagedVideoInput, parseManagedVideoPricing, quoteManagedVideo } from "../product-experience/src/lib/managedVideoRuntime";

const pricing = parseManagedVideoPricing(JSON.stringify({
  "bytedance/seedance-2.0-mini": {
    microsPerSecond: 13_450,
    durations: [4, 8, 15],
    resolutions: ["480p", "720p"],
    aspectRatios: ["9:16", "16:9"],
  },
}));

test("managed video input is limited to reviewed model capabilities and drops provider passthrough", () => {
  const input = normalizeManagedVideoInput({
    model: "bytedance/seedance-2.0-mini",
    prompt: "A four-second vertical product shot.",
    duration: 4,
    resolution: "480p",
    aspect_ratio: "9:16",
    callback_url: "https://attacker.example/callback",
    provider: { order: ["unreviewed"] },
    generate_audio: true,
  }, pricing);

  expect(input).toEqual({
    model: "bytedance/seedance-2.0-mini",
    prompt: "A four-second vertical product shot.",
    duration: 4,
    resolution: "480p",
    aspect_ratio: "9:16",
    generate_audio: false,
  });
});

test("managed video quote records the exact reviewed per-second amount", () => {
  const input = normalizeManagedVideoInput({
    model: "bytedance/seedance-2.0-mini", prompt: "Clip", duration: 4, resolution: "480p", aspect_ratio: "9:16",
  }, pricing);
  expect(input).not.toBeNull();
  const quote = quoteManagedVideo(input!, pricing, "openrouter-video-2026-08-25");
  expect(quote.estimatedMicros).toBe(53_800);
  expect(quote.pricingSnapshotId).toBe("openrouter-video-2026-08-25");
  expect(Date.parse(quote.expiresAt)).toBeGreaterThan(Date.now());
});

test("unreviewed models and unsupported capabilities fail before a provider request", () => {
  expect(normalizeManagedVideoInput({
    model: "unknown/model", prompt: "Clip", duration: 4, resolution: "480p", aspect_ratio: "9:16",
  }, pricing)).toBeNull();
  expect(normalizeManagedVideoInput({
    model: "bytedance/seedance-2.0-mini", prompt: "Clip", duration: 6, resolution: "1080p", aspect_ratio: "1:1",
  }, pricing)).toBeNull();
});
