import manifest from "../../infrastructure/content-os/personal-video-pilot.manifest.json";
import { createHermesContentFactoryPlan, type HermesContentFactoryPlan } from "./hermesContentFactory";

export const CONTENT_OS_VIDEO_PILOT_ID = "personal-video-content-os";
export const CONTENT_OS_VIDEO_PILOT_ALIASES = [
  "content os", "personal video", "portfolio video", "gemini flow", "veo", "heygen", "elevenlabs",
] as const;
export const CONTENT_OS_VIDEO_PILOT_REQUIRED_SECTIONS = ["hook", "architecture", "demo", "call_to_action"] as const;
export const CONTENT_OS_VIDEO_PILOT_STAGES = [
  "brief", "research", "plan", "draft", "assets", "quality", "approval", "publish",
] as const;

type ContentOsVideoPilotManifest = {
  capability: string;
  state: "manual-pilot";
  placement: readonly string[];
  workflow: {
    contentType: "video";
    stages: readonly string[];
    manualPilot: { minimumVideos: number; maximumVideos: number; durationSeconds: { minimum: number; maximum: number }; verticalFirst: boolean; requiredSections: readonly string[]; captionRequired: boolean; portfolioSourceVerificationRequired: boolean };
    approval: { humanApprovalRequired: boolean; accuracyAndDisclosureReviewRequired: boolean; automaticPublishingEnabled: boolean; deliveryMode: string };
  };
  assetProviders: Record<string, { state: "disabled"; purpose: string }>;
  distribution: { state: "manual-only"; destinations: readonly string[]; nativePostRequired: boolean; automaticSchedulingEnabled: boolean; automaticPublishingEnabled: boolean };
};

export const CONTENT_OS_VIDEO_PILOT = manifest as ContentOsVideoPilotManifest;

export type ContentOsVideoPilotPlan = {
  capability: typeof CONTENT_OS_VIDEO_PILOT_ID;
  state: "manual-pilot";
  contentFactory: HermesContentFactoryPlan;
  requiredSections: readonly (typeof CONTENT_OS_VIDEO_PILOT_REQUIRED_SECTIONS)[number][];
  humanApprovalRequired: true;
  automaticAssetGenerationEnabled: false;
  automaticPublishingEnabled: false;
  distribution: "manual-only";
};

export function contentOsVideoPilotMentioned(text: string) {
  const normalized = text.toLowerCase();
  return CONTENT_OS_VIDEO_PILOT_ALIASES.some((alias) => normalized.includes(alias));
}

/** Adds the pilot's non-negotiable boundaries only when the topic is in scope. */
export function contentOsVideoPilotGuardrails(text: string) {
  if (!contentOsVideoPilotMentioned(text)) return "";
  return [
    "Content OS video-pilot constraints:",
    "- This is a manual-pilot workflow for three to five owner-reviewed, 30–60 second vertical portfolio videos.",
    "- Use the Hermes video sequence: brief, research, plan, draft, assets, quality, approval, publish.",
    "- Every asset/provider connector (Gemini Flow/Veo, HeyGen, ElevenLabs) is disabled; do not call APIs, request credentials, or claim an asset was generated.",
    "- Confirm source accuracy, captions, owner likeness/voice consent, and synthetic-media disclosure before the approval gate.",
    "- Distribution is manual-only. Do not schedule, post, message, or publish to a platform; record delivery only after a human approves it.",
  ].join("\n");
}

/** Creates a video-only Hermes plan without enabling a media or publishing connector. */
export function createContentOsVideoPilotPlan(input: { tenantSlug: string; brief: string; idempotencyKey?: string }): ContentOsVideoPilotPlan {
  const contentFactory = createHermesContentFactoryPlan({
    tenantSlug: input.tenantSlug,
    brief: input.brief,
    contentType: "video",
    idempotencyKey: input.idempotencyKey,
  });
  return {
    capability: CONTENT_OS_VIDEO_PILOT_ID,
    state: "manual-pilot",
    contentFactory,
    requiredSections: CONTENT_OS_VIDEO_PILOT_REQUIRED_SECTIONS,
    humanApprovalRequired: true,
    automaticAssetGenerationEnabled: false,
    automaticPublishingEnabled: false,
    distribution: "manual-only",
  };
}
