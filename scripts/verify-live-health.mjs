import { writeFile } from "node:fs/promises";

const BASE = process.env.AGENTOS_URL || "http://127.0.0.1:3737";

async function readJson(route, timeoutMs = 30_000) {
  const response = await fetch(`${BASE}${route}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${route} returned HTTP ${response.status}`);
  return response.json();
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readHealthyVitals() {
  let latest;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    latest = await readJson("/api/vitals", 45_000);
    if (latest?.claude?.ok && latest?.openclaw?.ok && latest?.hermes?.ok) return latest;
    if (attempt < 2) await sleep(6_000);
  }
  const state = {
    claude: latest?.claude?.ok,
    openclaw: latest?.openclaw?.ok,
    hermes: latest?.hermes?.ok,
  };
  throw new Error(`core vitals are unhealthy after retry: ${JSON.stringify(state)}`);
}

const [vitals, vault, graphify, integrations] = await Promise.all([
  readHealthyVitals(),
  readJson("/api/memory/vault"),
  readJson("/api/memory/graphify"),
  readJson("/api/integrations"),
]);

if (!vault?.configured || !vault?.activeVault) {
  throw new Error("Obsidian vault is not configured");
}
if (!graphify?.ready || !graphify?.obsidianExported) {
  throw new Error("Graphify is not ready or its Obsidian export is missing");
}
if (!Array.isArray(integrations?.local)) {
  throw new Error("integrations response is missing local capability state");
}

await Promise.all([
  writeFile("/tmp/agentos-vitals.json", JSON.stringify(vitals)),
  writeFile("/tmp/agentos-vault.json", JSON.stringify(vault)),
  writeFile("/tmp/agentos-graphify.json", JSON.stringify(graphify)),
  writeFile("/tmp/agentos-integrations.json", JSON.stringify(integrations)),
]);

console.log("Veloce AgenticOS live health checks passed.");
console.log(`- Core: Claude, OpenClaw, Hermes${vitals.hermes.degraded ? " (fallback ready)" : ""}`);
console.log(`- Vault: ${vault.activeVault}`);
console.log(`- Graphify: ${graphify.nodes} nodes, ${graphify.edges} edges, Obsidian export ready`);
