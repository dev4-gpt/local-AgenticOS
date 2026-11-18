#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buyerPersonaFrame, pilotBuyerPersonas } from "./generate-buyer-persona-frame.mjs";

const root = process.cwd();
const fixturePath = resolve(root, "evaluations/mirofish-buyer-micro-v1.json");
const baseSeedPath = resolve(root, "docs/mirofish-buyer-pilot-seed.md");
const focusedFixturePath = resolve(root, "evaluations/mirofish-buyer-micro-v2.json");
const focusedBaseSeedPath = resolve(root, "docs/mirofish-buyer-pilot-seed-v2.md");

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

export function prepareFocusedMirofishBuyerSeed(fixture, baseSeed) {
  if (fixture?.schemaVersion !== 2 || fixture.cohort !== "mirofish-buyer-micro-v2"
    || fixture.target?.field !== "agency delivery"
    || !Array.isArray(fixture.target?.orgSizes)
    || fixture.target.orgSizes.length !== 2
    || !Array.isArray(fixture.personas) || fixture.personas.length !== 10
    || typeof fixture.firstWorkflow !== "string"
    || !/^[a-z][a-z ,'-]{10,240}$/.test(fixture.firstWorkflow)) {
    throw new Error("mirofish_focused_fixture_invalid");
  }
  const frame = new Map(buyerPersonaFrame(fixture.frameSeed).map((row) => [row.id, row]));
  const selected = fixture.personas.map((entry) => {
    const row = frame.get(entry?.id);
    if (!row || row.field !== fixture.target.field || !fixture.target.orgSizes.includes(row.orgSize)) {
      throw new Error("mirofish_focused_persona_invalid");
    }
    return { ...row, firstWorkflow: fixture.firstWorkflow };
  });
  const counts = (key) => {
    const result = new Map();
    for (const row of selected) result.set(row[key], (result.get(row[key]) ?? 0) + 1);
    return result;
  };
  const literacy = counts("aiLiteracy");
  const postures = counts("posture");
  const sizes = counts("orgSize");
  const ids = new Set(selected.map((row) => row.id));
  if (ids.size !== 10 || literacy.size !== 5 || [...literacy.values()].some((count) => count !== 2)
    || postures.size !== 2 || postures.get("workflow owner") !== 5 || postures.get("security reviewer") !== 5
    || sizes.size !== 2 || [...sizes.values()].some((count) => count !== 5)
    || selected.filter((row) => row.privacy === "strict").length < 4) {
    throw new Error("mirofish_focused_coverage_invalid");
  }
  if (typeof baseSeed !== "string" || !baseSeed.includes("hypothesis generation, not market validation")) {
    throw new Error("mirofish_focused_base_seed_invalid");
  }
  const profiles = selected.map((row) => [
    `## Fictional buyer ${row.id}`,
    `${row.id} is a ${row.posture} in a small AI automation or development consultancy, working ${row.orgSize === "solo" ? "solo" : "in a team of 2-20"}. Region: ${row.region}.`,
    `AI literacy: ${row.aiLiteracy}. Monthly budget band: ${row.monthlyBudget}. Privacy posture: ${row.privacy}.`,
    `Candidate workflow to investigate: ${row.firstWorkflow}. This is an unvalidated problem hypothesis; the buyer may not experience it, may use a simpler alternative, or may reject the offer.`,
  ].join("\n")).join("\n\n");
  return `${baseSeed.trim()}\n\n# Synthetic focused cohort\n\nThese ten fictional profiles are balanced scenario inputs drawn from the deterministic persona frame. They are not customers, interviewees, or evidence of demand. The cohort is intentionally narrow and is not statistically representative. Preserve negative, uncertain, and nonbuyer responses.\n\n${profiles}\n`;
}

if (process.argv[1]?.endsWith("prepare-mirofish-buyer-seed.mjs")) {
  const out = process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length);
  const focused = process.argv.includes("--focused-v2");
  const inputPath = focused ? focusedFixturePath : fixturePath;
  const seedPath = focused ? focusedBaseSeedPath : baseSeedPath;
  const activeFixture = JSON.parse(readFileSync(inputPath, "utf8"));
  const baseSeed = readFileSync(seedPath, "utf8");
  const result = focused
    ? prepareFocusedMirofishBuyerSeed(activeFixture, baseSeed)
    : prepareMirofishBuyerSeed(activeFixture, baseSeed);
  if (out) writeFileSync(resolve(out), result, { encoding: "utf8", mode: 0o600 });
  else process.stdout.write(result);
}
