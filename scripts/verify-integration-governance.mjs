#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const path = "infrastructure/integration-control-plane.manifest.json";
const manifest = JSON.parse(await readFile(path, "utf8"));
const failures = [];
const required = new Map([
  ["ponytail", "native-enabled"],
  ["headroom", "native-enabled"],
  ["openreply", "disabled"],
  ["voxcpm", "disabled"],
  ["scout", "disabled"],
]);

expect(manifest.schemaVersion === 2, "integration governance manifest must use schemaVersion 2");
expect(Array.isArray(manifest.integrations), "integration governance entries are required");
for (const [id, state] of required) {
  const entry = manifest.integrations?.find((candidate) => candidate?.id === id);
  expect(entry?.state === state, `${id} must remain ${state}`);
  expect(
    Array.isArray(entry?.placements)
      && ["pipeline", "infrastructure", "stack", "backend"].every((placement) => entry.placements.includes(placement)),
    `${id} must be registered for pipeline, infrastructure, stack, and backend`,
  );
  expect(typeof entry?.repository === "string" && /^https:\/\/github\.com\//.test(entry.repository), `${id} requires its official repository`);
  expect(typeof entry?.dataBoundary === "string" && entry.dataBoundary.length > 20, `${id} requires an explicit data boundary`);
  expect(Array.isArray(entry?.activationEvidence) && entry.activationEvidence.length > 0, `${id} requires activation evidence`);
  expect(typeof entry?.rollback === "string" && entry.rollback.length > 20, `${id} requires a rollback instruction`);
}

console.log(JSON.stringify({ ok: failures.length === 0, path, failures }, null, 2));
if (failures.length) process.exit(1);

function expect(condition, message) {
  if (!condition) failures.push(message);
}
