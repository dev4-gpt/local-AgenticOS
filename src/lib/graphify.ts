import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { config } from "./config";

const execFileAsync = promisify(execFile);
const HOME = os.homedir();
const GRAPHIFY_BIN = path.join(HOME, ".local", "bin", "graphify");
export const GRAPHIFY_ROOT = path.join(HOME, ".agentic-os", "graphify");
export const GRAPHIFY_OUT = path.join(GRAPHIFY_ROOT, "graphify-out");
export const GRAPHIFY_OBSIDIAN_DIR = config.vaultRoot
  ? path.join(config.vaultRoot, "Agentic OS", "Graphify")
  : "";

interface GraphData { nodes?: unknown[]; links?: unknown[]; edges?: unknown[] }

function commandEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${path.join(HOME, ".local", "bin")}: /opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ""}`.replace(": ", ":"),
    OLLAMA_BASE_URL: process.env.GRAPHIFY_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY ?? "local",
    OLLAMA_MODEL: process.env.GRAPHIFY_OLLAMA_MODEL ?? "qwen3.5:4b",
    GRAPHIFY_MAX_RETRIES: process.env.GRAPHIFY_MAX_RETRIES ?? "1",
  };
}

async function readGraph(): Promise<GraphData | null> {
  try { return JSON.parse(await readFile(path.join(GRAPHIFY_OUT, "graph.json"), "utf8")) as GraphData; }
  catch { return null; }
}

function mtime(file: string): string | null {
  try { return statSync(file).mtime.toISOString(); } catch { return null; }
}

export async function graphifyStatus() {
  const graph = path.join(GRAPHIFY_OUT, "graph.json");
  const report = path.join(GRAPHIFY_OUT, "GRAPH_REPORT.md");
  const manifest = path.join(GRAPHIFY_OBSIDIAN_DIR, ".graphify_obsidian_manifest.json");
  const data = await readGraph();
  let version = "";
  if (existsSync(GRAPHIFY_BIN)) {
    try {
      const result = await execFileAsync(GRAPHIFY_BIN, ["--version"], { env: commandEnv(), timeout: 8_000 });
      version = `${result.stdout}\n${result.stderr}`.match(/graphify\s+\S+/i)?.[0] ?? "installed";
    } catch { version = "installed"; }
  }
  return {
    installed: Boolean(version),
    version,
    configured: Boolean(config.vaultRoot),
    vaultRoot: config.vaultRoot,
    graphPath: graph,
    obsidianPath: GRAPHIFY_OBSIDIAN_DIR,
    reportAvailable: existsSync(report),
    obsidianExported: existsSync(manifest),
    ready: Boolean(version && data && config.vaultRoot),
    nodes: Array.isArray(data?.nodes) ? data.nodes.length : 0,
    edges: Array.isArray(data?.links) ? data.links.length : Array.isArray(data?.edges) ? data.edges.length : 0,
    lastBuiltAt: mtime(graph),
  };
}

async function run(args: string[], timeout: number) {
  await mkdir(GRAPHIFY_ROOT, { recursive: true });
  return execFileAsync(GRAPHIFY_BIN, args, { cwd: GRAPHIFY_ROOT, env: commandEnv(), timeout, maxBuffer: 2 * 1024 * 1024 });
}

export async function rebuildGraphify() {
  if (!config.vaultRoot) throw new Error("Configure the Obsidian vault before rebuilding Graphify.");
  if (!existsSync(GRAPHIFY_BIN)) throw new Error("Graphify is not installed. Run: uv tool install graphifyy");
  await mkdir(GRAPHIFY_OBSIDIAN_DIR, { recursive: true });
  await run(["extract", config.vaultRoot, "--out", GRAPHIFY_ROOT, "--backend", "ollama", "--model", process.env.GRAPHIFY_OLLAMA_MODEL ?? "qwen3.5:4b", "--max-concurrency", "1", "--api-timeout", "300"], 15 * 60_000);
  await run(["cluster-only", GRAPHIFY_ROOT, "--no-label", "--no-viz"], 90_000);
  await run(["export", "obsidian", "--graph", path.join(GRAPHIFY_OUT, "graph.json"), "--dir", GRAPHIFY_OBSIDIAN_DIR], 90_000);
  return graphifyStatus();
}

export async function queryGraphify(question: string) {
  const graph = path.join(GRAPHIFY_OUT, "graph.json");
  if (!existsSync(graph)) throw new Error("Build the Graphify index before querying it.");
  const result = await run(["query", question, "--graph", graph], 45_000);
  return `${result.stdout}\n${result.stderr}`.trim();
}

export async function graphifyReport() {
  return readFile(path.join(GRAPHIFY_OUT, "GRAPH_REPORT.md"), "utf8");
}
