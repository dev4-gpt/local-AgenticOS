#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const path = "infrastructure/engineering-controls/agent-efficiency.manifest.json";
const manifest = JSON.parse(await readFile(path, "utf8"));
const failures = [];
const rules = manifest.rules || {};

expect(manifest.schemaVersion === 1 && manifest.state === "active-engineering-policy", "engineering controls must be an active schemaVersion 1 policy");
expect(manifest.sources?.ponytail === "https://github.com/DietrichGebert/ponytail", "Ponytail source is missing");
expect(manifest.sources?.headroom === "https://github.com/headroomlabs-ai/headroom", "Headroom source is missing");
for (const key of ["yagni", "preferPlatformAndStandardLibrary", "preserveSecurityAndValidation", "avoidUnrequestedRuntimeDependencies", "compactDiagnostics", "redactSecretsBeforePersistence", "retainRawEvidenceOutsideModelContext"]) expect(rules[key] === true, `engineering control is not enabled: ${key}`);
expect(manifest.deployment?.ponytail === "operating-policy-only", "Ponytail must not be a hidden production dependency");
expect(String(manifest.deployment?.headroom || "").includes("do not proxy production tenant data"), "Headroom production-data boundary is missing");

console.log(JSON.stringify({ ok: failures.length === 0, path, failures }, null, 2));
if (failures.length) process.exit(1);

function expect(condition, message) {
  if (!condition) failures.push(message);
}
