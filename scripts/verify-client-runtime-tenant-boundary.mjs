#!/usr/bin/env node
// Policy-as-code release gate: tenant-boundary static check.
//
// Every route under src/app/api/client-runtime/** serves one tenant's data,
// so every one of them must go through the session-bound scoping this
// platform already has: @/lib/clientAuth and/or @/lib/clientDataPlane
// (whose insert/update/delete/rpc/query helpers send the caller's Supabase
// access token, which is what RLS actually keys the tenant boundary on).
//
// A few routes delegate to a feature-specific data-layer module instead.
// That's legitimate layering, not a gap -- but only if that module still
// imports clientAuth/clientDataPlane, so this checks one level of
// indirection through an explicit allowlist rather than trusting it
// blindly. Add to INDIRECT_TENANT_SCOPE_MODULES when a new feature
// introduces its own data-layer module following the same pattern.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const routesDir = join(root, "src/app/api/client-runtime");
const DIRECT_MARKERS = ['"@/lib/clientAuth"', '"@/lib/clientDataPlane"'];
const INDIRECT_TENANT_SCOPE_MODULES = ["src/lib/clientPaperclipData.ts"];
const failures = [];
let routesChecked = 0;

const indirectNames = [];
for (const modulePath of INDIRECT_TENANT_SCOPE_MODULES) {
  const source = await readFile(join(root, modulePath), "utf8");
  expect(DIRECT_MARKERS.some((m) => source.includes(m)), `${modulePath} is on the indirect tenant-scope allowlist but no longer imports clientAuth/clientDataPlane -- remove it from the allowlist or restore the import`);
  indirectNames.push(`"@/lib/${modulePath.split("/").pop().replace(".ts", "")}"`);
}

for (const file of await walk(routesDir)) {
  if (!file.endsWith("route.ts")) continue;
  routesChecked++;
  const label = relative(root, file);
  const source = await readFile(file, "utf8");
  const ok = DIRECT_MARKERS.some((m) => source.includes(m)) || indirectNames.some((m) => source.includes(m));
  if (!ok) failures.push(`${label} does not import @/lib/clientAuth or @/lib/clientDataPlane (directly, or via an allowlisted data-layer module)`);
}
expect(routesChecked > 0, `no client-runtime route files found under ${relative(root, routesDir)}`);

console.log(JSON.stringify({ ok: failures.length === 0, routesChecked, failures }, null, 2));
if (failures.length) process.exit(1);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const paths = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(full)); else paths.push(full);
  }
  return paths;
}
function expect(condition, message) { if (!condition) failures.push(message); }
