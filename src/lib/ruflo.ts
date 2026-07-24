// Ruflo swarm telemetry + control.
//
// Ruflo (ruvnet/ruflo) keeps clean JSON state under ~/.claude-flow/ — far more
// reliable than scraping the CLI's ASCII tables (`swarm status`/`agent list`
// ignore --json). We read:
//   agents/store.json        — the agent registry { agents: { id: {...} } }
//   swarm/swarm-state.json    — swarms { swarms: { id: {...} } }
//   metrics/swarm-activity.json — live activity flags
//
// Writes go through the `ruflo` CLI (swarm init / agent spawn / swarm start)
// so all of Ruflo's own coordination side-effects fire.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { run } from "@/lib/runner";
import { runSwarmTasks } from "@/lib/rufloExec";
import type { ExecModel } from "@/lib/rufloModels";

const CF_ROOT = process.env.AGENTIC_OS_CLAUDEFLOW ?? path.join(os.homedir(), ".claude-flow");
const AGENTS_STORE = path.join(CF_ROOT, "agents", "store.json");
const SWARM_STATE = path.join(CF_ROOT, "swarm", "swarm-state.json");
const ACTIVITY = path.join(CF_ROOT, "metrics", "swarm-activity.json");

export interface RufloAgent {
  id: string;
  type: string;       // researcher, coder, seo-specialist, …
  name?: string;
  status: string;     // idle, active, busy, completed, …
  health: number;     // 0-1
  taskCount: number;
  model?: string;     // haiku / sonnet / opus
  domain?: string;    // research, development, architecture, …
  createdAt?: string;
}

export interface RufloSwarm {
  id: string;
  topology: string;
  maxAgents: number;
  status: string;     // running, terminated
  strategy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RufloState {
  installed: boolean;
  swarm: RufloSwarm | null;     // the active (running) swarm, else most recent
  agents: RufloAgent[];
  activity: { active: boolean; agentCount: number; coordinationActive: boolean } | null;
}

async function readJson<T>(p: string): Promise<T | null> {
  if (!existsSync(p)) return null;
  try { return JSON.parse(await readFile(p, "utf8")) as T; }
  catch { return null; }
}

export async function readState(): Promise<RufloState> {
  const installed = existsSync(CF_ROOT);
  const agentsDoc = await readJson<{ agents: Record<string, Record<string, unknown>> }>(AGENTS_STORE);
  const swarmDoc = await readJson<{ swarms: Record<string, Record<string, unknown>> }>(SWARM_STATE);
  const actDoc = await readJson<Record<string, unknown>>(ACTIVITY);

  const agents: RufloAgent[] = [];
  if (agentsDoc?.agents) {
    for (const [id, a] of Object.entries(agentsDoc.agents)) {
      agents.push({
        id,
        type: String(a["agentType"] ?? "agent"),
        name: typeof a["name"] === "string" ? (a["name"] as string) : undefined,
        status: String(a["status"] ?? "idle"),
        health: typeof a["health"] === "number" ? (a["health"] as number) : 1,
        taskCount: typeof a["taskCount"] === "number" ? (a["taskCount"] as number) : 0,
        model: typeof a["model"] === "string" ? (a["model"] as string) : undefined,
        domain: typeof a["domain"] === "string" ? (a["domain"] as string) : undefined,
        createdAt: typeof a["createdAt"] === "string" ? (a["createdAt"] as string) : undefined,
      });
    }
  }
  // newest first
  agents.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  let swarm: RufloSwarm | null = null;
  if (swarmDoc?.swarms) {
    const all = Object.values(swarmDoc.swarms);
    const pick = all.find((s) => s["status"] === "running")
      ?? all.sort((a, b) => String(b["updatedAt"] ?? "").localeCompare(String(a["updatedAt"] ?? "")))[0];
    if (pick) {
      swarm = {
        id: String(pick["swarmId"] ?? "swarm"),
        topology: String(pick["topology"] ?? "hierarchical"),
        maxAgents: typeof pick["maxAgents"] === "number" ? (pick["maxAgents"] as number) : 0,
        status: String(pick["status"] ?? "unknown"),
        strategy: typeof (pick["config"] as Record<string, unknown>)?.["strategy"] === "string"
          ? ((pick["config"] as Record<string, unknown>)["strategy"] as string) : undefined,
        createdAt: typeof pick["createdAt"] === "string" ? (pick["createdAt"] as string) : undefined,
        updatedAt: typeof pick["updatedAt"] === "string" ? (pick["updatedAt"] as string) : undefined,
      };
    }
  }

  const activity = actDoc?.["swarm"] && typeof actDoc["swarm"] === "object" ? {
    active: Boolean((actDoc["swarm"] as Record<string, unknown>)["active"]),
    agentCount: Number((actDoc["swarm"] as Record<string, unknown>)["agent_count"] ?? 0),
    coordinationActive: Boolean((actDoc["swarm"] as Record<string, unknown>)["coordination_active"]),
  } : null;

  return { installed, swarm, agents, activity };
}

// The SEO mission roster — each entry becomes a spawned Ruflo agent (the name
// carries the SEO role; type maps to a valid Ruflo agent category). This is what
// makes the swarm graph fan out into a labelled SEO team on screen.
// NB: type must be one of ruflo's actual enum (verified via `ruflo agent spawn
// -t bogus`'s error): coder, researcher, tester, reviewer, architect,
// coordinator, analyst, optimizer, security-architect, security-auditor,
// memory-specialist, swarm-specialist, performance-engineer, core-architect,
// test-architect. "seo-specialist"/"frontend-dev" (the original values here)
// are NOT in that list — ruflo silently rejected those 6 spawns every time,
// so only half the roster ever registered or ran. Remapped to the nearest
// real fit below.
export const SEO_ROSTER: { type: string; name: string }[] = [
  { type: "researcher",    name: "keyword-research" },
  { type: "researcher",    name: "search-intent" },
  { type: "analyst",       name: "competitor-analysis" },
  { type: "tester",        name: "technical-audit" },
  { type: "architect",     name: "content-architecture" },
  { type: "researcher",    name: "serp-analysis" },
  { type: "optimizer",     name: "on-page-optimizer" },
  { type: "analyst",       name: "schema-strategist" },
  { type: "researcher",    name: "backlink-gap" },
  { type: "performance-engineer", name: "core-web-vitals" },
  { type: "analyst",       name: "internal-linking" },
  { type: "reviewer",      name: "seo-qa-reviewer" },
];

export interface LaunchResult { ok: boolean; swarmId?: string; spawned: number; objective: string; errors: string[]; executing: boolean; }

// Providers/models this app will actually pass through to ruflo. Note: ruflo's
// own internal task router has been observed to still write provider:
// "anthropic" at the top level of an agent record even when agent spawn is
// given an explicit -p/-m flag (the flag *is* captured in the record's
// nested config, just not honoured by whatever routes real execution) - so
// picking "ollama" here is best-effort, not a guarantee ruflo actually calls
// it. Passing the flags is still the correct thing to do; it's the most this
// app's integration surface (the ruflo CLI) currently exposes.
export type RufloProvider = "ollama" | "anthropic" | "openrouter";

// Launch an SEO swarm: init coordination, spawn the roster (each registers in
// store.json → appears as a node), and kick swarm start in the background.
export async function launchSeoSwarm(objective: string, provider: RufloProvider = "ollama", model?: string, execModel: ExecModel = "claude-haiku"): Promise<LaunchResult> {
  const errors: string[] = [];
  const obj = objective.trim().slice(0, 400) || "Build a complete SEO strategy";

  // 1. init swarm coordination
  const init = await run("ruflo", ["swarm", "init", "--topology", "hierarchical", "--max-agents", "14"], { timeoutMs: 30000 });
  if (!init.ok) errors.push(`init: ${init.stderr.slice(0, 200)}`);

  // 2. spawn the SEO roster (each is a quick registration) and capture the
  //    real agent ID ruflo assigns each one, so step 4 can attach real
  //    output to the right node.
  let spawned = 0;
  const roster: { agentId: string; type: string; name: string; task: string }[] = [];
  for (const r of SEO_ROSTER) {
    if (!/^[a-z0-9-]{1,40}$/.test(r.type) || !/^[a-z0-9-]{1,40}$/.test(r.name)) continue;
    const task = `${r.name.replace(/-/g, " ")} for: ${obj}`;
    const args = ["agent", "spawn", "-t", r.type, "-n", r.name, "-p", provider];
    if (model) args.push("-m", model);
    args.push("--task", task, "--timeout", "120");
    const s = await run("ruflo", args, { timeoutMs: 25000 });
    if (s.ok) {
      spawned++;
      const idMatch = s.stdout.match(/agent-\d{10,}-[a-z0-9]+/);
      if (idMatch) roster.push({ agentId: idMatch[0], type: r.type, name: r.name, task });
    }
  }

  // 3. tell ruflo's own coordination state the swarm is running (keeps its
  //    status/topology display meaningful) — cosmetic at this point, since
  //    it does not itself execute anything (see rufloExec.ts for why).
  void run("ruflo", ["swarm", "start", "-o", obj, "--parallel"], { timeoutMs: 60_000 }).catch(() => {});

  const state = await readState();
  const swarmId = state.swarm?.id;

  // 4. the part that actually does the work: run each agent's task for real
  //    through Claude Code's headless mode. Background — the HTTP response
  //    already returns before this finishes.
  if (swarmId && roster.length) {
    void runSwarmTasks(swarmId, obj, roster, execModel).catch(() => {});
  }

  return { ok: errors.length === 0, swarmId, spawned, objective: obj, errors, executing: roster.length > 0 };
}

// Colour + glyph mapping for agent roles (used by the graph).
export function roleColor(typeOrName: string): string {
  const s = typeOrName.toLowerCase();
  if (/review|qa|audit/.test(s)) return "#f472b6";       // pink — verification
  if (/research|keyword|intent|serp|backlink/.test(s)) return "#60a5fa"; // blue — research
  if (/seo|optim|schema|link/.test(s)) return "#d4a574";  // gold — seo
  if (/architect|content/.test(s)) return "#c4607e";      // plum — architecture
  if (/front|web-vital|coder|dev/.test(s)) return "#5ab896"; // emerald — build
  return "#a59783";
}
