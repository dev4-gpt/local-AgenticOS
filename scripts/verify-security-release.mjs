import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicSiteRoot = join(root, "public-site");
const scopePath = join(root, "security", "pentest-scope.json");
const ignoredDirectories = new Set([".git", ".next", "node_modules", "dist", "coverage", "test-results"]);
const requiredIgnoreRules = [".env*", "/.next/", "/node_modules", ".private-client-kits/"];
const forbiddenPublicMarkers = [
  ".agentic-os",
  ".hermes",
  "OPENROUTER_API_KEY",
  "ELEVENLABS_API_KEY",
  "PAPERCLIP_AUTOMATION_TOKEN",
  "127.0.0.1:3737",
  "localhost:3737",
  "/api/runner",
  "/api/exec",
];

const failures = [];
const notes = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) paths.push(...await walk(join(directory, entry.name)));
    } else if (entry.isFile()) {
      paths.push(join(directory, entry.name));
    }
  }
  return paths;
}

const scope = JSON.parse(await readFile(scopePath, "utf8"));
assert(scope.mode === "manual-scope-approved", "Pentest scope must remain manual-scope-approved.");
assert(scope.automation === "disabled", "Pentest automation must remain disabled in the product.");
assert(Array.isArray(scope.allowedTargets) && scope.allowedTargets.length > 0, "At least one loopback test target is required.");

for (const target of scope.allowedTargets ?? []) {
  const url = new URL(target);
  assert(["127.0.0.1", "localhost", "::1"].includes(url.hostname), `Non-loopback target is not allowed in the checked-in scope: ${target}`);
}

for (const [name, tool] of Object.entries(scope.tools ?? {})) {
  assert(tool.enabled === false, `${name} must stay disabled in the product runtime.`);
  assert(tool.reviewRequired === true, `${name} must require a human security review.`);
}

const gitignore = await readFile(join(root, ".gitignore"), "utf8");
for (const rule of requiredIgnoreRules) {
  assert(gitignore.includes(rule), `.gitignore is missing required rule: ${rule}`);
}

// Check only files shipped into the browser bundle. Package scripts may mention
// forbidden markers as part of their own verification commands.
const publicFiles = [
  ...await walk(join(publicSiteRoot, "src")),
  join(publicSiteRoot, "index.html"),
];
for (const path of publicFiles) {
  const contents = await readFile(path, "utf8").catch(() => "");
  for (const marker of forbiddenPublicMarkers) {
    if (contents.includes(marker)) {
      failures.push(`Public-site boundary violation in ${relative(root, path)}: ${marker}`);
    }
  }
}

notes.push(`Checked ${publicFiles.length} public-site files for private-runtime references.`);
notes.push("PentAGI and HexStrike AI are manual-only, isolated security-review tools; they are not product MCP servers.");

if (failures.length) {
  console.error("Security release gate failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Security release gate passed.");
for (const note of notes) console.log(`- ${note}`);
