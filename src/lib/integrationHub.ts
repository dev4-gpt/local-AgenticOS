import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { REVIEWED_ADDITIONS } from "@/lib/reviewedAdditions";
import { V96_CURATED_SKILL_PACK } from "@/lib/v96SkillPack";
import { governedIntegrations } from "@/lib/integrationGovernance";

const execFileAsync = promisify(execFile);
const HOME = os.homedir();
const STATE_DIR = path.join(HOME, ".agentic-os");
const CONFIG_FILE = path.join(STATE_DIR, "integrations.json");
const AGENT_REACH_CACHE_FILE = path.join(STATE_DIR, "agent-reach-status.json");
const AGENT_REACH_VALIDATED_FILE = path.join(STATE_DIR, "agent-reach-validated.json");
const AGENT_REACH_TWITTER_ENV_FILE = path.join(HOME, ".agent-reach", "twitter.env");
const AGENT_REACH_CACHE_MS = 15 * 60 * 1_000;
const AGENT_REACH_VALIDATION_MS = 24 * 60 * 60 * 1_000;

export type ExternalIntegrationId = "plausible" | "supabase" | "calcom" | "listmonk" | "ghost" | "stirling" | "penpot";
type Config = Record<string, Record<string, string>>;

interface FieldDef { key: string; label: string; secret?: boolean; placeholder: string }
interface ExternalDef {
  id: ExternalIntegrationId; name: string; description: string; fields: FieldDef[];
  required: string[]; env: Record<string, string>; prerequisite: string;
}

const EXTERNAL: ExternalDef[] = [
  { id: "plausible", name: "Plausible", description: "Privacy-first analytics for websites shipped from Web Studio.", fields: [
    { key: "baseUrl", label: "Plausible URL", placeholder: "https://plausible.io" }, { key: "domain", label: "Site domain", placeholder: "example.com" }, { key: "apiKey", label: "Stats API key", secret: true, placeholder: "Optional until dashboard stats are needed" },
  ], required: ["baseUrl", "domain"], env: { baseUrl: "PLAUSIBLE_BASE_URL", domain: "PLAUSIBLE_DOMAIN", apiKey: "PLAUSIBLE_API_KEY" }, prerequisite: "Create a Plausible site or provide a self-hosted URL and domain." },
  { id: "supabase", name: "Supabase", description: "Per-project Postgres, authentication, storage, and realtime backend.", fields: [
    { key: "baseUrl", label: "Project URL", placeholder: "https://project.supabase.co" }, { key: "anonKey", label: "Anon key", secret: true, placeholder: "Public anon/publishable key" },
  ], required: ["baseUrl", "anonKey"], env: { baseUrl: "SUPABASE_URL", anonKey: "SUPABASE_ANON_KEY" }, prerequisite: "Create a Supabase project and provide its URL and anon key." },
  { id: "calcom", name: "Cal.com", description: "Booking link and website scheduling handoff.", fields: [
    { key: "baseUrl", label: "Booking URL", placeholder: "https://cal.com/your-name" },
  ], required: ["baseUrl"], env: { baseUrl: "CALCOM_URL" }, prerequisite: "Create a Cal.com booking page or provide a self-hosted booking URL." },
  { id: "listmonk", name: "Listmonk", description: "Owned newsletter lists and campaign delivery from the VPS.", fields: [
    { key: "baseUrl", label: "Listmonk URL", placeholder: "https://mail.example.com" }, { key: "username", label: "API username", secret: true, placeholder: "Stored locally" }, { key: "password", label: "API password", secret: true, placeholder: "Stored locally" },
  ], required: ["baseUrl", "username", "password"], env: { baseUrl: "LISTMONK_URL", username: "LISTMONK_USERNAME", password: "LISTMONK_PASSWORD" }, prerequisite: "Deploy Listmonk with PostgreSQL and SMTP, then provide its URL and API credentials." },
  { id: "ghost", name: "Ghost", description: "Owned publishing, memberships, subscriptions, and newsletters.", fields: [
    { key: "baseUrl", label: "Ghost URL", placeholder: "https://blog.example.com" }, { key: "apiKey", label: "Admin API key", secret: true, placeholder: "Stored locally" },
  ], required: ["baseUrl", "apiKey"], env: { baseUrl: "GHOST_URL", apiKey: "GHOST_ADMIN_API_KEY" }, prerequisite: "Deploy or subscribe to Ghost and create an Admin API integration." },
  { id: "stirling", name: "Stirling PDF", description: "Local PDF conversion, editing, OCR, and document operations.", fields: [
    { key: "baseUrl", label: "Stirling PDF URL", placeholder: "http://127.0.0.1:8080" },
  ], required: ["baseUrl"], env: { baseUrl: "STIRLING_PDF_URL" }, prerequisite: "Start a Stirling PDF service and provide its local or VPS URL." },
  { id: "penpot", name: "Penpot", description: "Collaborative product design and client-facing design review.", fields: [
    { key: "baseUrl", label: "Penpot URL", placeholder: "https://design.example.com" },
  ], required: ["baseUrl"], env: { baseUrl: "PENPOT_URL" }, prerequisite: "Deploy Penpot or provide a Penpot workspace URL." },
];

async function readConfig(): Promise<Config> {
  try { return JSON.parse(await readFile(CONFIG_FILE, "utf8")) as Config; } catch { return {}; }
}

function valuesFor(def: ExternalDef, config: Config): Record<string, string> {
  const saved = config[def.id] ?? {};
  const out: Record<string, string> = {};
  for (const f of def.fields) out[f.key] = process.env[def.env[f.key]]?.trim() || saved[f.key]?.trim() || "";
  return out;
}

async function version(bin: string, args: string[]): Promise<string | null> {
  if (!existsSync(bin)) return null;
  try { const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 8_000 }); return (stdout || stderr).trim().split(/\r?\n/)[0]?.slice(0, 100) || "installed"; }
  catch { return null; }
}

async function versionAny(bin: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 8_000 });
    return (stdout || stderr).trim().split(/\r?\n/)[0]?.slice(0, 100) || "installed";
  } catch { return null; }
}

async function reachable(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(3_000) });
    return r.status < 500;
  } catch { return false; }
}

interface AgentReachChannel {
  status?: string;
  active_backend?: string | null;
}

interface AgentReachCache {
  checkedAt: number;
  channels: Record<string, AgentReachChannel>;
}

interface AgentReachValidation {
  checkedAt: number;
  channels: Record<string, { ok?: boolean; checkedAt?: number }>;
}

async function agentReachProbeEnv(): Promise<NodeJS.ProcessEnv> {
  const env = { ...process.env };
  const allowed = new Set(["TWITTER_AUTH_TOKEN", "TWITTER_CT0"]);
  const raw = await readFile(AGENT_REACH_TWITTER_ENV_FILE, "utf8").catch(() => "");
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (allowed.has(key) && value) env[key] = value;
  }
  return env;
}

function summarizeAgentReach(
  channels: Record<string, AgentReachChannel>,
  versionName: string,
  validation: AgentReachValidation | null,
) {
  const entries = Object.entries(channels);
  const sessionBackedOpenCli = new Set(["reddit", "instagram", "facebook", "xiaohongshu"]);
  const validationFresh = !!validation && Date.now() - validation.checkedAt < AGENT_REACH_VALIDATION_MS;
  const ready = entries.filter(([id, channel]) => {
    if (channel.status !== "ok") return false;
    if (channel.active_backend !== "OpenCLI" || !sessionBackedOpenCli.has(id)) return true;
    return validationFresh && validation?.channels[id]?.ok === true;
  });
  const names = ready.map(([id]) => id).slice(0, 7).join(", ");
  return {
    id: "agent-reach",
    name: "AgentReach Research",
    description: "Read-only research across approved web, code, video, RSS, and social sources",
    state: ready.length ? "working" : "waiting",
    detail: `${versionName || "installed"} · ${ready.length}/${entries.length} channels ready${names ? ` · ${names}` : ""}. Authenticated channels require operator setup.`,
  };
}

async function agentReachStatus() {
  const bin = path.join(HOME, ".local", "bin", "agent-reach");
  const base = {
    id: "agent-reach",
    name: "AgentReach Research",
    description: "Read-only research across approved web, code, video, RSS, and social sources",
  };
  if (!existsSync(bin)) {
    return { ...base, state: "missing", detail: "Install the reviewed AgentReach CLI in the user tool environment." };
  }

  try {
    const { stdout: versionOut } = await execFileAsync(bin, ["--version"], { timeout: 8_000 });
    const versionName = versionOut.trim().replace(/^Agent Reach\s*/i, "");
    const validation = await readFile(AGENT_REACH_VALIDATED_FILE, "utf8")
      .then((raw) => JSON.parse(raw) as AgentReachValidation)
      .catch(() => null);
    const cached = await readFile(AGENT_REACH_CACHE_FILE, "utf8")
      .then((raw) => JSON.parse(raw) as AgentReachCache)
      .catch(() => null);
    if (cached && Date.now() - cached.checkedAt < AGENT_REACH_CACHE_MS) {
      return summarizeAgentReach(cached.channels, versionName, validation);
    }

    const { stdout: doctorOut } = await execFileAsync(bin, ["doctor", "--json"], {
      timeout: 45_000,
      maxBuffer: 2 * 1024 * 1024,
      env: await agentReachProbeEnv(),
    });
    const channels = JSON.parse(doctorOut) as Record<string, AgentReachChannel>;
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(AGENT_REACH_CACHE_FILE, JSON.stringify({ checkedAt: Date.now(), channels }), { mode: 0o600 });
    return summarizeAgentReach(channels, versionName, validation);
  } catch {
    return { ...base, state: "waiting", detail: "Installed, but the channel diagnostic did not complete. Run `agent-reach doctor`." };
  }
}

export async function integrationOverview() {
  if (process.env.VELOCE_CLIENT_EDITION === "1") {
    return {
      local: [],
      external: [],
      reviewed: REVIEWED_ADDITIONS.map((item) => ({ ...item, detected: false })),
      skillPack: V96_CURATED_SKILL_PACK,
      governed: governedIntegrations(),
      configPath: "client-safe reviewed catalog",
    };
  }
  const config = await readConfig();
  const local = await Promise.all([
    agentReachStatus(),
    version(path.join(HOME, "local", "node", "bin", "hyperframes"), ["--version"]).then((v) => ({ id: "hyperframes", name: "HyperFrames", description: "HTML-to-video rendering", state: v ? "working" : "missing", detail: v || "Install the HyperFrames CLI." })),
    version(path.join(HOME, ".local", "bin", "crwl"), ["--help"]).then((v) => ({ id: "crawl4ai", name: "Crawl4AI", description: "LLM-friendly crawling and extraction", state: v ? "working" : "missing", detail: v ? "crawl4ai 0.9.1" : "Install Crawl4AI and its browser runtime." })),
    version(path.join(HOME, ".local", "bin", "browser-use"), ["--version"]).then((v) => ({ id: "browser-use", name: "Browser Use", description: "Interactive browser actions and QA", state: v ? "working" : "missing", detail: v || "Install Browser Use and its skill." })),
    Promise.resolve({ id: "claude-ads", name: "Claude Ads", description: "Paid-ad planning, audit, and creative skills", state: existsSync(path.join(HOME, ".codex", "skills", "ads", "SKILL.md")) && existsSync(path.join(HOME, ".claude-ads-env", "bin", "python")) ? "working" : "missing", detail: "23 skills + isolated Python runtime" }),
    version(path.join(HOME, ".local", "bin", "graphify"), ["--version"]).then((v) => ({ id: "graphify", name: "Graphify", description: "Knowledge graph for the Obsidian vault", state: v && existsSync(path.join(HOME, ".agentic-os", "graphify", "graphify-out", "graph.json")) ? "working" : v ? "waiting" : "missing", detail: v && existsSync(path.join(HOME, ".agentic-os", "graphify", "graphify-out", "graph.json")) ? "Obsidian export ready" : v ? "Installed; build the vault graph from Memory." : "Install graphifyy with uv." })),
    versionAny("sonar", ["--version"]).then((v) => ({ id: "sonarqube-cli", name: "SonarQube CLI", description: "Secrets and code-quality preflight", state: v ? "working" : "missing", detail: v || "Optional; configure SonarQube before scanning private code." })),
    versionAny("ao", ["--version"]).then((v) => ({ id: "agent-orchestrator", name: "Agent Orchestrator", description: "Parallel agents in isolated worktrees", state: v ? "working" : "missing", detail: v || "Optional operator lane; install AO separately if a worktree pilot is approved." })),
    versionAny("shepherd", ["--version"]).then((v) => ({ id: "shepherd", name: "Shepherd", description: "Reversible agent execution traces", state: v ? "working" : "missing", detail: v || "Research candidate; no direct runtime integration is enabled." })),
    versionAny("qm", ["--version"]).then((v) => ({ id: "qm", name: "QM", description: "Multiplayer agent harness", state: v ? "working" : "missing", detail: v || "Deferred; overlaps with the hosted runtime and Paperclip." })),
    versionAny("prime-agent", ["--version"]).then((v) => ({ id: "prime-agent", name: "Prime Agent", description: "Long-running RLM agent", state: v ? "working" : "missing", detail: v || "Optional operator lane; pilot only in a disposable worktree." })),
  ]);

  const external = await Promise.all(EXTERNAL.map(async (def) => {
    const values = valuesFor(def, config);
    const missing = def.required.filter((key) => !values[key]);
    const configured = missing.length === 0;
    const isReachable = configured && values.baseUrl ? await reachable(values.baseUrl) : false;
    return {
      id: def.id, name: def.name, description: def.description,
      state: !configured ? "waiting" : isReachable ? "working" : "unreachable",
      detail: !configured ? def.prerequisite : isReachable ? "Configured and reachable." : "Configured, but the service URL is not reachable.",
      fields: def.fields.map((field) => ({ key: field.key, label: field.label, secret: !!field.secret, placeholder: field.placeholder, set: !!values[field.key], value: field.secret ? "" : values[field.key] })),
      url: values.baseUrl || "",
    };
  }));
  const detected = new Set(local.map((item) => item.id));
  return {
    local,
    external,
    reviewed: REVIEWED_ADDITIONS.map((item) => ({ ...item, detected: item.detectedId ? detected.has(item.detectedId) && local.find((candidate) => candidate.id === item.detectedId)?.state === "working" : false })),
    skillPack: V96_CURATED_SKILL_PACK,
    governed: governedIntegrations(),
    configPath: CONFIG_FILE,
  };
}

export async function saveIntegration(id: string, incoming: Record<string, unknown>) {
  const def = EXTERNAL.find((item) => item.id === id);
  if (!def) return { ok: false, error: "Unknown integration." };
  const config = await readConfig();
  const current = config[id] ?? {};
  const next = { ...current };
  for (const field of def.fields) {
    const value = incoming[field.key];
    if (typeof value !== "string" || !value.trim()) continue;
    const clean = value.trim().slice(0, 2_000);
    if (field.key === "baseUrl") {
      try { const u = new URL(clean); if (!/^https?:$/.test(u.protocol)) throw new Error(); }
      catch { return { ok: false, error: `${field.label} must be an http(s) URL.` }; }
    }
    next[field.key] = clean;
  }
  config[id] = next;
  await mkdir(STATE_DIR, { recursive: true });
  const tmp = `${CONFIG_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
  await rename(tmp, CONFIG_FILE);
  return { ok: true };
}
