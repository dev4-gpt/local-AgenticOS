import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const SOURCE_CONFIG_SHA256 = "b6c926b80225faaacaad1929a999ddf20a804d101e01e51f510a1d99eb6fa09d";
const SOURCE_PROFILES_SHA256 = "e47a927cb0b8e83cc16993388a8ab223ac35099ef8c31bb0e41ea916b113db0d";
const SELECTED = new Set(["P00603", "P04949"]);

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function validReviewedProfileManifest(manifest, reviewedBytes, cohortBytes, productBriefBytes) {
  return manifest?.schemaVersion === 2
    && manifest.preparation === "canonical-buyer-scenarios-v2"
    && typeof manifest.file === "string" && /^[a-zA-Z0-9._-]+\.csv$/.test(manifest.file)
    && manifest.sourceSha256 === SOURCE_PROFILES_SHA256
    && manifest.reviewedSha256 === sha256(reviewedBytes)
    && manifest.cohortSha256 === sha256(cohortBytes)
    && manifest.productBriefSha256 === sha256(productBriefBytes)
    && manifest.profileCount === 10 && manifest.providerCalls === 0;
}

export function prepareRepeatSmoke(source, simulationId) {
  if (!/^sim_[a-f0-9]{12}$/.test(simulationId)) throw new Error("simulation_id_invalid");
  const config = structuredClone(source);
  const agents = config.agent_configs;
  const names = new Set(agents?.map((agent) => agent.entity_name));
  if (agents?.length !== 10 || names.size !== 10 || ![...SELECTED].every((name) => names.has(name)) || config.reddit_config !== null) {
    throw new Error("buyer_cohort_invalid");
  }
  const idByName = new Map(agents.map((agent, index) => [agent.entity_name, index]));
  config.simulation_id = simulationId;
  config.time_config = {
    ...config.time_config,
    total_simulation_hours: 10,
    minutes_per_round: 60,
    agents_per_hour_min: 2,
    agents_per_hour_max: 2,
    peak_hours: [9],
    peak_activity_multiplier: 1,
    off_peak_hours: [],
  };
  for (const agent of agents) {
    const active = SELECTED.has(agent.entity_name);
    agent.active_hours = active ? [9] : [];
    agent.activity_level = active ? 1 : 0;
  }
  config.event_config = {
    initial_posts: [
      {
        poster_type: "Buyer",
        poster_agent_id: idByName.get("P00603"),
        content: "P00603: I review security for a solo agency, am new to AI, and have less than $50 a month. AgentOS lists $2,500 setup plus $1,250/month before provider usage, so I cannot buy this offer. I would still want evidence that a client handoff keeps files isolated and needs no provider connection before I reconsider at a different budget.",
      },
      {
        poster_type: "Buyer",
        poster_agent_id: idByName.get("P04949"),
        content: "P04949: I own the budget for healthcare administration and know AI systems well. AgentOS lists $2,500 setup plus $1,250/month before provider usage. Show me an auditable administrative intake handoff, with total costs and access controls visible, before I decide whether that price is justified. I am not asking for clinical decision support.",
      },
    ],
    scheduled_events: [],
    hot_topics: ["first useful workflow", "privacy and access control", "budget visibility", "AI literacy", "approval and audit evidence"],
    narrative_direction: "Buyers evaluate the first useful workflow and may reject AgentOS when evidence, privacy, setup effort, or cost controls are inadequate. Do not invent product proof or clinical outcomes.",
  };
  config.wait_for_commands = false;
  config.generation_reasoning = "Manual, bounded English-language two-buyer repeat smoke. This is not market validation.";
  return config;
}

async function main() {
  const [sourceDir, outputRoot, profileManifestPath] = process.argv.slice(2);
  if (!sourceDir || !outputRoot || !profileManifestPath) throw new Error("Usage: node scripts/prepare-mirofish-repeat-smoke.mjs <retained-simulation-dir> <isolated-output-root> <reviewed-profile-manifest.json>");
  const configBytes = await readFile(join(sourceDir, "simulation_config.json"));
  const sourceProfileBytes = await readFile(join(sourceDir, "twitter_profiles.csv"));
  if (basename(sourceDir) !== "sim_fe9b23d28531" || sha256(configBytes) !== SOURCE_CONFIG_SHA256 || sha256(sourceProfileBytes) !== SOURCE_PROFILES_SHA256) {
    throw new Error("retained_pilot_artifacts_changed");
  }
  const manifest = JSON.parse(await readFile(profileManifestPath, "utf8"));
  if (typeof manifest.file !== "string" || !/^[a-zA-Z0-9._-]+\.csv$/.test(manifest.file)) throw new Error("reviewed_profile_manifest_invalid");
  const profileBytes = await readFile(join(dirname(profileManifestPath), manifest.file));
  const cohortBytes = await readFile(join(process.cwd(), "evaluations/mirofish-buyer-micro-v1.json"));
  const productBriefBytes = await readFile(join(process.cwd(), "docs/mirofish-buyer-pilot-seed.md"));
  if (!validReviewedProfileManifest(manifest, profileBytes, cohortBytes, productBriefBytes)) throw new Error("reviewed_profile_manifest_invalid");
  const simulationId = `sim_${randomBytes(6).toString("hex")}`;
  const outputDir = join(outputRoot, simulationId);
  const config = prepareRepeatSmoke(JSON.parse(configBytes.toString("utf8")), simulationId);
  const outputBytes = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
  await mkdir(outputDir, { mode: 0o700 });
  await writeFile(join(outputDir, "simulation_config.json"), outputBytes, { mode: 0o600 });
  await writeFile(join(outputDir, "twitter_profiles.csv"), profileBytes, { mode: 0o600 });
  await writeFile(join(outputDir, "profile-preparation.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ simulationId, outputDir, configSha256: sha256(outputBytes), profileSha256: sha256(profileBytes), profilePreparation: manifest.preparation, selectedBuyers: [...SELECTED].sort(), rounds: 10, providerCalls: 0 })}\n`);
}

if (process.argv[1]?.endsWith("/prepare-mirofish-repeat-smoke.mjs")) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
