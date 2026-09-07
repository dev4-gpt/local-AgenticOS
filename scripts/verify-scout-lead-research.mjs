#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const manifestPath = "infrastructure/scout/scout-lead-research.manifest.example.json";
const notePath = "docs/future-integrations/scout.md";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const note = await readFile(notePath, "utf8");
const failures = [];

expect(manifest.schemaVersion === 1, "manifest schemaVersion must be 1");
expect(manifest.integration === "scout-lead-research", "manifest integration must be scout-lead-research");
expect(manifest.state === "disabled", "Scout lead research must remain disabled");
expect(manifest.source?.repository === "https://github.com/kiryano/Scout", "manifest must use official Scout source");
expect(manifest.source?.license === "MIT", "manifest must record the MIT license");
expect(manifest.source?.review?.decision === "blocked", "unreviewed Scout source must remain blocked");
expect(manifest.source?.candidateCommit === null && manifest.source?.reviewedCommit === null, "disabled Scout source must not claim a reviewed commit");
expect(manifest.deployment?.runtime === "external-manual-only", "Scout must remain external and manual only");
expect(manifest.deployment?.separateProject === true && manifest.deployment?.publicIngress === false, "Scout must remain separate with no public ingress");
expect(manifest.deployment?.directVeloceRuntimeConnection === false, "Scout must not connect directly to Veloce");

const boundary = manifest.dataBoundary || {};
expect(boundary.approvedInput === "human-approved-public-profile-urls-only", "Scout input must be human-approved public profile URLs only");
expect(boundary.allowedVeloceOutput === "human-reviewed-aggregate-campaign-brief-only", "Veloce may receive only a reviewed aggregate campaign brief");
for (const key of ["rawLeadImportEnabled", "rawProfileStorageEnabled", "emailOrPhoneStorageEnabled", "browserCookieUseEnabled", "proxyUseEnabled", "automaticOutreachEnabled"]) {
  expect(boundary[key] === false, `Scout safety gate must remain false: ${key}`);
}

expect(manifest.openreplyHandoff?.enabled === false, "Scout-to-OpenReply handoff must remain disabled");
expect(manifest.openreplyHandoff?.mode === "manual-aggregate-only", "Scout-to-OpenReply handoff must be manual aggregate only");
expect(manifest.openreplyHandoff?.requiresCampaignApproval === true, "Scout-to-OpenReply handoff must require campaign approval");
expect(manifest.openreplyHandoff?.allowsRawLeadData === false, "Scout must never pass raw lead data to OpenReply");
for (const [key, value] of Object.entries(manifest.acceptance || {})) expect(value === false, `disabled Scout acceptance must remain false: ${key}`);

expect(note.includes("No Scout runtime"), "Scout note must prohibit a runtime deployment");
expect(note.includes("No browser cookie"), "Scout note must prohibit browser-cookie use");
expect(note.includes("No proxy"), "Scout note must prohibit proxy use");
expect(note.includes("No automatic outreach"), "Scout note must prohibit automatic outreach");

console.log(JSON.stringify({ ok: failures.length === 0, manifestPath, failures }, null, 2));
if (failures.length) process.exit(1);

function expect(condition, message) {
  if (!condition) failures.push(message);
}
