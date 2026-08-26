#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";

const file = process.argv[2] || "client-blueprints/veloce-self-marketing.campaign.json";
const campaign = JSON.parse(await readFile(file, "utf8"));
const requiredSurfaces = ["orchestrate", "paperclip", "room", "pipeline", "agent-kanban", "kanban", "loop", "ruflo"];
const requiredBriefs = ["create", "opendesign", "web-studio", "flow-lab", "studio", "openmontage", "games", "thumbnails"];
const errors = [];
const secretLike = /(api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token)\s*[:=]/i;

expect(campaign.campaignId === "veloce-self-marketing-ai-product-teams-v1", "unexpected campaign id");
expect(campaign.audience === "AI and product teams", "unexpected audience");
expect(campaign.cta === "https://product-experience-five.vercel.app/start", "unexpected CTA");
expect(campaign.mode === "guided-drafts-and-test-delivery", "campaign must be guided and draft-only");
expect(Array.isArray(campaign.deliveryConnectors) && campaign.deliveryConnectors.length === 1, "campaign must declare exactly one external delivery connector");
const openReply = campaign.deliveryConnectors?.find((item) => item.id === "openreply-instagram");
expect(openReply?.kind === "external-isolated-worker", "OpenReply must remain an isolated external worker");
expect(openReply?.state === "disabled", "OpenReply must remain disabled in the campaign blueprint");
expect(openReply?.activationMode === "human-approved-external-pilot", "OpenReply activation must require an external pilot");
expect(openReply?.approvalRequired === true, "OpenReply delivery must require human approval");
for (const prohibited of ["instagram_access_tokens", "dm_bodies", "commenter_handles", "raw_webhook_payloads", "database_urls", "redis_urls"]) {
  expect(openReply?.prohibitedData?.includes(prohibited), `OpenReply boundary is missing prohibited data: ${prohibited}`);
}
expect(Array.isArray(campaign.records) && campaign.records.length === 10, "campaign must contain 10 context records");
expect(Array.isArray(campaign.workflows) && campaign.workflows.length === requiredSurfaces.length, "campaign must contain all workflow surfaces");
expect(Array.isArray(campaign.briefs) && campaign.briefs.length === requiredBriefs.length, "campaign must contain all creation briefs");
expect(Array.isArray(campaign.assets) && campaign.assets.length === 2, "campaign must contain two approved text asset jobs");
for (const surface of requiredSurfaces) expect(campaign.workflows.some((item) => item.surface === surface), `missing workflow surface ${surface}`);
for (const surface of requiredBriefs) expect(campaign.briefs.some((item) => item.surface === surface), `missing brief surface ${surface}`);
const serialized = JSON.stringify(campaign);
expect(!secretLike.test(serialized), "campaign contains secret-like key/value syntax");
expect(serialized.includes("Human approval"), "campaign is missing human approval language");
expect(serialized.includes("limitations"), "campaign is missing limitation language");
expect(serialized.includes("no local Ollama execution"), "campaign is missing the Ollama boundary");
expect(campaign.assets?.every((item) => ["anthropic", "openrouter"].includes(item.provider)), "campaign contains a non-approved asset provider");

if (errors.length) {
  console.error("Self-marketing campaign validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Self-marketing campaign validated: ${file}`);
console.log(JSON.stringify({ records: campaign.records.length, workflows: campaign.workflows.length, briefs: campaign.briefs.length, deliveryConnectors: campaign.deliveryConnectors.length, cta: campaign.cta }, null, 2));

function expect(condition, message) {
  if (!condition) errors.push(message);
}
