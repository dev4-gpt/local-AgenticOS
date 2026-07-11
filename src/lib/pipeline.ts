// "From Inbox to Shipped" pipeline — turns a raw idea into a reviewed, buildable
// project. Everything lives as Markdown in the Obsidian vault under
// `Agentic OS/Pipeline/items/` so it's visible + editable in Obsidian, isolated
// from the real PARA notes. One human checkpoint (review); agents do the rest.

import { readFile, writeFile, readdir, mkdir, rm } from "node:fs/promises";
import { hermesHome } from "@/lib/config";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { AGENTIC_DIR, VAULT_AVAILABLE } from "@/lib/vaultWriter";
import { FCC_SCRATCH_ROOT, ensureProject } from "@/lib/freeClaudeWorkspace";
import { resolveModel, localChat } from "@/lib/localOllama";

export const BUILD_PROJECT = "free-claude-code"; // shared with the Agent Factory gallery

export const PIPELINE_DIR = AGENTIC_DIR ? path.join(AGENTIC_DIR, "Pipeline") : "";
export const ITEMS_DIR = PIPELINE_DIR ? path.join(PIPELINE_DIR, "items") : "";
export const PIPELINE_AVAILABLE = VAULT_AVAILABLE;

export type Stage = "inbox" | "shaping" | "review" | "building" | "shipped" | "rejected";
export type RouteKind = "project" | "action" | "idea" | "reference" | "escalate";

export const STAGES: { key: Stage; label: string; blurb: string }[] = [
  { key: "inbox",    label: "Capture",   blurb: "Raw input — no structure required" },
  { key: "shaping",  label: "Classify & Route", blurb: "Agents decide what it is" },
  { key: "review",   label: "Human Gate", blurb: "The one checkpoint — approve or reject" },
  { key: "building", label: "Execute",   blurb: "PM + subagents build it" },
  { key: "shipped",  label: "Shipped",   blurb: "Done" },
];

export interface PipelineItem {
  slug: string;
  title: string;
  stage: Stage;
  route?: RouteKind;
  confidence?: number;
  tags?: string[];
  created: string;
  updated?: string;
  idea: string;
  classification?: string;
  plan?: string;
  tasks?: string;
  buildFile?: string;     // the artifact the agents built (HTML in the Agent Factory project)
  pinned?: boolean;       // featured — sorts to the top of its column
  vaultPath?: string;     // relative path for the "in Obsidian" hint
}

// ── tiny frontmatter codec (yaml head + ## sections in the body) ───────────────
const SECTION_MAP: Record<string, keyof PipelineItem> = {
  "Idea": "idea", "Classification": "classification", "Proposed Plan": "plan", "Tasks": "tasks",
};

function parseItem(raw: string, slug: string): PipelineItem {
  let fm: Record<string, unknown> = {}; let body = raw;
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) { try { fm = (yaml.load(m[1]) as Record<string, unknown>) || {}; } catch {} body = m[2]; }
  const item: PipelineItem = {
    slug: (fm.slug as string) || slug,
    title: (fm.title as string) || slug,
    stage: (fm.stage as Stage) || "inbox",
    route: fm.route as RouteKind | undefined,
    confidence: typeof fm.confidence === "number" ? fm.confidence : undefined,
    tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : undefined,
    created: (fm.created as string) || new Date(0).toISOString(),
    updated: fm.updated as string | undefined,
    buildFile: fm.buildFile as string | undefined,
    pinned: fm.pinned === true,
    idea: "",
  };
  // split body into ## sections
  const parts = body.split(/\n##\s+/);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const head = (nl === -1 ? part : part.slice(0, nl)).trim().replace(/^##\s+/, "");
    const content = (nl === -1 ? "" : part.slice(nl + 1)).trim();
    const key = SECTION_MAP[head];
    if (key) (item as unknown as Record<string, unknown>)[key] = content;
  }
  return item;
}

function serializeItem(it: PipelineItem): string {
  const fm = yaml.dump({
    slug: it.slug, title: it.title, stage: it.stage,
    ...(it.route ? { route: it.route } : {}),
    ...(it.confidence != null ? { confidence: it.confidence } : {}),
    ...(it.tags ? { tags: it.tags } : {}),
    ...(it.buildFile ? { buildFile: it.buildFile } : {}),
    ...(it.pinned ? { pinned: true } : {}),
    created: it.created, updated: it.updated || new Date().toISOString(),
  }).trim();
  const sec = (h: string, v?: string) => (v && v.trim() ? `\n## ${h}\n\n${v.trim()}\n` : "");
  return `---\n${fm}\n---\n${sec("Idea", it.idea)}${sec("Classification", it.classification)}${sec("Proposed Plan", it.plan)}${sec("Tasks", it.tasks)}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export async function ensureDirs(): Promise<void> {
  if (!ITEMS_DIR) return;
  if (!existsSync(ITEMS_DIR)) await mkdir(ITEMS_DIR, { recursive: true });
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "idea";
}

export async function uniqueSlug(base: string): Promise<string> {
  await ensureDirs();
  let names: string[] = [];
  try { names = await readdir(ITEMS_DIR); } catch {}
  const taken = new Set(names.filter((n) => n.endsWith(".md")).map((n) => n.slice(0, -3)));
  let slug = slugify(base); let n = 2;
  while (taken.has(slug)) { slug = `${slugify(base)}-${n}`; n++; }
  return slug;
}

export async function listItems(): Promise<PipelineItem[]> {
  await ensureDirs();
  let names: string[] = [];
  try { names = await readdir(ITEMS_DIR); } catch { return []; }
  const out: PipelineItem[] = [];
  for (const n of names) {
    if (!n.endsWith(".md")) continue;
    try {
      const raw = await readFile(path.join(ITEMS_DIR, n), "utf8");
      const it = parseItem(raw, n.slice(0, -3));
      it.vaultPath = `Agentic OS/Pipeline/items/${n}`;
      out.push(it);
    } catch {}
  }
  out.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  return out;
}

export async function readItem(slug: string): Promise<PipelineItem | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const f = path.join(ITEMS_DIR, `${slug}.md`);
  if (!existsSync(f)) return null;
  try { const raw = await readFile(f, "utf8"); const it = parseItem(raw, slug); it.vaultPath = `Agentic OS/Pipeline/items/${slug}.md`; return it; } catch { return null; }
}

export async function writeItem(it: PipelineItem): Promise<void> {
  await ensureDirs();
  it.updated = new Date().toISOString();
  await writeFile(path.join(ITEMS_DIR, `${it.slug}.md`), serializeItem(it), "utf8");
}

// Permanently remove a pipeline item (deletes its Markdown file from the vault).
// The built artifact (if any) is left in the Agent Factory gallery — only the
// pipeline card/note is removed.
export async function deleteItem(slug: string): Promise<boolean> {
  if (!/^[a-z0-9-]+$/.test(slug)) return false;
  const f = path.join(ITEMS_DIR, `${slug}.md`);
  if (!existsSync(f)) return false;
  try { await rm(f); return true; } catch { return false; }
}

// Pipeline brains are cloud-first, local-fallback:
// 1. MiniMax-M3 via Hermes OAuth
// 2. GLM-5.2 via z.ai
// 3. The configured local Ollama model so the pipeline remains useful with no keys.

// MiniMax coding plan (Hermes OAuth) — flat-rate, NO per-token charge. The plan's
// API is Anthropic-compatible (api.minimax.io/anthropic/v1/messages). Model is
// overridable via ~/.fcc/.env (PM_MODEL=...) but defaults to MiniMax-M3.
function minimaxModel(): string {
  try {
    const env = readFileSync(path.join(os.homedir(), ".fcc", ".env"), "utf8");
    const line = env.split("\n").find((l) => l.startsWith("PM_MODEL="));
    if (line) { const v = line.slice("PM_MODEL=".length).replace(/^["']|["']$/g, "").trim(); if (v) return v; }
  } catch { /* */ }
  return "MiniMax-M3";
}
function minimaxAuth(): { token: string; base: string } | null {
  try {
    const prof = (readFileSync(path.join(hermesHome(), "active_profile"), "utf8").trim()) || "main";
    const a = JSON.parse(readFileSync(path.join(hermesHome(), "profiles", prof, "auth.json"), "utf8"));
    const mm = a?.providers?.["minimax-oauth"] ?? a?.providers?.minimax;
    if (mm?.access_token && mm?.inference_base_url) {
      if (mm.expires_at && new Date(mm.expires_at).getTime() < Date.now() + 15000) return null;
      return { token: mm.access_token, base: String(mm.inference_base_url).replace(/\/$/, "") };
    }
  } catch { /* */ }
  return null;
}
async function minimaxChat(system: string, user: string, maxTokens: number, signal?: AbortSignal): Promise<string> {
  const auth = minimaxAuth(); if (!auth) return "";
  try {
    const r = await fetch(`${auth.base}/v1/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${auth.token}`, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ model: minimaxModel(), max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    const c = j?.content;
    return Array.isArray(c) ? c.map((b: { text?: string }) => b?.text ?? "").join("").trim() : "";
  } catch { return ""; }
}

// The "project manager" brain — classify / plan / tasks. Cloud coding plans only:
//   1. MiniMax coding plan (MiniMax-M3) via Hermes's OAuth — flat-rate, best quality
//   2. GLM-5.2 (z.ai Coding Plan) — flat-rate fallback
// No local models. If both are unavailable, callers fall back to a template.
async function reason(system: string, user: string, maxTokens: number, signal?: AbortSignal): Promise<string> {
  const mm = await minimaxChat(system, user, maxTokens, signal);
  if (mm) return mm;
  const glm = await glmChat([{ role: "system", content: system }, { role: "user", content: user }], maxTokens, signal);
  if (glm) return glm;
  if (signal?.aborted) return "";
  try {
    const model = await resolveModel();
    return await localChat(model, system, user, {
      temperature: 0.25,
      numCtx: 8192,
      numPredict: Math.min(Math.max(maxTokens, 256), 900),
    });
  } catch { return ""; }
}

export async function classifyIdea(idea: string, signal?: AbortSignal): Promise<{ route: RouteKind; title: string; confidence: number; tags: string[] }> {
  const sys = `You are an inbox classifier for a personal knowledge + project system. Given a raw idea, decide what it is and output ONLY minified JSON (no prose, no code fences). Schema: {"route":"project|action|idea|reference|escalate","title":"max 8 word title","confidence":0.0-1.0,"tags":["lowercase","short"]}. Meanings — project: a multi-step thing to build/ship (app, website, content series, system); action: a single concrete task; idea: a thought to park for later; reference: information to retain; escalate: too unclear, a human should decide.`;
  const raw = await reason(sys, idea.slice(0, 1500), 200, signal);
  let parsed: { route?: string; title?: string; confidence?: number; tags?: string[] } = {};
  try { const j = raw.match(/\{[\s\S]*\}/); parsed = j ? JSON.parse(j[0]) : {}; } catch {}
  const route = (["project", "action", "idea", "reference", "escalate"].includes(parsed.route || "") ? parsed.route : "escalate") as RouteKind;
  return {
    route,
    title: (parsed.title || idea.split("\n")[0]).slice(0, 80),
    confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6).map((t) => String(t)) : [],
  };
}

export async function draftPlan(idea: string, title: string, tags: string[], signal?: AbortSignal): Promise<string> {
  const sys = `You are a senior project planner. Given an idea, write a tight PROPOSED PLAN in markdown with EXACTLY these sections:\n**What it is** — 1–2 sentences.\n**Approach** — 3–5 bullets.\n**First milestones** — 3–5 markdown checkboxes (- [ ] ...).\n**Who builds it** — the subagents/roles needed (e.g. researcher, designer, coder, copywriter, deployer).\nBe concrete and concise. Output markdown only — no preamble.`;
  const out = await reason(sys, `Idea: ${idea.slice(0, 1500)}\nWorking title: ${title}\nTags: ${tags.join(", ")}`, 700, signal);
  if (out) return out;
  // fallback template if the local model returned nothing
  return `**What it is** — ${title}.\n\n**Approach**\n- Clarify the goal and success criteria\n- Research what already exists\n- Build the smallest shippable version first\n- Review, then expand\n\n**First milestones**\n- [ ] Define scope\n- [ ] Produce a first draft / prototype\n- [ ] Review and ship v1\n\n**Who builds it** — researcher, builder, reviewer (coordinated by a project manager).\n\n_(Auto-drafted fallback — the local model was busy. Re-run "Shape it" for a richer plan.)_`;
}

function fallbackTasks(title: string, plan: string): string {
  const milestones = (plan.match(/- \[ \].+/g) || []).slice(0, 6);
  const roleLine = plan.match(/who builds it[^\n]*[:—-]\s*(.+)/i)?.[1] || "researcher, builder, reviewer";
  const roles = roleLine.split(/[,/]| and /).map((r) => r.replace(/[^a-zA-Z ]/g, "").trim().toLowerCase()).filter(Boolean).slice(0, 4);
  const r = (i: number) => roles[i % (roles.length || 1)] || "builder";
  const base = milestones.length
    ? milestones.map((m, i) => `- [ ] [${r(i)}] ${m.replace(/- \[ \]\s*/, "")}`)
    : [
        `- [ ] [${r(0)}] research references + define scope for ${title}`,
        `- [ ] [${r(1)}] draft the first version`,
        `- [ ] [${r(2)}] review against the goal`,
        `- [ ] [${r(0)}] revise and finalize`,
        `- [ ] [${r(1)}] ship v1`,
      ];
  return `${base.join("\n")}\n\n_Project manager: coordinates the above._`;
}

export async function breakIntoTasks(title: string, plan: string, signal?: AbortSignal): Promise<string> {
  const out = await reason(
    `You are a project manager. Break the project plan into an execution checklist of 6–10 tasks. Format each as a markdown checkbox tagged with the responsible subagent, e.g. "- [ ] [researcher] gather competitor examples". End with "Project manager: coordinates the above."`,
    `Project: ${title}\n\nPlan:\n${plan.slice(0, 2000)}\n\nOutput the checklist now:`, 600, signal,
  );
  return out || fallbackTasks(title, plan);
}

// ── Execute: subagents actually BUILD a visual artifact (single-page HTML) ─────
function extractHtml(text: string): string {
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  let h = fence ? fence[1] : text;
  const start = h.search(/<!DOCTYPE html|<html/i);
  if (start > 0) h = h.slice(start);
  const end = h.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) h = h.slice(0, end + 7);
  return h.trim();
}
async function uniqueFile(dir: string, slug: string): Promise<string> {
  let names: string[] = [];
  try { names = await readdir(dir); } catch {}
  let name = `${slug}.html`; let n = 2;
  while (names.includes(name)) { name = `${slug}-${n}.html`; n++; }
  return name;
}

// ── Build backends — cloud coding plans first, local Ollama fallback. ──
type Msg = { role: "system" | "user" | "assistant"; content: string };

// MiniMax-M3 (your coding plan, Anthropic-compatible) — strongest + most reliable
// build model (flat-rate, no per-token charge). Anthropic format: system separate.
async function mmBuildChat(messages: Msg[], maxTokens: number, signal?: AbortSignal): Promise<string> {
  const auth = minimaxAuth(); if (!auth) return "";
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const msgs = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
  try {
    const r = await fetch(`${auth.base}/v1/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${auth.token}`, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ model: minimaxModel(), max_tokens: maxTokens, system, messages: msgs }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    const c = j?.content;
    return Array.isArray(c) ? c.map((b: { text?: string }) => b?.text ?? "").join("") : "";
  } catch { return ""; }
}

// GLM-5.2 (z.ai Coding Plan) — flat-rate fallback when MiniMax is unavailable. OpenAI-
// compatible coding endpoint; thinking disabled so short classify/JSON calls aren't eaten
// by the reasoning budget. Key read from the Hermes glm-5-2 profile .env (or ~/.fcc/.env).
function glmKey(): string | null {
  const files = [path.join(hermesHome(), "profiles", "glm-5-2", ".env"), path.join(os.homedir(), ".fcc", ".env")];
  for (const f of files) {
    try {
      const env = readFileSync(f, "utf8");
      for (const name of ["GLM_API_KEY", "ZAI_API_KEY", "Z_AI_API_KEY"]) {
        const line = env.split("\n").find((l) => l.startsWith(name + "="));
        if (line) { const v = line.slice(name.length + 1).replace(/^["']|["']$/g, "").trim(); if (v) return v; }
      }
    } catch { /* */ }
  }
  return null;
}
const GLM_BASE = process.env.GLM_BASE_URL || "https://api.z.ai/api/coding/paas/v4";
async function glmChat(messages: Msg[], maxTokens: number, signal?: AbortSignal): Promise<string> {
  const key = glmKey(); if (!key) return "";
  try {
    const r = await fetch(`${GLM_BASE}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ model: "glm-5.2", messages, max_tokens: Math.max(maxTokens, 800), temperature: 0.5, thinking: { type: "disabled" } }),
    });
    if (!r.ok) return "";
    const j = await r.json();
    return String(j?.choices?.[0]?.message?.content ?? "").trim();
  } catch { return ""; }
}

// Generate a COMPLETE html doc — continue until </html> appears (no more truncation).
// Robust: up to 6 passes, and a single empty continuation is retried before giving up
// (some models occasionally return an empty continuation that would otherwise truncate).
async function generateComplete(call: (m: Msg[], t: number, s?: AbortSignal) => Promise<string>, sys: string, user: string, maxTokens: number, signal?: AbortSignal): Promise<string> {
  const base: Msg[] = [{ role: "system", content: sys }, { role: "user", content: user }];
  let full = "";
  for (let pass = 0; pass < 6; pass++) {
    if (signal?.aborted) break;
    // Continue from the tail (not the whole doc) to keep the continuation prompt small + focused.
    const tail = full.slice(-4000);
    const msgs = pass === 0 ? base : [...base, { role: "assistant" as const, content: tail }, { role: "user" as const, content: "You stopped mid-file. Continue the HTML from EXACTLY where the snippet above ends — output ONLY the remaining code, no repetition, no commentary, and finish the entire file ending with </html>." }];
    let out = await call(msgs, maxTokens, signal);
    if (!out && pass > 0 && !signal?.aborted) out = await call(msgs, maxTokens, signal); // retry one empty continuation
    if (!out) break;
    full += out;
    if (/<\/html>/i.test(full)) break;
  }
  return full;
}

const BUILD_BRIEF =
  "You are an elite product engineer. Build ONE complete, self-contained, FULLY FUNCTIONAL single-page web app — NOT a static mockup, NOT a design comp. It must actually WORK when opened.\n\n" +
  "FUNCTION FIRST — this is the most important part:\n" +
  "- EVERY button, input, toggle, tab, slider and control MUST do something real. Zero dead controls. If you add a 'New X' button, wire it to actually add X.\n" +
  "- Implement real state in vanilla JS (a state object/array) and RE-RENDER the UI whenever state changes. Persist state with localStorage so it survives a reload.\n" +
  "- MANDATORY SEED DATA: bake rich, realistic sample data into the JS as the default state — e.g. 6–8 example items with varied values and several weeks of history — so EVERY stat number, chart, list and section is FULL and impressive the instant the app opens. It must NEVER show an empty 0/0 or 'no data' state on first load. The user can then add / edit / delete / complete / toggle on top of it and watch everything update live and persist (localStorage).\n" +
  "- Charts & graphs: build them as INLINE SVG (with a viewBox so they scale automatically) from the app's real data — bars as <rect>, lines/areas as <path>, donuts as <circle> with stroke-dasharray. DO NOT use <canvas> for charts (canvas silently renders blank if you forget to size it). Every chart MUST be visibly populated with data — never an empty box.\n" +
  "- NEVER use <video>, <iframe>, external embeds, GIFs or images as a stand-in for functionality. If it's a timer, build a real countdown with start/pause/reset. If a tracker, real tracking. If a game, real playable mechanics with scoring + restart. Build the ACTUAL thing.\n" +
  "- WIRING CORRECTNESS: every id you reference with getElementById/querySelector MUST exist in your HTML with that exact id. After building the HTML, call ALL your render functions once inside a DOMContentLoaded handler so the UI and every chart are fully populated on load.\n\n" +
  "TECH:\n" +
  "- Vanilla HTML/CSS/JS only, all inline. Google Fonts via <link> is fine. NO JS libraries, NO frameworks, NO CDNs, no build step. Run all JS after DOMContentLoaded.\n\n" +
  "DESIGN (once it works):\n" +
  "- World-class, premium, dark, responsive — cohesive colors, modern type, depth (shadows/gradients/glow), smooth micro-interactions and transitions. Stripe / Linear / Awwwards quality.\n\n" +
  "COMPLETENESS IS MANDATORY: keep the CSS efficient (reuse variables, no bloat) so the WHOLE app — HTML, CSS, and the full <script> with all the logic — fits and FINISHES. A complete working app beats an over-styled half-finished one. The <script> with all functionality must be present and the file must end with </html>.\n\n" +
  "Before finishing, mentally CLICK every control and confirm it produces a visible result, and confirm every chart actually renders with data. Output ONLY the HTML, from <!DOCTYPE html> to </html>. No markdown fences, no commentary.";

// Static audit — catches the bugs one-shot generation leaves: truncation, no JS,
// video stand-ins, dead controls (ids referenced in JS that don't exist in the HTML),
// and unsized canvases (blank charts). Returns a list of concrete problems to fix.
function auditBuild(html: string): string[] {
  const issues: string[] = [];
  if (!/<\/html>/i.test(html)) issues.push("The file is truncated — it does not end with </html>. Output the COMPLETE file.");
  if (!/<script[\s>]/i.test(html)) issues.push("There is NO <script> — the app has no working JavaScript. Add the full interactive script.");
  if (/<video[\s>]|<iframe[\s>]/i.test(html)) issues.push("Remove every <video>/<iframe> — build the real working feature instead of embedding media as a stand-in.");
  const defined = new Set([...html.matchAll(/id=["']([A-Za-z0-9_-]+)["']/g)].map((m) => m[1]));
  const referenced = [...html.matchAll(/getElementById\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g)].map((m) => m[1]);
  const dangling = [...new Set(referenced.filter((id) => !defined.has(id)))];
  if (dangling.length) issues.push(`These ids are used in JS via getElementById but have NO matching element in the HTML, so those controls are dead: ${dangling.slice(0, 12).join(", ")}. Add the matching elements (with those exact ids) and wire them.`);
  if (/<canvas/i.test(html) && !/\.width\s*=|clientWidth|offsetWidth/.test(html)) issues.push("A <canvas> is used but never sized in JS (e.g. canvas.width = el.clientWidth) so it renders BLANK. Rebuild those charts as inline SVG (scales automatically), or size every canvas before drawing.");
  return issues;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch] ?? ch));
}

function deterministicLocalArtifact(item: PipelineItem): string {
  const title = escapeHtml(item.title || "Pipeline Build");
  const idea = escapeHtml(item.idea || "A locally generated AgentOS pipeline artifact.");
  const taskLines = (item.tasks?.match(/- \[[ x]\].+/g) || [])
    .map((line) => line.replace(/- \[[ x]\]\s*/, "").replace(/\[[^\]]+\]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const seed = (taskLines.length ? taskLines : [
    "Review the captured idea",
    "Confirm the smallest useful version",
    "Build the first local artifact",
    "Verify it opens in the AgentOS preview",
    "Decide the next improvement",
  ]).map((text, index) => ({ id: index + 1, text, done: index < 2 }));
  const seedJson = JSON.stringify(seed);
  const storageKey = `agentos-pipeline-${item.slug}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; --bg:#090b10; --panel:#111722; --line:#243244; --text:#f5f7fb; --muted:#9aa8b8; --accent:#57d68d; --amber:#f2c36b; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; background:radial-gradient(circle at 20% 10%, #19382b 0, transparent 30%), radial-gradient(circle at 80% 20%, #2a1e48 0, transparent 28%), var(--bg); color:var(--text); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width:min(940px, calc(100vw - 32px)); padding:28px; border:1px solid rgba(255,255,255,.1); border-radius:22px; background:linear-gradient(145deg, rgba(17,23,34,.94), rgba(10,13,19,.9)); box-shadow:0 28px 80px rgba(0,0,0,.46); }
    .eyebrow { color:var(--accent); text-transform:uppercase; letter-spacing:.12em; font-size:12px; font-weight:800; }
    h1 { margin:10px 0 8px; font-size:clamp(30px, 5vw, 58px); line-height:1; letter-spacing:0; }
    p { color:var(--muted); line-height:1.6; max-width:780px; }
    .grid { display:grid; grid-template-columns:1fr 280px; gap:18px; margin-top:24px; }
    section { border:1px solid var(--line); background:rgba(255,255,255,.035); border-radius:16px; padding:18px; }
    .bar { height:12px; border-radius:999px; background:#17202c; overflow:hidden; margin:14px 0 8px; }
    .fill { height:100%; width:0%; background:linear-gradient(90deg, var(--accent), var(--amber)); transition:width .25s ease; }
    ul { list-style:none; padding:0; margin:14px 0 0; display:grid; gap:10px; }
    li { display:flex; align-items:center; gap:10px; padding:12px; border-radius:12px; background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.07); }
    input[type="checkbox"] { width:18px; height:18px; accent-color:var(--accent); }
    .row { display:flex; gap:10px; margin-top:14px; }
    input[type="text"] { flex:1; min-width:0; border:1px solid var(--line); background:#0c1119; color:var(--text); border-radius:12px; padding:12px 14px; font:inherit; }
    button { border:0; border-radius:12px; padding:12px 14px; color:#06100b; background:var(--accent); font-weight:800; cursor:pointer; }
    button.secondary { color:var(--text); background:#1b2635; border:1px solid var(--line); }
    .metric { font-size:42px; font-weight:900; letter-spacing:0; }
    .small { color:var(--muted); font-size:13px; }
    @media (max-width:760px) { main { padding:20px; } .grid { grid-template-columns:1fr; } .row { flex-direction:column; } }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">AgentOS Pipeline Artifact</div>
    <h1>${title}</h1>
    <p>${idea}</p>
    <div class="grid">
      <section>
        <strong>Launch Checklist</strong>
        <div class="bar"><div id="fill" class="fill"></div></div>
        <div id="summary" class="small"></div>
        <ul id="tasks"></ul>
        <div class="row">
          <input id="taskInput" type="text" placeholder="Add the next concrete step" />
          <button id="addBtn">Add</button>
        </div>
      </section>
      <section>
        <div class="small">Completion</div>
        <div id="metric" class="metric">0%</div>
        <p class="small">This artifact was generated locally as the no-key Pipeline fallback. It persists changes in this browser.</p>
        <button id="resetBtn" class="secondary">Reset Seed Data</button>
      </section>
    </div>
  </main>
  <script>
    const seed = ${seedJson};
    const key = ${JSON.stringify(storageKey)};
    let tasks = JSON.parse(localStorage.getItem(key) || "null") || seed;
    const el = (id) => document.getElementById(id);
    function save(){ localStorage.setItem(key, JSON.stringify(tasks)); }
    function render(){
      const done = tasks.filter(t => t.done).length;
      const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
      el("fill").style.width = pct + "%";
      el("metric").textContent = pct + "%";
      el("summary").textContent = done + " of " + tasks.length + " steps complete";
      el("tasks").innerHTML = tasks.map(t => '<li><input type="checkbox" data-id="' + t.id + '"' + (t.done ? ' checked' : '') + '><span>' + t.text.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) + '</span></li>').join("");
      document.querySelectorAll("input[type=checkbox][data-id]").forEach(box => {
        box.addEventListener("change", () => { const item = tasks.find(t => String(t.id) === box.dataset.id); if (item) { item.done = box.checked; save(); render(); } });
      });
    }
    el("addBtn").addEventListener("click", () => {
      const input = el("taskInput");
      const text = input.value.trim();
      if (!text) return;
      tasks.push({ id: Date.now(), text, done:false });
      input.value = "";
      save(); render();
    });
    el("taskInput").addEventListener("keydown", (event) => { if (event.key === "Enter") el("addBtn").click(); });
    el("resetBtn").addEventListener("click", () => { tasks = seed.map(t => ({...t})); save(); render(); });
    render();
  </script>
</body>
</html>`;
}

// Runtime verifier — loads the built file headless and reports real problems
// (dead clicks, empty/zero state, video stand-ins, fatal JS errors). Gracefully
// returns ok if Chrome/python aren't available (so it never blocks a build).
function runtimeVerify(filePath: string, signal?: AbortSignal): Promise<{ ok: boolean; problems: string[] }> {
  return new Promise((resolve) => {
    try {
      const script = path.join(process.cwd(), "scripts", "verify_build.py");
      if (!existsSync(script)) return resolve({ ok: true, problems: [] });
      const py = spawn("python3", [script, filePath], { signal });
      let out = "";
      const done = (r: { ok: boolean; problems: string[] }) => { clearTimeout(to); resolve(r); };
      const to = setTimeout(() => { try { py.kill(); } catch { /* */ } done({ ok: true, problems: [] }); }, 40000);
      py.stdout.on("data", (d) => { out += d.toString(); });
      py.on("error", () => done({ ok: true, problems: [] }));
      py.on("close", () => {
        try { const j = JSON.parse((out.trim().split("\n").pop()) || "{}"); done({ ok: j.ok !== false, problems: Array.isArray(j.problems) ? j.problems : [] }); }
        catch { done({ ok: true, problems: [] }); }
      });
    } catch { resolve({ ok: true, problems: [] }); }
  });
}

// Build the project's deliverable — a genuinely impressive, complete single-page build.
export async function buildArtifact(item: PipelineItem, signal?: AbortSignal): Promise<string | null> {
  const dir = (await ensureProject(BUILD_PROJECT)) ?? path.join(FCC_SCRATCH_ROOT, BUILD_PROJECT);
  const user = `Build this deliverable and make it look incredible.\n\nProject: ${item.title}\nThe idea: ${item.idea.slice(0, 900)}\n\nFollow this plan as the spec:\n${(item.plan || "").slice(0, 1600)}`;

  // 1. MiniMax-M3 (your coding plan) — richest + most reliable. Continuation makes it finish.
  let raw = await generateComplete(mmBuildChat, BUILD_BRIEF, user, 16000, signal);
  // 2. GLM-5.2 (z.ai Coding Plan) fallback if MiniMax is unavailable / didn't finish
  if (!signal?.aborted && (!raw || !/<\/html>/i.test(raw))) {
    const glm = await generateComplete(glmChat, BUILD_BRIEF, user, 16000, signal);
    if (extractHtml(glm).length > extractHtml(raw).length) raw = glm;
  }
  // 3. Local deterministic fallback — keeps Pipeline usable with no provider keys
  // and no long-running local model dependency.
  if (!signal?.aborted && (!raw || !/<\/html>/i.test(raw))) {
    raw = deterministicLocalArtifact(item);
  }

  let html = extractHtml(raw);
  if (!html || html.length < 200) return null;

  // ── Verify-and-fix: load-test the structure, send concrete bugs back to MiniMax to patch ──
  for (let round = 0; round < 2; round++) {
    if (signal?.aborted) break;
    const issues = auditBuild(html);
    if (!issues.length) break;
    const fixUser = `Below is an HTML app you built. It has these specific problems:\n${issues.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nReturn the COMPLETE corrected HTML file with ALL of them fixed — keep everything that already works, make sure every control is wired and every chart/section is populated with the seed data. Start with <!DOCTYPE html>, end with </html>, output ONLY the HTML.\n\n=== CURRENT FILE ===\n${html.slice(0, 60000)}`;
    const fixed = extractHtml(await generateComplete(mmBuildChat, BUILD_BRIEF, fixUser, 16000, signal));
    if (fixed.length > 400 && /<\/html>/i.test(fixed) && auditBuild(fixed).length < issues.length) html = fixed; else break;
  }

  if (!/<\/html>/i.test(html)) html += "\n</body>\n</html>"; // safety close
  const file = await uniqueFile(dir, slugify(item.title));
  const filePath = path.join(dir, file);
  await writeFile(filePath, html, "utf8");

  // ── Runtime verify-and-fix: actually LOAD it, detect dead/empty/video, patch ──
  // SAFE: only accept a fix that is COMPLETE and that strictly reduces the problem
  // count — never let a truncated or worse regeneration replace a better build.
  let curVerdict = await runtimeVerify(filePath, signal);
  for (let round = 0; round < 2 && !curVerdict.ok && !signal?.aborted; round++) {
    const fixUser = `Below is an HTML app you built. Loaded in a real browser, it has these RUNTIME problems:\n${curVerdict.problems.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nReturn the COMPLETE corrected HTML file fixing ALL of them. Keep the visual design. Make EVERY control work (real handlers that update state + re-render). For empty/zero-state: define a SEED constant with realistic data (e.g. 6 items each with several weeks of history) and initialise state DIRECTLY from it — do NOT start from empty localStorage on first load — then render so every stat/list/chart is full immediately. Remove any <video>/<iframe> in favour of the real feature. Start with <!DOCTYPE html>, end with </html>, output ONLY the HTML.\n\n=== CURRENT FILE ===\n${html.slice(0, 70000)}`;
    const fixed = extractHtml(await generateComplete(mmBuildChat, BUILD_BRIEF, fixUser, 16000, signal));
    if (fixed.length < 400 || !/<\/html>/i.test(fixed)) break; // incomplete/truncated fix — keep the better current build
    await writeFile(filePath, fixed, "utf8");
    const newVerdict = await runtimeVerify(filePath, signal);
    if (newVerdict.problems.length < curVerdict.problems.length) { html = fixed; curVerdict = newVerdict; } // genuine improvement — keep
    else { await writeFile(filePath, html, "utf8"); break; } // no better — revert to the previous good build and stop
  }
  return file;
}
