#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pilotBuyerPersonas } from "./generate-buyer-persona-frame.mjs";

const root = process.cwd();
const fixturePath = resolve(root, "evaluations/mirofish-buyer-micro-v1.json");
const baseSeedPath = resolve(root, "docs/mirofish-buyer-pilot-seed.md");

export function prepareMirofishBuyerSeed(fixture, baseSeed) {
  if (fixture?.schemaVersion !== 1 || fixture.cohort !== "mirofish-buyer-micro-v1" || !Array.isArray(fixture.personas) || fixture.personas.length !== 10) {
    throw new Error("mirofish_micro_fixture_invalid");
  }
  const frame = new Map(pilotBuyerPersonas(fixture.frameSeed).map((row) => [row.id, row]));
  const selected = fixture.personas.map((entry) => {
    const row = frame.get(entry?.id);
    if (!row || typeof entry.firstWorkflow !== "string" || !/^[a-z][a-z -]{10,160}$/.test(entry.firstWorkflow)) {
      throw new Error("mirofish_micro_persona_invalid");
    }
    return { ...row, firstWorkflow: entry.firstWorkflow };
  });
  const unique = (key) => new Set(selected.map((row) => row[key]));
  const literacyCounts = new Map();
  for (const row of selected) literacyCounts.set(row.aiLiteracy, (literacyCounts.get(row.aiLiteracy) ?? 0) + 1);
  if (unique("id").size !== 10 || unique("field").size !== 10 || unique("posture").size !== 5 || literacyCounts.size !== 5
    || [...literacyCounts.values()].some((count) => count !== 2) || selected.filter((row) => row.privacy === "strict").length < 3) {
    throw new Error("mirofish_micro_coverage_invalid");
  }
  if (typeof baseSeed !== "string" || !baseSeed.includes("complete current-release journey has **not** yet been certified")) {
    throw new Error("mirofish_micro_base_seed_invalid");
  }
  const profiles = selected.map((row) => [
    `## Fictional buyer ${row.id}`,
    `${row.id} is a ${row.posture} in ${row.field}, ${row.orgSize === "solo" ? "working solo" : `at an organization with ${row.orgSize} people`}. Region: ${row.region}.`,
    `AI literacy: ${row.aiLiteracy}. Monthly budget: ${row.monthlyBudget}. Privacy posture: ${row.privacy}.`,
    `First workflow to assess: ${row.firstWorkflow}. This buyer may decline AgentOS and choose a simpler existing tool or manual process.`,
  ].join("\n")).join("\n\n");
  return `${baseSeed.trim()}\n\n# Synthetic micro-cohort for the first pilot\n\nThese ten fictional profiles are scenario inputs, not generated MiroFish agents or actual customers. Compare MiroFish's generated profiles against these IDs and attributes before reporting coverage. Do not infer conversion from simulation output.\n\n${profiles}\n`;
}

if (process.argv[1]?.endsWith("prepare-mirofish-buyer-seed.mjs")) {
  const out = process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const result = prepareMirofishBuyerSeed(fixture, readFileSync(baseSeedPath, "utf8"));
  if (out) writeFileSync(resolve(out), result, { encoding: "utf8", mode: 0o600 });
  else process.stdout.write(result);
}
