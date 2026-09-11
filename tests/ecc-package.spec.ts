import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ECC_REVISION, digest, filesAt, packageEcc, verifyPackage } from '../scripts/lib/ecc-package.mjs';

test('ECC packaging namespaces collisions, disables startup and detects modifications', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-package-test-'));
  try {
    const source = path.join(root, 'source'); const output = path.join(root, 'output');
    const fixture = {
      'skills/review/SKILL.md': '---\nname: review\ndescription: review\n---\nRead ../../agents/reviewer.md',
      'agents/reviewer.md': 'Review the actual code.',
      '.codex-plugin/plugin.json': JSON.stringify({ name: 'ecc', skills: './skills', hooks: './hooks.json', mcpServers: './.mcp.json' }),
      'LICENSE': 'MIT fixture',
      '.mcp.json': JSON.stringify({ mcpServers: { unwanted: { command: 'npx', args: ['paid-runtime'] } } }),
      'hooks/hooks.json': JSON.stringify({ hooks: { SessionStart: [{ command: 'observer' }] } }),
    };
    for (const [p, content] of Object.entries(fixture)) { fs.mkdirSync(path.dirname(path.join(source, p)), { recursive: true }); fs.writeFileSync(path.join(source, p), content); }
    const lock = { revision: ECC_REVISION, files: filesAt(source).map(p => ({ path: p, sha256: digest(fs.readFileSync(path.join(source, p))) })) };
    packageEcc(source, output, lock);
    expect(verifyPackage(output).automaticHooks).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(output, '.mcp.json'), 'utf8'))).toEqual({ mcpServers: {} });
    expect(JSON.parse(fs.readFileSync(path.join(output, 'hooks/hooks.json'), 'utf8'))).toEqual({ hooks: {} });
    expect(fs.readFileSync(path.join(output, '.veloce-upstream-originals/.mcp.json'), 'utf8')).toContain('paid-runtime');
    expect(fs.readFileSync(path.join(output, 'skills/review/SKILL.md'), 'utf8')).toContain('name: ecc-review');
    expect(fs.readFileSync(path.join(source, 'skills/review/SKILL.md'), 'utf8')).toContain('name: review');
    expect(fs.readFileSync(path.join(output, 'skills/ecc-agent-reviewer/SKILL.md'), 'utf8')).toContain('../../agents/reviewer.md');
    expect(() => packageEcc(source, output, lock)).toThrow('already exists');
    fs.writeFileSync(path.join(output, '.DS_Store'), 'Finder metadata is not package-owned');
    expect(verifyPackage(output).files.some(f => f.path === '.DS_Store')).toBe(false);
    fs.appendFileSync(path.join(output, 'LICENSE'), 'changed');
    expect(() => verifyPackage(output)).toThrow('Modified package file');
    fs.appendFileSync(path.join(source, 'LICENSE'), 'changed');
    expect(() => packageEcc(source, path.join(root, 'tampered'), lock)).toThrow('checksum mismatch');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('ECC packaging rejects source symlinks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-link-test-'));
  try { fs.symlinkSync('/etc/hosts', path.join(root, 'external')); expect(() => filesAt(root)).toThrow('Symlink rejected'); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});
