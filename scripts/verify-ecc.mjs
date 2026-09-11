#!/usr/bin/env node
import fs from 'node:fs';
import { ECC_REVISION } from './lib/ecc-package.mjs';
const lock = JSON.parse(fs.readFileSync('infrastructure/ecc-upstream.lock.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('src/data/ecc-components.json', 'utf8'));
if (lock.revision !== ECC_REVISION || catalog.revision !== ECC_REVISION) throw new Error('ECC revision drift');
const files = new Map(lock.files.map(f => [f.path, f.sha256]));
if (files.size !== lock.files.length) throw new Error('Duplicate source files');
for (const file of lock.files) if (!file.nature || !file.disposition || !file.implementationPath) throw new Error(`Unclassified supporting file: ${file.path}`);
const ids = new Set();
for (const component of catalog.components) {
  if (ids.has(component.id)) throw new Error('Duplicate component ID');
  ids.add(component.id);
  if (files.get(component.sourcePath) !== component.sourceHash || component.sourceCommit !== ECC_REVISION || component.license !== 'MIT') throw new Error(`Missing provenance: ${component.id}`);
  if (!component.implementationPath || !component.cost || !component.dependencies.length) throw new Error(`Unclassified component: ${component.id}`);
  if (component.state === 'available' && (!component.adapterId || !component.activationEvidence.length)) throw new Error(`Unverified activation: ${component.id}`);
  if (component.allowedTools.length) throw new Error('Catalog must not independently grant tools');
}
for (const [kind, count] of Object.entries(lock.counts)) if (catalog.components.filter(c => c.kind === kind).length !== count) throw new Error(`Incomplete component coverage: ${kind}`);
if (lock.counts.skill !== 291 || lock.counts.agent !== 68 || catalog.components.length + lock.supportingArtifacts !== files.size) throw new Error('Incomplete ECC inventory');
console.log(`ECC coverage and provenance passed: ${catalog.components.length} components, ${files.size} source files. No catalog-granted permissions.`);
