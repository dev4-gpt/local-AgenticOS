#!/usr/bin/env node
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const fields = [
  "agency delivery", "startup software", "ecommerce", "local services", "healthcare administration",
  "education", "nonprofit operations", "finance operations", "legal services", "creative media",
];
const postures = ["hands-on user", "workflow owner", "technical evaluator", "security reviewer", "budget holder"];
const orgSizes = ["solo", "2-20", "21-250", "251+"];
const literacyLevels = ["new to AI", "exploring", "regular user", "builder", "expert"];
const monthlyBudgets = ["none", "under $50", "$50-$250", "$251-$1000", "over $1000"];
const privacyLevels = ["standard", "strict"];
const regions = ["North America", "Latin America", "Europe", "Middle East and Africa", "South Asia", "East and Southeast Asia"];

function hashNumber(value) {
  return createHash("sha256").update(value).digest().readUInt32BE(0);
}

export function buyerPersonaFrame(seed = "agentos-buyer-v1") {
  const rows = [];
  for (const field of fields) for (const posture of postures) for (const orgSize of orgSizes) for (const aiLiteracy of literacyLevels) for (const monthlyBudget of monthlyBudgets) for (const privacy of privacyLevels) {
    const id = `P${String(rows.length + 1).padStart(5, "0")}`;
    rows.push({ id, field, posture, orgSize, aiLiteracy, monthlyBudget, privacy, region: regions[hashNumber(`${seed}:${id}:region`) % regions.length] });
  }
  return rows;
}

export function pilotBuyerPersonas(seed = "agentos-buyer-v1") {
  const groups = new Map();
  for (const row of buyerPersonaFrame(seed)) {
    const key = `${row.field}:${row.aiLiteracy}`;
    const current = groups.get(key);
    if (!current || hashNumber(`${seed}:${row.id}:pilot`) < hashNumber(`${seed}:${current.id}:pilot`)) groups.set(key, row);
  }
  return [...groups.values()].sort((left, right) => left.id.localeCompare(right.id));
}

if (process.argv[1]?.endsWith("generate-buyer-persona-frame.mjs")) {
  const pilot = process.argv.includes("--pilot");
  const seedArg = process.argv.find((argument) => argument.startsWith("--seed="));
  const outArg = process.argv.find((argument) => argument.startsWith("--out="));
  const seed = seedArg ? seedArg.slice("--seed=".length) : "agentos-buyer-v1";
  const rows = pilot ? pilotBuyerPersonas(seed) : buyerPersonaFrame(seed);
  const output = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  if (outArg) writeFileSync(outArg.slice("--out=".length), output, { encoding: "utf8", mode: 0o600 });
  else process.stdout.write(output);
}
