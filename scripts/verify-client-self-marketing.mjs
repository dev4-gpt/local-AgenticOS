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
expect(Array.isArray(campaign.records) && campaign.records.length === 10, "campaign must contain 10 context records");
expect(Array.isArray(campaign.workflows) && campaign.workflows.length === requiredSurfaces.length, "campaign must contain all workflow surfaces");
expect(Array.isArray(campaign.briefs) && campaign.briefs.length === requiredBriefs.length, "campaign must contain all creation briefs");
for (const surface of requiredSurfaces) expect(campaign.workflows.some((item) => item.surface === surface), `missing workflow surface ${surface}`);
for (const surface of requiredBriefs) expect(campaign.briefs.some((item) => item.surface === surface), `missing brief surface ${surface}`);
const serialized = JSON.stringify(campaign);
expect(!secretLike.test(serialized), "campaign contains secret-like key/value syntax");
expect(serialized.includes("Human approval"), "campaign is missing human approval language");
expect(serialized.includes("limitations"), "campaign is missing limitation language");
expect(serialized.includes("no local Ollama execution"), "campaign is missing the Ollama boundary");

if (errors.length) {
  console.error("Self-marketing campaign validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Self-marketing campaign validated: ${file}`);
console.log(JSON.stringify({ records: campaign.records.length, workflows: campaign.workflows.length, briefs: campaign.briefs.length, cta: campaign.cta }, null, 2));

function expect(condition, message) {
  if (!condition) errors.push(message);
}
