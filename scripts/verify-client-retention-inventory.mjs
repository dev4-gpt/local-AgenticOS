import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationRoot = path.join(root, "product-experience");
const inventoryPath = path.join(root, "docs/retention-table-map-2026-10-15.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const expectedPolicy = "28 active days from each in-scope content item's creation plus seven days of object recovery";
const fail = (message) => {
  console.error(`Retention inventory verification failed: ${message}`);
  process.exit(1);
};

function sqlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) return sqlFiles(candidate);
    return entry.isFile() && candidate.endsWith(".sql") ? [candidate] : [];
  });
}

const declared = new Set();
for (const file of sqlFiles(migrationRoot)) {
  const sql = readFileSync(file, "utf8");
  for (const match of sql.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.(client_[a-z0-9_]+)/gi)) {
    declared.add(match[1].toLowerCase());
  }
}

if (inventory.policyDecision !== expectedPolicy) fail("owner-selected 28+7 policy is missing or changed");
if (!Array.isArray(inventory.classes) || inventory.classes.length === 0) fail("classes are missing");

const mapped = new Set();
for (const group of inventory.classes) {
  if (typeof group.id !== "string" || typeof group.retentionClass !== "string"
      || typeof group.selectedDisposition !== "string" || typeof group.implementationStatus !== "string"
      || typeof group.remainingGate !== "string" || !Array.isArray(group.tables)) {
    fail("a classification group is incomplete");
  }
  for (const table of group.tables) {
    if (!/^client_[a-z0-9_]+$/.test(table)) fail(`invalid table name: ${table}`);
    if (mapped.has(table)) fail(`table is classified more than once: ${table}`);
    mapped.add(table);
  }
}

const missing = [...declared].filter((table) => !mapped.has(table)).sort();
const stale = [...mapped].filter((table) => !declared.has(table)).sort();
if (missing.length) fail(`unclassified tenant tables: ${missing.join(", ")}`);
if (stale.length) fail(`inventory tables no longer declared in scanned migrations: ${stale.join(", ")}`);

console.log(JSON.stringify({
  policyStatus: inventory.policyStatus,
  scannedMigrationFiles: sqlFiles(migrationRoot).length,
  declaredTenantTables: declared.size,
  classifiedTenantTables: mapped.size,
  classificationGroups: inventory.classes.length,
  allDeclaredTablesClassified: true,
  hostedEnforcementVerified: false,
}, null, 2));
