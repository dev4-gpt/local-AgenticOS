#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ECC_REVISION, filesAt, digest } from './lib/ecc-package.mjs';
const source = path.resolve(process.argv[2] || '../ecc-integration-artifacts/upstream');
const files = filesAt(source);
const sourceFiles = files.map(p => ({ path: p, sha256: digest(fs.readFileSync(path.join(source, p))),
  nature: /\.(m?js|cjs|py|sh|ps1|ts|tsx)$/.test(p) ? 'executable-source' : /\.(md|txt|rst)$/.test(p) || /LICENSE$/.test(p) ? 'documentation' : /\.(json|ya?ml|toml)$/.test(p) ? 'configuration' : 'supporting-asset',
  disposition: 'preserved-reference-only', implementationPath: 'Preserve pinned bytes; require a reviewed adapter, dependency pins and verification before execution.',
}));
const classify = (p) => /^skills\/[^/]+\/SKILL.md$/.test(p) ? 'skill'
  : /^agents\/[^/]+\.md$/.test(p) ? 'agent'
    : /^(commands|legacy-command-shims)\//.test(p) ? 'command'
      : /^rules\/.*\.md$/.test(p) ? 'rule'
        : /^workflows\//.test(p) ? 'workflow'
          : /^hooks\/.*\.json$/.test(p) ? 'hook'
            : /^(mcp-configs\/.*|\.mcp)\.json$/.test(p) ? 'mcp-configuration'
            : /^scripts\/.*\.(m?js|py|sh)$/.test(p) ? 'runtime' : 'supporting-artifact';
const department = (name) => /security|safety|review|audit|test|eval|quality|verification/.test(name) ? 'security-quality'
  : /research|search|scholar|pubmed|patent/.test(name) ? 'research'
    : /marketing|content|brand|seo|social|video|design|motion|writing|slides/.test(name) ? 'content-growth'
      : /billing|finance|customer|logistics|inventory|procurement|legal|agreement|ops|chief|shipping/.test(name) ? 'business-operations'
        : /data|network|infra|docker|kubernetes|memory|learning|context|ml|pytorch|homelab/.test(name) ? 'data-infrastructure' : 'engineering';
const components = sourceFiles.filter(f => classify(f.path) !== 'supporting-artifact').map(f => {
  const kind = classify(f.path);
  const key = kind === 'skill' ? f.path.split('/')[1] : path.basename(f.path).replace(/\.[^.]+$/, '');
  const specialized = /healthcare|hipaa|defi|trading|payment-x402|ito-|nutrient|fal-ai|videodb|energy-procurement/.test(key);
  return { id: `ecc:${kind}:${f.path}`, key, kind, compatibilityShim: f.path.startsWith('legacy-command-shims/'), label: key.replaceAll('-', ' '), sourcePath: f.path, sourceHash: f.sha256,
    sourceRepository: 'https://github.com/affaan-m/ECC', sourceCommit: ECC_REVISION, license: 'MIT',
    department: department(key), intendedOutcome: `Review and adapt upstream ${kind}: ${key}`,
    environments: ['upstream-documented'], allowedTools: [], dependencies: ['component-specific adapter and dependency review'],
    cost: specialized ? 'requires-explicit-review' : 'no-cost-catalog; execution-unverified',
    state: specialized ? 'requires-configuration' : 'awaiting-adaptation', adapterId: null, activationEvidence: [],
    implementationPath: kind === 'skill' || kind === 'agent' ? 'Map to a reviewed Veloce playbook; enforce existing tools, tenant scope and budget.' : 'Review platform compatibility; port only bounded behavior into existing Veloce jobs and policy gates.' };
});
const counts = Object.fromEntries([...new Set(components.map(c => c.kind))].map(k => [k, components.filter(c => c.kind === k).length]));
if (counts.skill !== 291 || counts.agent !== 68) throw new Error('Pinned inventory count mismatch');
const lock = { schemaVersion: 1, repository: 'https://github.com/affaan-m/ECC', revision: ECC_REVISION, license: 'MIT', counts, supportingArtifacts: sourceFiles.length - components.length, files: sourceFiles };
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('infrastructure/ecc-upstream.lock.json', JSON.stringify(lock, null, 2) + '\n');
fs.writeFileSync('src/data/ecc-components.json', JSON.stringify({ schemaVersion: 1, revision: ECC_REVISION, components }, null, 2) + '\n');
fs.mkdirSync('third-party/ecc', { recursive: true });
fs.copyFileSync(path.join(source, 'LICENSE'), 'third-party/ecc/LICENSE');
console.log(JSON.stringify({ counts, totalFiles: files.length, supportingArtifacts: lock.supportingArtifacts }));
