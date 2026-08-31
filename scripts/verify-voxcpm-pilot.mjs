#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const manifestPath = "infrastructure/voxcpm/voxcpm-pilot.manifest.example.json";
const notePath = "docs/future-integrations/voxcpm.md";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const note = await readFile(notePath, "utf8");
const failures = [];

expect(manifest.schemaVersion === 1, "manifest schemaVersion must be 1");
expect(manifest.integration === "voxcpm", "manifest integration must be voxcpm");
expect(manifest.state === "disabled", "VoxCPM must remain disabled");
expect(manifest.source?.repository === "https://github.com/OpenBMB/VoxCPM", "manifest must use official VoxCPM source");
expect(manifest.source?.license === "Apache-2.0", "manifest must record the Apache-2.0 license");
expect(manifest.source?.review?.decision === "blocked", "unreviewed VoxCPM source must remain blocked");
expect(manifest.deployment?.runtime === "isolated-gpu-worker", "VoxCPM must use an isolated GPU worker");
expect(manifest.deployment?.separateProject === true && manifest.deployment?.publicIngress === false, "VoxCPM must remain private and separate");
expect(manifest.safety?.referenceAudioAccepted === false, "reference-audio cloning must remain disabled");
expect(manifest.safety?.voiceDesignOnlyWhenEnabled === true, "first VoxCPM use must be voice design only");
for (const key of ["humanApprovalRequired", "explicitVoiceOwnerConsentRequired", "thirdPartyVoiceCloningProhibited", "retainReferenceAudio", "directVeloceRuntimeConnection"]) {
  const expected = key === "retainReferenceAudio" || key === "directVeloceRuntimeConnection" ? false : true;
  expect(manifest.safety?.[key] === expected, `VoxCPM safety gate is wrong: ${key}`);
}
for (const [key, value] of Object.entries(manifest.acceptance || {})) expect(value === false, `disabled pilot acceptance must remain false: ${key}`);
expect(note.includes("No cloning of a third party"), "VoxCPM note must prohibit third-party voice cloning");
expect(note.includes("No public endpoint"), "VoxCPM note must prohibit public worker ingress");

console.log(JSON.stringify({ ok: failures.length === 0, manifestPath, failures }, null, 2));
if (failures.length) process.exit(1);

function expect(condition, message) {
  if (!condition) failures.push(message);
}
