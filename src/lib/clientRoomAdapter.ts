// Typed hosted Agent Room contract.
//
// The local room runs seven personas, each on its own model, streaming NDJSON
// turn by turn and reading an Obsidian vault for context. Cloud Run has no
// vault and every provider call is queued, so the hosted room keeps the same
// observable behaviour — a roster you toggle, agents replying in order, system
// notices for context and side effects — over tenant rows and the approved
// provider lane. Everything here is pure so it can be tested without a
// database, a provider key, or a browser.

export const ROOM_MESSAGE_ROLES = ["user", "agent", "system"] as const;
export const ROOM_MESSAGE_KINDS = ["message", "context", "action", "error"] as const;
export const ROOM_ROUND_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export type RoomMessageRole = (typeof ROOM_MESSAGE_ROLES)[number];
export type RoomMessageKind = (typeof ROOM_MESSAGE_KINDS)[number];
export type RoomRoundStatus = (typeof ROOM_ROUND_STATUSES)[number];

export type RoomPersona = {
  id: string;
  name: string;
  color: string;
  /** Preferred provider. Falls back to the tenant's workspace provider. */
  provider: string;
  /**
   * Preferred model. One OpenRouter key reaches many models, so this is how
   * personas stay distinct instead of all collapsing onto the first entry in
   * the provider's allowlist. Ignored unless the tenant allowlists it.
   */
  preferredModel?: string;
  persona: string;
};

export type RoomRosterEntry = RoomPersona & {
  available: boolean;
  /** Resolved only when available; never a model outside the tenant allowlist. */
  model: string | null;
  resolvedProvider: string | null;
  /** Why this persona cannot speak, in the runtime's own error vocabulary. */
  blockedReason: string | null;
};

export type RoomConversation = {
  id: string;
  title: string;
  status: "active" | "archived";
  presentAgents: string[];
  createdAt: string;
  updatedAt: string;
  retentionExpiresAt: string | null;
};

export type RoomMessage = {
  id: string;
  conversationId: string;
  role: RoomMessageRole;
  kind: RoomMessageKind;
  agentId: string | null;
  agentName: string | null;
  agentColor: string | null;
  content: string;
  provider: string | null;
  model: string | null;
  costMicros: number;
  errorCode: string | null;
  linkedRecordId: string | null;
  seq: number;
  createdAt: string;
};

export type RoomRound = {
  id: string;
  conversationId: string;
  jobId: string | null;
  status: RoomRoundStatus;
  agentIds: string[];
  speakingAgentId: string | null;
  completedAgents: number;
  costMicros: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * The hosted personas. These mirror the local room's cast and voices. Each
 * names a preferred provider, but a persona only becomes available when that
 * provider and a model survive the tenant allowlist — the roster reflects what
 * this tenant may actually call, not a fixed list of seven.
 */
export const ROOM_PERSONAS: RoomPersona[] = [
  {
    id: "claude", name: "Claude", color: "#d97757", provider: "anthropic",
    persona: "You are Claude — thoughtful, careful, balanced. You weigh trade-offs, bring nuance, and give a calm, precise take. You gently flag risks others miss.",
  },
  {
    id: "hermes", name: "Hermes", color: "#60a5fa", provider: "openrouter",
    preferredModel: "nousresearch/hermes-4-70b",
    persona: "You are Hermes — direct, action-oriented, a little unfiltered. You cut straight to the practical next step and call out fluff. You like momentum.",
  },
  {
    id: "gemini", name: "Gemini", color: "#4285F4", provider: "gemini",
    persona: "You are Gemini — broad knowledge, curious and upbeat. You bring data, facts, and a research angle to the table.",
  },
  {
    id: "codex", name: "Codex", color: "#22c55e", provider: "openrouter",
    preferredModel: "openai/gpt-4o-mini",
    persona: "You are Codex — pragmatic, implementation-first. You think in systems and concrete steps, and you sketch the how.",
  },
  {
    id: "openclaw", name: "OpenClaw", color: "#f472b6", provider: "openrouter",
    preferredModel: "meta-llama/llama-3.3-70b-instruct",
    persona: "You are OpenClaw — open-source, bold, a little cheeky. You challenge assumptions and champion the scrappy, independent path.",
  },
  {
    id: "glm", name: "GLM", color: "#34E5B0", provider: "openrouter",
    preferredModel: "z-ai/glm-5.2",
    persona: "You are GLM — the efficient builder. You ship the grinding work others would charge a fortune for, and you quietly champion the cheaper, open-weights path. You'd rather show a working build than argue.",
  },
];

const ROOM_SYSTEM = [
  "You are in a fast, live group chat with the user and a few other AI agents.",
  "Keep every message SHORT and conversational — 1 to 3 sentences, like a real chat.",
  "Stay fully in your own character. You can agree, disagree, build on, or tease the other agents by name.",
  "Don't repeat what someone already said. Be genuinely useful and real. No preamble, no name prefix — just your message.",
  "You can propose workspace changes ONLY when the user clearly asks. Proposals require separate human review; never claim they are saved or approved:",
  "• To PROPOSE your point as a workspace memory note, add a final line exactly: NOTE:: <a short title>",
  "• To PROPOSE an idea for the delivery pipeline, add a final line exactly: PIPELINE:: <one-line idea>",
  "Use these sparingly. Write your normal chat message first, then the directive on its own final line. Never mention this directive syntax in your visible message.",
].join(" ");

export type RoomAllowCheck = (provider: string, model: string | null) => { ok: true; provider: string; model: string } | { ok: false; error: string };

/**
 * Resolves the roster against the tenant's approved providers and models.
 *
 * Each persona asks for its preferred model first and falls back to whatever
 * the provider allows, so widening the tenant's model allowlist is enough to
 * give the room genuinely different voices — no new credential required. A
 * persona whose provider is not allowlisted at all stays visible but disabled
 * with the genuine reason, rather than being hidden or shown as a dead control.
 */
export function resolveRoomRoster(personas: RoomPersona[], check: RoomAllowCheck, fallbackProvider?: string): RoomRosterEntry[] {
  return personas.map((persona) => {
    const preferred = persona.preferredModel ? check(persona.provider, persona.preferredModel) : null;
    const primary = preferred?.ok ? preferred : check(persona.provider, null);
    if (primary.ok) {
      return { ...persona, available: true, model: primary.model, resolvedProvider: primary.provider, blockedReason: null };
    }
    if (fallbackProvider && fallbackProvider !== persona.provider) {
      const fallbackPreferred = persona.preferredModel ? check(fallbackProvider, persona.preferredModel) : null;
      const fallback = fallbackPreferred?.ok ? fallbackPreferred : check(fallbackProvider, null);
      if (fallback.ok) {
        return { ...persona, available: true, model: fallback.model, resolvedProvider: fallback.provider, blockedReason: null };
      }
    }
    return { ...persona, available: false, model: null, resolvedProvider: null, blockedReason: primary.error };
  });
}

export function roomPersona(id: string) {
  return ROOM_PERSONAS.find((persona) => persona.id === id) ?? null;
}

/**
 * `@claude @gemini` narrows a round to those agents. Mentions that are not in
 * the room are ignored, and a round with no valid mention falls back to
 * everyone present — matching the local room.
 */
export function roomMentionedIds(message: string, presentIds: string[]) {
  const mentioned = (message.toLowerCase().match(/@([a-z0-9_-]+)/g) ?? []).map((token) => token.slice(1));
  return presentIds.filter((id) => mentioned.includes(id.toLowerCase()));
}

export function roomRoundAgents(message: string, presentIds: string[]) {
  const mentioned = roomMentionedIds(message, presentIds);
  return mentioned.length ? mentioned : presentIds;
}

export type RoomTurn = { speaker: string; text: string };

export function roomJobRetentionDeadline(input: Record<string, unknown>, now = Date.now()): number | null {
  const timestamp = (value: unknown) => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  const origin = timestamp(input.roomCreatedAt);
  const expiry = timestamp(input.roomRetentionExpiresAt);
  return Number.isFinite(origin) && Number.isFinite(expiry) && origin <= now
    && expiry > origin && expiry <= origin + 28 * 86_400_000 ? expiry : null;
}

export function roomTranscript(messages: RoomMessage[], userLabel = "You"): RoomTurn[] {
  return messages
    .filter((message) => message.kind === "message" && (message.role === "user" || message.role === "agent"))
    .sort((left, right) => left.seq - right.seq)
    .map((message) => ({
      speaker: message.role === "user" ? userLabel : (message.agentName ?? "Agent"),
      text: message.content,
    }));
}

/**
 * Builds one agent's prompt. The transcript is trimmed to the recent window so
 * a long conversation cannot grow the per-turn cost without bound.
 */
export function roomPrompt(input: {
  persona: RoomPersona;
  transcript: RoomTurn[];
  context: string;
  turnWindow?: number;
}) {
  const context = input.context
    ? `\n\n--- THIS WORKSPACE'S APPROVED CONTEXT ---\n${input.context}\n--- end context ---\nGround your reply in THIS. Be specific to this workspace rather than giving advice you could give anyone.`
    : "";
  const system = `${ROOM_SYSTEM}\n\nYou are ${input.persona.name}. ${input.persona.persona}${context}`;
  const window = input.transcript.slice(-(input.turnWindow ?? 14));
  const conversation = window.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n");
  return {
    system,
    user: `${conversation}\n\n${input.persona.name}:`.slice(0, 20_000),
  };
}

export type RoomDirective = { kind: "note" | "pipeline"; label: string };
export type RoomDirectiveProposal = RoomDirective & { body: string; agentId: string; agentName: string };
export type RoomDirectiveReview = {
  jobId: string;
  index: number;
  proposal: RoomDirectiveProposal;
  decision: "pending" | "approved" | "rejected";
  recordId: string | null;
};

export function validRoomDirectiveProposal(value: unknown): value is RoomDirectiveProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return Object.keys(p).length === 5 && (p.kind === "note" || p.kind === "pipeline")
    && typeof p.label === "string" && p.label.trim().length > 0 && p.label.length <= (p.kind === "note" ? 80 : 120)
    && typeof p.body === "string" && p.body.trim().length > 0 && p.body.length <= 4000
    && typeof p.agentId === "string" && p.agentId.length > 0 && p.agentId.length <= 40
    && typeof p.agentName === "string" && p.agentName.length > 0 && p.agentName.length <= 60;
}

/**
 * Splits an agent reply into its visible message and any NOTE:: / PIPELINE::
 * directives. The directive lines never reach the transcript.
 */
export function parseRoomDirectives(text: string): { clean: string; directives: RoomDirective[] } {
  const directives: RoomDirective[] = [];
  const note = text.match(/^\s*NOTE::\s*(.+?)\s*$/im);
  const pipeline = text.match(/^\s*PIPELINE::\s*(.+?)\s*$/im);
  const clean = text.replace(/^\s*(?:NOTE|PIPELINE)::.*$/gim, "").replace(/\n{3,}/g, "\n\n").trim();
  if (note?.[1]) directives.push({ kind: "note", label: note[1].trim().slice(0, 80) });
  if (pipeline?.[1]) directives.push({ kind: "pipeline", label: pipeline[1].trim().slice(0, 120) });
  return { clean: clean || text.trim(), directives };
}

export function roomContextSummary(titles: string[]) {
  return titles.length ? `Read this workspace's memory — ${titles.slice(0, 6).join(" · ")}` : "";
}

export function roomActionSummary(directive: RoomDirective, agentName: string, ok: boolean) {
  if (!ok) return `${agentName} tried to save "${directive.label}" and it failed`;
  return directive.kind === "note"
    ? `${agentName} saved a memory note: ${directive.label}`
    : `${agentName} added to the pipeline: ${directive.label}`;
}

export function roomConversationTitle(firstUserMessage: string) {
  const trimmed = firstUserMessage.trim().replace(/\s+/g, " ");
  return (trimmed.slice(0, 50) || "New chat");
}

export function roomTimeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function roomFormatMicros(micros: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(micros / 1_000_000);
}

function str(value: unknown, max = 240) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function nullableStr(value: unknown, max = 240) {
  const text = str(value, max);
  return text ? text : null;
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (allowed as readonly string[]).includes(text) ? text as T[number] : fallback;
}

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeRoomConversation(row: Record<string, unknown>): RoomConversation {
  return {
    id: str(row.id, 36),
    title: str(row.title, 120) || "New chat",
    status: row.status === "archived" ? "archived" : "active",
    presentAgents: Array.isArray(row.present_agents) ? row.present_agents.filter((value): value is string => typeof value === "string").slice(0, 16) : [],
    createdAt: str(row.created_at, 40),
    updatedAt: str(row.updated_at, 40),
    retentionExpiresAt: nullableStr(row.retention_expires_at, 40),
  };
}

export function normalizeRoomMessage(row: Record<string, unknown>): RoomMessage {
  return {
    id: str(row.id, 36),
    conversationId: str(row.conversation_id, 36),
    role: oneOf(row.role, ROOM_MESSAGE_ROLES, "system"),
    kind: oneOf(row.kind, ROOM_MESSAGE_KINDS, "message"),
    agentId: nullableStr(row.agent_id, 40),
    agentName: nullableStr(row.agent_name, 60),
    agentColor: nullableStr(row.agent_color, 7),
    content: str(row.content, 20000),
    provider: nullableStr(row.provider, 40),
    model: nullableStr(row.model, 120),
    costMicros: Math.max(0, Math.round(num(row.cost_micros))),
    errorCode: nullableStr(row.error_code, 120),
    linkedRecordId: nullableStr(row.linked_record_id, 36),
    seq: Math.max(0, Math.round(num(row.seq))),
    createdAt: str(row.created_at, 40),
  };
}

export function normalizeRoomRound(row: Record<string, unknown>): RoomRound {
  return {
    id: str(row.id, 36),
    conversationId: str(row.conversation_id, 36),
    jobId: nullableStr(row.job_id, 36),
    status: oneOf(row.status, ROOM_ROUND_STATUSES, "queued"),
    agentIds: Array.isArray(row.agent_ids) ? row.agent_ids.filter((value): value is string => typeof value === "string").slice(0, 16) : [],
    speakingAgentId: nullableStr(row.speaking_agent_id, 40),
    completedAgents: Math.max(0, Math.round(num(row.completed_agents))),
    costMicros: Math.max(0, Math.round(num(row.cost_micros))),
    errorCode: nullableStr(row.error_code, 120),
    createdAt: str(row.created_at, 40),
    updatedAt: str(row.updated_at, 40),
  };
}

export function roomSchemaMissing(status: number, body?: unknown) {
  if (status === 404) return true;
  if (status !== 400 && status !== 406) return false;
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return /client_room|schema cache|PGRST205|PGRST202|does not exist/i.test(text);
}
