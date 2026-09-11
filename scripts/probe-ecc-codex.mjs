#!/usr/bin/env node
// Read-only skill discovery over the installed app-server protocol. No turn or
// model request is created, and no MCP tool or hook is invoked.
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
const [home, ...projects] = process.argv.slice(2);
if (!home || projects.length < 2) throw new Error('Usage: probe-ecc-codex.mjs CODEX_HOME PROJECT_A PROJECT_B');
const child = spawn('codex', ['app-server', '--stdio'], { env: { ...process.env, CODEX_HOME: path.resolve(home) }, stdio: ['pipe', 'pipe', 'pipe'] });
let diagnostic = ''; child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
let completed = false;
const timer = setTimeout(() => { console.error('Skill discovery timed out'); child.kill(); process.exitCode = 1; }, 30_000);
readline.createInterface({ input: child.stdout }).on('line', line => {
  try {
    const response = JSON.parse(line);
    if (response.error) throw new Error(JSON.stringify(response.error));
    if (response.id === 1) {
      send({ jsonrpc: '2.0', method: 'initialized', params: {} });
      send({ jsonrpc: '2.0', id: 2, method: 'skills/list', params: { cwds: projects.map(p => path.resolve(p)), forceReload: true } });
    }
    if (response.id === 2) {
      const results = response.result.data.map(entry => {
        const skills = entry.skills.filter(s => s.path.includes('/plugins/cache/veloce-ecc/ecc/'));
        const names = new Set(skills.map(s => s.name.replace(/^ecc:/, '')));
        const errors = entry.errors.filter(e => /veloce-ecc/.test(e.path));
        if (names.size !== 360 || errors.length || !names.has('veloce-ecc')) throw new Error(`Incomplete discovery: ${names.size} skills, ${JSON.stringify(errors)}; returned names: ${JSON.stringify(entry.skills.slice(0, 12).map(s => ({ name: s.name, path: s.path })))}`);
        return { cwd: entry.cwd, discovered: names.size, roleEntrypoints: skills.filter(s => s.path.includes('/skills/ecc-agent-')).length, errors };
      });
      if (results.length !== projects.length) throw new Error('Missing project discovery result');
      console.log(JSON.stringify({ ok: true, modelRequests: 0, projects: results }, null, 2));
      completed = true; clearTimeout(timer); child.kill();
    }
  } catch (error) { console.error(error.message); clearTimeout(timer); child.kill(); process.exitCode = 1; }
});
child.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
child.on('exit', () => { if (!completed) { clearTimeout(timer); console.error(diagnostic); process.exitCode = 1; } });
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'veloce-ecc-verifier', version: '1.0.0' } } });
