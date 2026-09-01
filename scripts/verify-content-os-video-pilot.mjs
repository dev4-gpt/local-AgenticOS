#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const path = "infrastructure/content-os/personal-video-pilot.manifest.json";
const manifest = JSON.parse(await readFile(path, "utf8"));
const operatorGuide = await readFile("docs/content-os-personal-video-pilot.md", "utf8");
const failures = [];

expect(manifest.schemaVersion === 1, "manifest schemaVersion must be 1");
expect(manifest.capability === "personal-video-content-os", "capability must be personal-video-content-os");
expect(manifest.state === "manual-pilot", "content OS must remain a manual pilot");
expect(Array.isArray(manifest.placement) && ["pipeline", "infrastructure", "backend", "content-factory"].every((placement) => manifest.placement.includes(placement)), "content OS requires pipeline, infrastructure, backend, and content-factory placement");
expect(manifest.workflow?.contentType === "video", "content OS must use the video content type");
expect(sameSet(manifest.workflow?.stages, ["brief", "research", "plan", "draft", "assets", "quality", "approval", "publish"]), "workflow must use the approval-gated Hermes sequence");
expect(manifest.workflow?.manualPilot?.minimumVideos === 3 && manifest.workflow?.manualPilot?.maximumVideos === 5, "manual pilot must be bounded to three to five videos");
expect(manifest.workflow?.manualPilot?.durationSeconds?.minimum === 30 && manifest.workflow?.manualPilot?.durationSeconds?.maximum === 60, "manual pilot videos must be 30–60 seconds");
expect(manifest.workflow?.approval?.humanApprovalRequired === true, "human approval must be required");
expect(manifest.workflow?.approval?.automaticPublishingEnabled === false, "automatic publishing must remain disabled");
for (const provider of ["geminiFlowVeo", "heygen", "elevenlabs"]) expect(manifest.assetProviders?.[provider]?.state === "disabled", `${provider} must remain disabled`);
expect(manifest.distribution?.state === "manual-only", "distribution must remain manual-only");
expect(manifest.distribution?.automaticSchedulingEnabled === false && manifest.distribution?.automaticPublishingEnabled === false, "scheduling and publishing must remain disabled");
expect(manifest.dataBoundary?.rawProviderCredentialsStored === false, "provider credentials must not be stored");
expect(manifest.dataBoundary?.platformAnalyticsImportEnabled === false, "platform analytics import must remain disabled");
expect(manifest.consentAndDisclosure?.ownerLikenessConsentRequired === true && manifest.consentAndDisclosure?.ownerVoiceConsentRequired === true, "owner likeness and voice consent must be required");
expect(manifest.consentAndDisclosure?.thirdPartyCloningProhibited === true, "third-party cloning must be prohibited");
for (const [key, value] of Object.entries(manifest.acceptance || {})) expect(value === false, `manual pilot acceptance must remain false: ${key}`);
expect(operatorGuide.includes("What I need from the owner to begin Phase 1"), "operator guide must state the manual inputs required to begin");
expect(operatorGuide.includes("What stays disabled"), "operator guide must state the disabled external boundaries");

console.log(JSON.stringify({ ok: failures.length === 0, path, failures }, null, 2));
if (failures.length) process.exit(1);

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function sameSet(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && expected.every((item) => actual.includes(item));
}
