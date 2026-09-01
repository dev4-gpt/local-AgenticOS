import { expect, test } from "@playwright/test";
import { pipelineShapePrompt } from "../src/lib/clientPipelineAdapter";
import {
  CONTENT_OS_VIDEO_PILOT,
  CONTENT_OS_VIDEO_PILOT_REQUIRED_SECTIONS,
  contentOsVideoPilotGuardrails,
  contentOsVideoPilotMentioned,
  createContentOsVideoPilotPlan,
} from "../src/lib/contentOsVideoPilot";

test("Content OS keeps the video pilot manual, consent-gated, and disconnected from providers", () => {
  expect(CONTENT_OS_VIDEO_PILOT.state).toBe("manual-pilot");
  expect(CONTENT_OS_VIDEO_PILOT.workflow.contentType).toBe("video");
  expect(CONTENT_OS_VIDEO_PILOT.workflow.stages).toEqual(["brief", "research", "plan", "draft", "assets", "quality", "approval", "publish"]);
  expect(CONTENT_OS_VIDEO_PILOT_REQUIRED_SECTIONS).toEqual(["hook", "architecture", "demo", "call_to_action"]);
  expect(CONTENT_OS_VIDEO_PILOT.workflow.approval.automaticPublishingEnabled).toBe(false);
  expect(CONTENT_OS_VIDEO_PILOT.distribution.state).toBe("manual-only");
  for (const provider of Object.values(CONTENT_OS_VIDEO_PILOT.assetProviders)) expect(provider.state).toBe("disabled");
});

test("Content OS produces a video-only Hermes plan without enabling asset generation or delivery", () => {
  const plan = createContentOsVideoPilotPlan({
    tenantSlug: "veloce-cloud-test",
    brief: "Explain how Veloce turns an approved product brief into a safe delivery workflow.",
    idempotencyKey: "portfolio-video-1",
  });
  expect(plan.contentFactory.contentType).toBe("video");
  expect(plan.contentFactory.autoPublish).toBe(false);
  expect(plan.automaticAssetGenerationEnabled).toBe(false);
  expect(plan.automaticPublishingEnabled).toBe(false);
  expect(plan.distribution).toBe("manual-only");
});

test("pipeline shaping receives Content OS guardrails without creating a provider or publishing path", () => {
  expect(contentOsVideoPilotMentioned("Draft a Gemini Flow and HeyGen portfolio video")).toBe(true);
  expect(contentOsVideoPilotGuardrails("Make a portfolio video with ElevenLabs")).toContain("disabled");
  const prompt = pipelineShapePrompt({ title: "Content OS portfolio video", idea: "Plan a 45 second portfolio video using Gemini Flow and HeyGen." });
  expect(prompt).toContain("Content OS video-pilot constraints");
  expect(prompt).toContain("do not call APIs");
  expect(prompt).toContain("Distribution is manual-only");
});
