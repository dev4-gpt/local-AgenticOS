#!/usr/bin/env node
import fs from 'node:fs';
import { ECC_REVISION } from './lib/ecc-package.mjs';
const lock = JSON.parse(fs.readFileSync('infrastructure/ecc-upstream.lock.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('src/data/ecc-components.json', 'utf8'));
const registrations = JSON.parse(fs.readFileSync('src/data/ecc-adapters.json', 'utf8'));
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
const adapters = new Set();
for (const adapter of registrations.adapters) {
  if (adapters.has(adapter.id) || !ids.has(adapter.componentId)) throw new Error('Duplicate or unpinned adapter');
  adapters.add(adapter.id);
  if (adapter.tools.length || adapter.externalInference !== false || adapter.cost !== 'zero-provider-cost' || adapter.requiredCapability !== 'ecc-workflows' || adapter.environment !== 'node-server') throw new Error('Unauthorized adapter permissions or cost');
  if (!fs.existsSync(adapter.verification) || !adapter.steps.length) throw new Error('Missing adapter verification');
}
// Deterministic adapters must remain independent of provider/network runtimes.
for (const file of ['src/lib/eccAdapter.ts', 'src/lib/eccCatalog.ts', 'src/lib/eccSafety.ts']) {
  const source = fs.readFileSync(file, 'utf8');
  if (/\bfetch\s*\(|\b(?:exec|spawn|eval)\s*\(|import\s*\(/.test(source)) throw new Error(`Executable egress in deterministic adapter: ${file}`);
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) if (!['node:crypto', '@/lib/eccCatalog', '@/lib/eccSafety', '@/data/ecc-components.json', '@/data/ecc-adapters.json'].includes(match[1])) throw new Error(`Unreviewed adapter dependency: ${match[1]}`);
}
if (lock.counts.skill !== 291 || lock.counts.agent !== 68 || catalog.components.length + lock.supportingArtifacts !== files.size) throw new Error('Incomplete ECC inventory');
console.log(`ECC coverage and provenance passed: ${catalog.components.length} components, ${files.size} source files. No catalog-granted permissions.`);
