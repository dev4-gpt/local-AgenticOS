// Real task execution for Ruflo swarms.
//
// Ruflo's own CLI is explicit about this (`ruflo swarm start` prints it
// verbatim): it only coordinates agent STATE. It does not execute anything
// itself. Real execution happens here, through whichever of this app's
// already-working agent CLIs/APIs the user picks - the same ones the rest of
// the app already uses elsewhere (api/claude/chat, api/kimi/chat,
// api/grok/chat, the Local Agent Kanban's Ollama helper) - not a separate
// key or subscription.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { run } from "@/lib/runner";
import { localChat, resolveModel as resolveLocalModel } from "@/lib/localOllama";
import type { ExecModel } from "@/lib/rufloModels";

const RESULTS_ROOT = path.join(os.homedir(), ".agentic-os", "ruflo-results");

interface ExecResult { ok: boolean; output?: string; error?: string; }

// Best-effort concatenation of a streamed JSON-lines CLI's text chunks - kimi
// and grok both stream line-delimited JSON, but with different shapes.
function extractStreamText(stdout: string, pick: (obj: Record<string, unknown>) => string | null): string {
  let text = "";
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const v = pick(JSON.parse(t) as Record<string, unknown>);
      if (v) text += v;
    } catch { /* non-JSON line, ignore */ }
  }
  return text.trim();
}

async function execTask(execModel: ExecModel, prompt: string): Promise<ExecResult> {
  if (execModel.startsWith("claude-")) {
    const model = execModel.slice("claude-".length);
    const res = await run("claude", ["-p", "--model", model, prompt], { timeoutMs: 90_000 });
    return res.ok && res.stdout.trim() ? { ok: true, output: res.stdout.trim() } : { ok: false, error: res.stderr.slice(0, 500) || "no output" };
  }
  if (execModel === "kimi") {
    const res = await run("kimi", ["-p", prompt, "--output-format", "stream-json"], { timeoutMs: 90_000 });
    if (!res.ok) return { ok: false, error: res.stderr.slice(0, 500) };
    const text = extractStreamText(res.stdout, (o) => (o.role === "assistant" && typeof o.content === "string" ? o.content : null));
    return text ? { ok: true, output: text } : { ok: false, error: "no output" };
  }
  if (execModel === "grok") {
    const res = await run("grok", ["-p", prompt, "--output-format", "streaming-json", "--always-approve"], { timeoutMs: 90_000 });
    if (!res.ok) return { ok: false, error: res.stderr.slice(0, 500) };
    const text = extractStreamText(res.stdout, (o) => (o.type === "text" && typeof o.data === "string" ? o.data : null));
    return text ? { ok: true, output: text } : { ok: false, error: "no output" };
  }
  if (execModel === "local") {
    try {
      const model = await resolveLocalModel();
      const output = await localChat(model, "You are a focused SEO specialist. Answer concisely and directly.", prompt, { timeoutMs: 90_000 });
      return output ? { ok: true, output } : { ok: false, error: "no output (is Ollama running?)" };
    } catch (e) {
      return { ok: false, error: String(e).slice(0, 500) };
    }
  }
  return { ok: false, error: `unknown model: ${execModel}` };
}

export interface RufloTaskResult {
  agentId: string;
  type: string;
  name: string;
  task: string;
  status: "running" | "done" | "failed";
  output?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface RufloResultsFile {
  swarmId: string;
  objective: string;
  startedAt: number;
  tasks: RufloTaskResult[];
}

function resultsPath(swarmId: string): string {
  const safe = swarmId.replace(/[^a-z0-9-]/gi, "");
  return path.join(RESULTS_ROOT, `${safe}.json`);
}

export async function readResults(swarmId: string): Promise<RufloResultsFile | null> {
  const p = resultsPath(swarmId);
  if (!existsSync(p)) return null;
  try { return JSON.parse(await readFile(p, "utf8")) as RufloResultsFile; }
  catch { return null; }
}

async function writeResults(file: RufloResultsFile): Promise<void> {
  await mkdir(RESULTS_ROOT, { recursive: true });
  await writeFile(resultsPath(file.swarmId), JSON.stringify(file, null, 2));
}

async function updateTask(swarmId: string, agentId: string, patch: Partial<RufloTaskResult>): Promise<void> {
  const file = await readResults(swarmId);
  if (!file) return;
  const t = file.tasks.find((x) => x.agentId === agentId);
  if (!t) return;
  Object.assign(t, patch);
  await writeResults(file);
}

// Kicks off real execution for the given roster, sequentially (keeps this
// Mac from running 8 concurrent Claude Code processes at once). Not awaited
// by the caller - runs in the background after the launch response returns.
export async function runSwarmTasks(
  swarmId: string,
  objective: string,
  roster: { agentId: string; type: string; name: string; task: string }[],
  execModel: ExecModel = "claude-haiku",
): Promise<void> {
  await writeResults({
    swarmId,
    objective,
    startedAt: Date.now(),
    tasks: roster.map((r) => ({ agentId: r.agentId, type: r.type, name: r.name, task: r.task, status: "running", startedAt: Date.now() })),
  });

  for (const r of roster) {
    const res = await execTask(execModel, r.task);
    if (res.ok && res.output) {
      await updateTask(swarmId, r.agentId, { status: "done", output: res.output, finishedAt: Date.now() });
    } else {
      await updateTask(swarmId, r.agentId, { status: "failed", error: res.error ?? "no output", finishedAt: Date.now() });
    }
  }
}
