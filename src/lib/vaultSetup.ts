import { readdirSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "./config";

export interface VaultCandidate {
  path: string;
  label: string;
  noteCount: number;
  hasObsidianConfig: boolean;
  source: "configured" | "common" | "scan";
}

export interface VaultSetupStatus {
  configured: boolean;
  activeVault: string | null;
  configPath: string;
  candidates: VaultCandidate[];
}

const CONFIG_DIR = path.join(os.homedir(), ".agentic-os");
export const AGENTIC_CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const SCAN_ROOTS = [
  path.join(os.homedir(), "Documents"),
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "Dropbox"),
  path.join(os.homedir(), "Library", "Mobile Documents", "iCloud~md~obsidian", "Documents"),
];

const COMMON_VAULTS = [
  path.join(os.homedir(), "Documents", "Obsidian Vault"),
  path.join(os.homedir(), "Obsidian Vault"),
  path.join(os.homedir(), "Obsidian"),
];

function isDirectory(p: string): boolean {
  try { return statSync(p).isDirectory(); }
  catch { return false; }
}

function countMarkdown(dir: string, maxDepth = 2): number {
  let total = 0;
  function walk(current: string, depth: number) {
    if (depth > maxDepth || total > 200) return;
    let items;
    try { items = readdirSync(current, { withFileTypes: true }); }
    catch { return; }
    for (const item of items) {
      if (item.name === ".git" || item.name === "node_modules" || item.name === ".trash") continue;
      const full = path.join(current, item.name);
      if (item.isDirectory()) walk(full, depth + 1);
      else if (item.isFile() && item.name.toLowerCase().endsWith(".md")) total += 1;
    }
  }
  walk(dir, 0);
  return total;
}

function toCandidate(p: string, source: VaultCandidate["source"]): VaultCandidate | null {
  if (!isDirectory(p)) return null;
  const hasObsidianConfig = isDirectory(path.join(p, ".obsidian"));
  if (source === "scan" && !hasObsidianConfig) return null;
  const noteCount = countMarkdown(p);
  if (!hasObsidianConfig && noteCount === 0) return null;
  return {
    path: p,
    label: path.basename(p) || p,
    noteCount,
    hasObsidianConfig,
    source,
  };
}

export function findVaultCandidates(): VaultCandidate[] {
  const seen = new Set<string>();
  const candidates: VaultCandidate[] = [];

  function add(p: string | null | undefined, source: VaultCandidate["source"]) {
    if (!p) return;
    const resolved = path.resolve(p);
    if (seen.has(resolved)) return;
    const candidate = toCandidate(resolved, source);
    if (!candidate) return;
    seen.add(resolved);
    candidates.push(candidate);
  }

  add(config.vaultRoot, "configured");
  for (const p of COMMON_VAULTS) add(p, "common");

  for (const root of SCAN_ROOTS) {
    if (!isDirectory(root)) continue;
    let items;
    try { items = readdirSync(root, { withFileTypes: true }); }
    catch { continue; }
    for (const item of items) {
      if (!item.isDirectory()) continue;
      if (!/(obsidian|vault|notes|second brain)/i.test(item.name)) continue;
      add(path.join(root, item.name), "scan");
    }
  }

  return candidates.sort((a, b) => {
    if (a.source === "configured" && b.source !== "configured") return -1;
    if (b.source === "configured" && a.source !== "configured") return 1;
    if (a.hasObsidianConfig !== b.hasObsidianConfig) return a.hasObsidianConfig ? -1 : 1;
    return b.noteCount - a.noteCount;
  });
}

export function vaultSetupStatus(): VaultSetupStatus {
  return {
    configured: Boolean(config.vaultRoot),
    activeVault: config.vaultRoot,
    configPath: AGENTIC_CONFIG_PATH,
    candidates: findVaultCandidates(),
  };
}

function validateVaultPath(vaultPath: string): string {
  const resolved = path.resolve(vaultPath.trim());
  if (!resolved.startsWith(`${os.homedir()}${path.sep}`)) {
    throw new Error("Choose a folder inside your home directory.");
  }
  if (!isDirectory(resolved)) {
    throw new Error("That folder does not exist.");
  }
  const candidate = toCandidate(resolved, "scan");
  if (!candidate) {
    throw new Error("That folder does not look like an Obsidian vault yet.");
  }
  return resolved;
}

export async function saveVaultRoot(vaultPath: string) {
  const resolved = validateVaultPath(vaultPath);
  await mkdir(CONFIG_DIR, { recursive: true });
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(await readFile(AGENTIC_CONFIG_PATH, "utf8")) as Record<string, unknown>;
  } catch {
    data = {};
  }
  data.vaultRoot = resolved;
  await writeFile(AGENTIC_CONFIG_PATH, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  return {
    ok: true,
    vaultRoot: resolved,
    configPath: AGENTIC_CONFIG_PATH,
    restartRequired: true,
  };
}
