#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ECC_REVISION, packageEcc, verifyPackage } from './lib/ecc-package.mjs';
const option = (name) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const action = option('--action') || 'verify';
const home = path.resolve(option('--codex-home') || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const packageRoot = path.resolve(option('--package-root') || path.join(home, 'veloce-ecc', ECC_REVISION));
const registration = path.join(home, 'veloce-ecc-installation.json');
function codex(args) {
  const result = spawnSync('codex', args, { env: { ...process.env, CODEX_HOME: home }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Codex plugin command failed');
  return result.stdout;
}
if (action === 'install') {
  fs.mkdirSync(home, { recursive: true });
  const markets = JSON.parse(codex(['plugin', 'marketplace', 'list', '--json'])).marketplaces;
  const existing = markets.find(m => m.name === 'veloce-ecc');
  if (existing && (!fs.existsSync(registration) || path.resolve(existing.root) !== packageRoot)) throw new Error('Unowned marketplace collision; existing registration preserved');
  if (fs.existsSync(registration)) {
    const prior = JSON.parse(fs.readFileSync(registration, 'utf8'));
    if (prior.packageRoot !== packageRoot || prior.revision !== ECC_REVISION) throw new Error('Existing ECC installation differs; inspect before changing it');
  }
  if (!fs.existsSync(path.join(packageRoot, 'veloce-package-receipt.json'))) {
    const source = option('--source');
    if (!source) throw new Error('--source pinned checkout is required');
    const lock = JSON.parse(fs.readFileSync(new URL('../infrastructure/ecc-upstream.lock.json', import.meta.url), 'utf8'));
    packageEcc(path.resolve(source), packageRoot, lock);
  }
  verifyPackage(packageRoot);
  fs.writeFileSync(registration, JSON.stringify({ schemaVersion: 1, revision: ECC_REVISION, pluginId: 'ecc@veloce-ecc', packageRoot, codexHome: home, status: 'prepared' }, null, 2) + '\n');
  codex(['plugin', 'marketplace', 'add', packageRoot, '--json']);
  codex(['plugin', 'add', 'ecc@veloce-ecc', '--json']);
  fs.writeFileSync(registration, JSON.stringify({ schemaVersion: 1, revision: ECC_REVISION, pluginId: 'ecc@veloce-ecc', packageRoot, codexHome: home }, null, 2) + '\n');
  console.log(codex(['plugin', 'list', '--json']));
} else if (action === 'verify') {
  const receipt = verifyPackage(packageRoot);
  console.log(JSON.stringify({ ok: true, revision: receipt.revision, fileCount: receipt.files.length, hookStartup: false, mcpStartup: false }));
  console.log(codex(['plugin', 'list', '--json']));
} else if (action === 'uninstall') {
  const saved = JSON.parse(fs.readFileSync(registration, 'utf8'));
  if (saved.pluginId !== 'ecc@veloce-ecc' || saved.codexHome !== home || saved.packageRoot !== packageRoot) throw new Error('Ownership receipt mismatch');
  // Preserve changed packages and all memories; never recursively erase a user home.
  verifyPackage(packageRoot);
  codex(['plugin', 'remove', 'ecc@veloce-ecc']);
  codex(['plugin', 'marketplace', 'remove', 'veloce-ecc']);
  const receipt = verifyPackage(packageRoot);
  // Remove only receipt-owned files. Finder metadata and any retained memory
  // must not be swept up by a recursive directory deletion.
  for (const file of receipt.files) fs.unlinkSync(path.join(packageRoot, file.path));
  fs.unlinkSync(path.join(packageRoot, 'veloce-package-receipt.json'));
  const directories = new Set(receipt.files.flatMap(file => {
    const parents = []; let directory = path.dirname(path.join(packageRoot, file.path));
    while (directory.startsWith(packageRoot + path.sep)) { parents.push(directory); directory = path.dirname(directory); }
    return parents;
  }));
  for (const directory of [...directories, packageRoot].sort((a, b) => b.length - a.length)) {
    try { fs.rmdirSync(directory); } catch (error) { if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error; }
  }
  fs.unlinkSync(registration);
  console.log('ECC registration, native cache and unchanged owned package removed. Unrelated state and memories preserved.');
} else throw new Error('Expected --action install, verify or uninstall');
