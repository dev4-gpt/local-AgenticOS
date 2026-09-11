import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const ECC_REVISION = 'c9148d0bb239ed01a95724a5928b98cdf9c30658';
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function filesAt(root, prefix = '') {
  return fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink rejected: ${name}`);
    if (entry.isDirectory()) return filesAt(root, name);
    if (!entry.isFile()) throw new Error(`Non-file rejected: ${name}`);
    return [name];
  });
}
export function verifySource(root, lock) {
  if (lock.revision !== ECC_REVISION) throw new Error('Unexpected ECC revision');
  const files = filesAt(root);
  if (JSON.stringify(files) !== JSON.stringify(lock.files.map(f => f.path))) throw new Error('Source file set differs from lock');
  for (const file of lock.files) if (digest(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw new Error(`Source checksum mismatch: ${file.path}`);
}
export function packageEcc(source, output, lock) {
  verifySource(source, lock);
  if (fs.existsSync(output) && (fs.lstatSync(output).isSymbolicLink() || filesAt(output).some(p => path.basename(p) !== '.DS_Store'))) throw new Error('Package destination already exists');
  fs.cpSync(source, output, { recursive: true, errorOnExist: true });
  const write = (name, data) => { const p = path.join(output, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
  const overlays = [];
  const overlay = (name, data) => {
    if (fs.existsSync(path.join(source, name))) write(`.veloce-upstream-originals/${name}`, fs.readFileSync(path.join(source, name)));
    write(name, data); overlays.push(name);
  };
  for (const name of lock.files.map(f => f.path).filter(p => /^skills\/[^/]+\/SKILL.md$/.test(p))) {
    const original = fs.readFileSync(path.join(source, name), 'utf8');
    const id = name.split('/')[1];
    const frontmatter = original.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter || !/^name:/m.test(frontmatter[1])) throw new Error(`Skill name missing: ${name}`);
    const replacement = frontmatter[0].replace(/^name:.*$/m, `name: ecc-${id}`);
    overlay(name, original.replace(frontmatter[0], replacement));
  }
  for (const file of lock.files.filter(f => /^agents\/[^/]+\.md$/.test(f.path))) {
    const id = path.basename(file.path, '.md');
    overlay(`skills/ecc-agent-${id}/SKILL.md`, `---\nname: ecc-agent-${id}\ndescription: Use the ECC ${id} role for an explicitly selected task, within existing tool and approval boundaries.\n---\n\nRead ../../${file.path} as role guidance for the current task.\nThis role grants no permissions, changes no model, and starts no background agents.\nUser instructions and host security controls take precedence. Verify all claims against source evidence.\n`);
  }
  overlay('skills/veloce-ecc/SKILL.md', `---\nname: veloce-ecc\ndescription: Use ECC guidance across Codex projects with scoped recall, evidence-based verification and explicit learning checkpoints.\n---\n\n1. Identify the current repository. Recall only reviewed project artifacts and explicit user-approved global lessons.\n2. Select the relevant ecc-prefixed skill or ecc-agent role, then read its SKILL.md. Do not load the entire catalog.\n3. Execute through the host's existing tools, authorization and budget boundaries. No paid services, background observer or automatic promotion.\n4. Verify outcomes with actual evidence. A prompt, checklist or catalog entry is not an execution result.\n5. At an explicit learning checkpoint, draft a sanitized lesson or handoff with source hashes and evidence links. Store project drafts under .ecc/memory/project only after protecting that directory with a dedicated .gitignore; never overwrite a conflicting ignore file.\n6. Keep drafts untrusted. A human reviews exact content before promoting it into a governed project artifact. Global promotion is a separate explicit review; never share tenant data.\n\nDo not copy transcripts, credentials, cookies or private personal information into memory. Do not run ECC hook installers, enable observers, use paid inference or add MCP servers implicitly. Existing host and project instructions take precedence.\n`);
  const plugin = JSON.parse(fs.readFileSync(path.join(source, '.codex-plugin/plugin.json'), 'utf8'));
  delete plugin.hooks; delete plugin.mcpServers;
  plugin.version = '2.2.1-veloce.2';
  plugin.description = 'Pinned ECC skills and explicit role/checkpoint workflows; automatic hooks and bundled MCP startup disabled.';
  if (plugin.interface) {
    plugin.interface.shortDescription = '291 ECC skills, 68 specialist roles and explicit learning checkpoints.';
    plugin.interface.defaultPrompt = ['Use the veloce-ecc workflow for this project.', 'Use ecc-security-review to review the current changes.', 'Use ecc-verification-loop to verify the results.'];
  }
  // Codex supplements manifest paths with default discovery. Removing manifest
  // fields alone does not disable default .mcp.json or hooks/hooks.json.
  overlay('.mcp.json', JSON.stringify({ mcpServers: {} }, null, 2) + '\n');
  for (const name of ['hooks/hooks.json', 'hooks/codex-hooks.json', 'hooks/memory-persistence/hooks.json', '.cursor/hooks.json']) {
    overlay(name, JSON.stringify({ hooks: {} }, null, 2) + '\n');
  }
  overlay('.codex-plugin/plugin.json', JSON.stringify(plugin, null, 2) + '\n');
  overlay('.agents/plugins/marketplace.json', JSON.stringify({ name: 'veloce-ecc', interface: { displayName: 'Veloce ECC' }, plugins: [{ name: 'ecc', version: plugin.version, category: 'Coding', source: { source: 'local', path: './' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' } }] }, null, 2) + '\n');
  const receipt = { schemaVersion: 1, revision: lock.revision, pluginId: 'ecc@veloce-ecc', automaticHooks: false, automaticMcp: false, overlays, files: filesAt(output).filter(p => path.basename(p) !== '.DS_Store').map(p => ({ path: p, sha256: digest(fs.readFileSync(path.join(output, p))) })) };
  write('veloce-package-receipt.json', JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
export function verifyPackage(root) {
  const receipt = JSON.parse(fs.readFileSync(path.join(root, 'veloce-package-receipt.json'), 'utf8'));
  if (receipt.revision !== ECC_REVISION || receipt.pluginId !== 'ecc@veloce-ecc') throw new Error('Unrecognized package receipt');
  const actual = filesAt(root).filter(p => p !== 'veloce-package-receipt.json' && path.basename(p) !== '.DS_Store');
  if (JSON.stringify(actual) !== JSON.stringify(receipt.files.map(f => f.path))) throw new Error('Package contains missing or unowned files');
  for (const file of receipt.files) if (digest(fs.readFileSync(path.join(root, file.path))) !== file.sha256) throw new Error(`Modified package file: ${file.path}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));
  if (manifest.hooks || manifest.mcpServers) throw new Error('Automatic startup is prohibited');
  for (const [name, key] of [['.mcp.json', 'mcpServers'], ['hooks/hooks.json', 'hooks'], ['hooks/codex-hooks.json', 'hooks'], ['hooks/memory-persistence/hooks.json', 'hooks'], ['.cursor/hooks.json', 'hooks']]) {
    if (Object.keys(JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))[key] || {}).length) throw new Error(`Automatic startup is prohibited: ${name}`);
  }
  return receipt;
}
