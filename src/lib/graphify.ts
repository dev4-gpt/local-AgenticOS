import { execFile } from "node:child_process";
import { constants as fsConstants, existsSync, statSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { config } from "./config";

const execFileAsync = promisify(execFile);
const HOME = os.homedir();
const GRAPHIFY_BIN = path.join(HOME, ".local", "bin", "graphify");
export const GRAPHIFY_ROOT = path.join(HOME, ".agentic-os", "graphify");
export const GRAPHIFY_OUT = path.join(GRAPHIFY_ROOT, "graphify-out");
export const GRAPHIFY_CORPUS = path.join(GRAPHIFY_ROOT, "corpus");
export const GRAPHIFY_OBSIDIAN_DIR = config.vaultRoot
  ? path.join(config.vaultRoot, "Agentic OS", "Graphify")
  : "";

interface GraphData { nodes?: unknown[]; links?: unknown[]; edges?: unknown[] }

export interface CorpusManifest { files: number; bytes: number; updatedAt: string }
export interface GraphifyBuildState {
  phase: "idle" | "running" | "succeeded" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

let buildState: GraphifyBuildState = {
  phase: "idle",
  startedAt: null,
  finishedAt: null,
  error: null,
};

const SOURCE_EXTENSIONS = new Set([".md", ".txt", ".json", ".csv", ".html", ".htm", ".pdf", ".docx", ".rtf"]);
const SKIP_SOURCE_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules", "graphify-out", "Graphify"]);
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

function commandEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${path.join(HOME, ".local", "bin")}: /opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ""}`.replace(": ", ":"),
    OLLAMA_BASE_URL: process.env.GRAPHIFY_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY ?? "local",
    OLLAMA_MODEL: process.env.GRAPHIFY_OLLAMA_MODEL ?? "qwen3.5:4b",
    GRAPHIFY_MAX_RETRIES: process.env.GRAPHIFY_MAX_RETRIES ?? "0",
    GRAPHIFY_OLLAMA_NUM_CTX: process.env.GRAPHIFY_OLLAMA_NUM_CTX ?? "8192",
    GRAPHIFY_MAX_OUTPUT_TOKENS: process.env.GRAPHIFY_MAX_OUTPUT_TOKENS ?? "768",
    GRAPHIFY_DISABLE_THINKING: process.env.GRAPHIFY_DISABLE_THINKING ?? "true",
  };
}

async function readGraph(): Promise<GraphData | null> {
  try { return JSON.parse(await readFile(path.join(GRAPHIFY_OUT, "graph.json"), "utf8")) as GraphData; }
  catch { return null; }
}

function mtime(file: string): string | null {
  try { return statSync(file).mtime.toISOString(); } catch { return null; }
}

async function readCorpusManifest(): Promise<CorpusManifest | null> {
  try { return JSON.parse(await readFile(path.join(GRAPHIFY_ROOT, "corpus-manifest.json"), "utf8")) as CorpusManifest; }
  catch { return null; }
}

export async function stageGraphifyCorpus(): Promise<CorpusManifest> {
  if (!config.vaultRoot) throw new Error("Configure the Obsidian vault before rebuilding Graphify.");
  await rm(GRAPHIFY_CORPUS, { recursive: true, force: true });
  await mkdir(GRAPHIFY_CORPUS, { recursive: true });
  let files = 0;
  let bytes = 0;

  async function walk(sourceDir: string, relativeDir: string) {
    let entries;
    try { entries = await readdir(sourceDir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || SKIP_SOURCE_DIRS.has(entry.name)) continue;
      const source = path.join(sourceDir, entry.name);
      const relative = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        await walk(source, relative);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      let info;
      try { info = await stat(source); } catch { continue; }
      if (info.size <= 0 || info.size > MAX_SOURCE_BYTES) continue;
      const destination = path.join(GRAPHIFY_CORPUS, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      try { await copyFile(source, destination, fsConstants.COPYFILE_FICLONE); }
      catch { await copyFile(source, destination); }
      files += 1;
      bytes += info.size;
    }
  }

  await walk(config.vaultRoot, "");
  const manifest = { files, bytes, updatedAt: new Date().toISOString() };
  await writeFile(path.join(GRAPHIFY_ROOT, "corpus-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

export async function graphifyStatus() {
  const graph = path.join(GRAPHIFY_OUT, "graph.json");
  const report = path.join(GRAPHIFY_OUT, "GRAPH_REPORT.md");
  const manifest = path.join(GRAPHIFY_OBSIDIAN_DIR, ".graphify_obsidian_manifest.json");
  const data = await readGraph();
  const corpus = await readCorpusManifest();
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
    corpusFiles: corpus?.files ?? 0,
    corpusBytes: corpus?.bytes ?? 0,
    corpusUpdatedAt: corpus?.updatedAt ?? null,
    build: { ...buildState },
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
  const corpus = await stageGraphifyCorpus();
  if (corpus.files === 0) throw new Error("No supported source documents were found in the configured vault.");
  await run([
    "extract", GRAPHIFY_CORPUS,
    "--out", GRAPHIFY_ROOT,
    "--backend", "ollama",
    "--model", process.env.GRAPHIFY_OLLAMA_MODEL ?? "qwen3.5:4b",
    "--max-concurrency", "1",
    "--token-budget", process.env.GRAPHIFY_TOKEN_BUDGET ?? "2500",
    "--api-timeout", "120",
  ], 15 * 60_000);
  await run(["cluster-only", GRAPHIFY_ROOT, "--no-label", "--no-viz"], 90_000);
  await run(["export", "obsidian", "--graph", path.join(GRAPHIFY_OUT, "graph.json"), "--dir", GRAPHIFY_OBSIDIAN_DIR], 90_000);
  return graphifyStatus();
}

export function startGraphifyBuild(): GraphifyBuildState {
  if (buildState.phase === "running") return { ...buildState };
  buildState = {
    phase: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };
  void rebuildGraphify()
    .then(() => {
      buildState = { ...buildState, phase: "succeeded", finishedAt: new Date().toISOString(), error: null };
    })
    .catch((error) => {
      buildState = {
        ...buildState,
        phase: "failed",
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
    });
  return { ...buildState };
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
