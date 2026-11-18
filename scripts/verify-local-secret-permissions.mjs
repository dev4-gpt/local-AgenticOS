#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(valueAfter("--root") ?? process.cwd());
const protectedFiles = [
  ".env.local",
  ".vercel/.env.production.local",
  "product-experience/.env.local",
  ".private-client-kits/internal-beta-parity.env",
];

if (process.platform === "win32") {
  console.log("Local secret-file permission check skipped: POSIX mode bits are unavailable on Windows.");
  process.exit(0);
}

const checked = [];
const failures = [];
for (const relativePath of protectedFiles) {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) continue;
  checked.push(relativePath);
  const mode = statSync(filePath).mode & 0o777;
  if ((mode & 0o077) !== 0) failures.push(`${relativePath}: must be owner-only (0600)`);
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(`Local secret-file permissions passed (${checked.length} present, values not read).`);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
