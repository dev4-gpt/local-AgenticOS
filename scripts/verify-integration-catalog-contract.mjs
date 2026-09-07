import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(new URL("../infrastructure/integration-control-plane.manifest.json", import.meta.url));
const manifestRaw = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestRaw);

const RISK_TIERS = new Set(["low", "medium", "high", "critical"]);
const STATES = new Set(["native-enabled", "disabled"]);
const failures = [];

// product-experience/src/lib/integrationCatalogBroker.ts reads a local copy
// of this file instead of reaching outside its Vercel-scoped Root Directory
// -- this is the only thing enforcing the two never silently drift apart.
const appCopyPath = fileURLToPath(new URL("../product-experience/src/data/integration-control-plane.manifest.json", import.meta.url));
const appCopyRaw = await readFile(appCopyPath, "utf8").catch(() => null);
if (appCopyRaw === null) failures.push("product-experience/src/data/integration-control-plane.manifest.json is missing");
else if (appCopyRaw !== manifestRaw) failures.push("product-experience/src/data/integration-control-plane.manifest.json is out of sync with the canonical manifest -- copy it over exactly");

if (manifest.schemaVersion !== 2) failures.push(`schemaVersion must be 2, got ${JSON.stringify(manifest.schemaVersion)}`);
if (!Array.isArray(manifest.integrations) || manifest.integrations.length === 0) failures.push("integrations must be a non-empty array");

const seenIds = new Set();
for (const entry of manifest.integrations ?? []) {
  const label = typeof entry?.id === "string" ? entry.id : "<missing id>";
  if (typeof entry?.id !== "string" || !entry.id) failures.push(`${label}: id must be a non-empty string`);
  else if (seenIds.has(entry.id)) failures.push(`${label}: duplicate id`);
  else seenIds.add(entry.id);

  if (typeof entry?.name !== "string" || !entry.name) failures.push(`${label}: name must be a non-empty string`);
  if (entry?.repository !== null && typeof entry?.repository !== "string") failures.push(`${label}: repository must be a string or null`);
  if (!STATES.has(entry?.state)) failures.push(`${label}: state must be one of ${[...STATES].join(", ")}, got ${JSON.stringify(entry?.state)}`);
  if (!RISK_TIERS.has(entry?.riskTier)) failures.push(`${label}: riskTier must be one of ${[...RISK_TIERS].join(", ")}, got ${JSON.stringify(entry?.riskTier)}`);
  if (!Array.isArray(entry?.placements) || entry.placements.length === 0) failures.push(`${label}: placements must be a non-empty array`);
  if (typeof entry?.runtime !== "string" || !entry.runtime) failures.push(`${label}: runtime must be a non-empty string`);
  if (typeof entry?.dataBoundary !== "string" || !entry.dataBoundary) failures.push(`${label}: dataBoundary must be a non-empty string`);
  if (!Array.isArray(entry?.activationEvidence) || entry.activationEvidence.length === 0) failures.push(`${label}: activationEvidence must be a non-empty array`);
  if (typeof entry?.rollback !== "string" || !entry.rollback) failures.push(`${label}: rollback must be a non-empty string`);
  if (entry?.sbomReference !== null && typeof entry?.sbomReference !== "string") failures.push(`${label}: sbomReference must be a string or null`);
  if (entry?.provenanceReference !== null && typeof entry?.provenanceReference !== "string") failures.push(`${label}: provenanceReference must be a string or null`);

  // A native-enabled, higher-risk integration without a real SBOM/provenance
  // reference (still "pending: ...") would be a governance gap worth
  // catching automatically before it ever reaches production traffic.
  if (entry?.state === "native-enabled" && (entry?.riskTier === "high" || entry?.riskTier === "critical") && typeof entry?.sbomReference === "string" && entry.sbomReference.startsWith("pending")) {
    failures.push(`${label}: native-enabled with riskTier=${entry.riskTier} cannot have a pending sbomReference`);
  }
}

if (failures.length) {
  console.error("Integration catalog contract verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Integration catalog contract verification passed (${manifest.integrations.length} integrations, schemaVersion ${manifest.schemaVersion}).`);
