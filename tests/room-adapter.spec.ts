import { expect, test } from "@playwright/test";
import {
  ROOM_PERSONAS,
  normalizeRoomMessage,
  normalizeRoomRound,
  parseRoomDirectives,
  resolveRoomRoster,
  roomActionSummary,
  roomConversationTitle,
  roomMentionedIds,
  roomPrompt,
  roomRoundAgents,
  roomSchemaMissing,
  roomTranscript,
  type RoomMessage,
} from "../src/lib/clientRoomAdapter";

function message(overrides: Partial<RoomMessage> & { id: string; seq: number }): RoomMessage {
  return {
    conversationId: "c1", role: "agent", kind: "message", agentId: "claude", agentName: "Claude",
    agentColor: "#d97757", content: "hi", provider: "anthropic", model: "claude-sonnet-5",
    costMicros: 0, errorCode: null, linkedRecordId: null, createdAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

test("a persona whose provider is not allowlisted stays visible but disabled with the real reason", () => {
  const roster = resolveRoomRoster(ROOM_PERSONAS, (provider) =>
    provider === "openrouter"
      ? { ok: true, provider: "openrouter", model: "google/gemini-3.1-flash-lite" }
      : { ok: false, error: "provider_not_allowlisted" });
  const claude = roster.find((entry) => entry.id === "claude");
  const hermes = roster.find((entry) => entry.id === "hermes");
  expect(roster).toHaveLength(ROOM_PERSONAS.length);
  expect(claude?.available).toBe(false);
  expect(claude?.model).toBeNull();
  expect(claude?.blockedReason).toBe("provider_not_allowlisted");
  expect(hermes?.available).toBe(true);
  expect(hermes?.model).toBe("google/gemini-3.1-flash-lite");
});

test("an unavailable persona falls back to the tenant workspace provider when one is allowed", () => {
  const roster = resolveRoomRoster(ROOM_PERSONAS, (provider) =>
    provider === "openrouter"
      ? { ok: true, provider: "openrouter", model: "fallback-model" }
      : { ok: false, error: "provider_not_allowlisted" }, "openrouter");
  const gemini = roster.find((entry) => entry.id === "gemini");
  expect(gemini?.available).toBe(true);
  expect(gemini?.resolvedProvider).toBe("openrouter");
  expect(gemini?.model).toBe("fallback-model");
});

test("a missing primary execution credential forces an approved fallback", () => {
  const roster = resolveRoomRoster(ROOM_PERSONAS, (provider) =>
    provider === "groq"
      ? { ok: true, provider: "groq", model: "openai/gpt-oss-120b" }
      : { ok: false, error: "provider_not_configured" }, "groq");
  const hermes = roster.find((entry) => entry.id === "hermes");
  expect(hermes).toMatchObject({ available: true, resolvedProvider: "groq", model: "openai/gpt-oss-120b" });
});

test("a persona gets its preferred model when the tenant allowlists it", () => {
  const allowed = new Set(["nousresearch/hermes-4-70b", "google/gemini-3.1-flash-lite"]);
  const roster = resolveRoomRoster(ROOM_PERSONAS, (provider, model) => {
    if (provider !== "openrouter") return { ok: false, error: "provider_not_allowlisted" };
    if (model && !allowed.has(model)) return { ok: false, error: "model_not_allowlisted" };
    return { ok: true, provider: "openrouter", model: model ?? "google/gemini-3.1-flash-lite" };
  });
  // Hermes' preference is allowlisted, so it gets a distinct model.
  expect(roster.find((entry) => entry.id === "hermes")?.model).toBe("nousresearch/hermes-4-70b");
  // Codex's preference is not, so it falls back rather than becoming unavailable.
  const codex = roster.find((entry) => entry.id === "codex");
  expect(codex?.available).toBe(true);
  expect(codex?.model).toBe("google/gemini-3.1-flash-lite");
});

test("with a single-model allowlist every openrouter persona collapses onto it", () => {
  const roster = resolveRoomRoster(ROOM_PERSONAS, (provider, model) => {
    if (provider !== "openrouter") return { ok: false, error: "provider_not_allowlisted" };
    if (model) return { ok: false, error: "model_not_allowlisted" };
    return { ok: true, provider: "openrouter", model: "only-model" };
  });
  const openrouterModels = roster.filter((entry) => entry.resolvedProvider === "openrouter").map((entry) => entry.model);
  expect(openrouterModels.length).toBeGreaterThan(1);
  expect(new Set(openrouterModels)).toEqual(new Set(["only-model"]));
});

test("mentions narrow a round, and an unknown or absent mention does not empty it", () => {
  const present = ["claude", "hermes", "gemini"];
  expect(roomMentionedIds("@claude what do you think?", present)).toEqual(["claude"]);
  expect(roomRoundAgents("@claude @gemini thoughts?", present)).toEqual(["claude", "gemini"]);
  // A mention for someone not in the room must not silence the whole room.
  expect(roomRoundAgents("@nobody hello", present)).toEqual(present);
  expect(roomRoundAgents("no mentions here", present)).toEqual(present);
});

test("the transcript keeps only real turns, in sequence order", () => {
  const transcript = roomTranscript([
    message({ id: "3", seq: 3, role: "agent", agentName: "Hermes", content: "third" }),
    message({ id: "1", seq: 1, role: "user", agentName: null, content: "first" }),
    message({ id: "2", seq: 2, role: "system", kind: "context", content: "read memory" }),
  ]);
  expect(transcript).toEqual([
    { speaker: "You", text: "first" },
    { speaker: "Hermes", text: "third" },
  ]);
});

test("the prompt carries the persona and trims the transcript window", () => {
  const turns = Array.from({ length: 30 }, (_, index) => ({ speaker: "You", text: `turn ${index}` }));
  const prompt = roomPrompt({ persona: ROOM_PERSONAS[0], transcript: turns, context: "memory line", turnWindow: 5 });
  expect(prompt.system).toContain("You are Claude");
  expect(prompt.system).toContain("memory line");
  expect(prompt.user).toContain("turn 29");
  expect(prompt.user).not.toContain("turn 24");
  expect(prompt.user.endsWith("Claude:")).toBe(true);
});

test("the prompt omits the context block entirely when there is no memory", () => {
  const prompt = roomPrompt({ persona: ROOM_PERSONAS[0], transcript: [{ speaker: "You", text: "hi" }], context: "" });
  expect(prompt.system).not.toContain("APPROVED CONTEXT");
});

test("directives are stripped from the visible message and parsed out", () => {
  const parsed = parseRoomDirectives("Good idea, let's lock that in.\nNOTE:: Pricing decision\nPIPELINE:: Build the pricing page");
  expect(parsed.clean).toBe("Good idea, let's lock that in.");
  expect(parsed.directives).toEqual([
    { kind: "note", label: "Pricing decision" },
    { kind: "pipeline", label: "Build the pricing page" },
  ]);
});

test("a reply with no directives is returned untouched", () => {
  const parsed = parseRoomDirectives("Just a normal chat reply.");
  expect(parsed.clean).toBe("Just a normal chat reply.");
  expect(parsed.directives).toEqual([]);
});

test("a reply that is only a directive still leaves visible text rather than an empty message", () => {
  const parsed = parseRoomDirectives("NOTE:: Only a directive");
  expect(parsed.clean.length).toBeGreaterThan(0);
  expect(parsed.directives[0].kind).toBe("note");
});

test("action summaries say what actually happened", () => {
  expect(roomActionSummary({ kind: "note", label: "Pricing" }, "Claude", true)).toContain("saved a memory note");
  expect(roomActionSummary({ kind: "pipeline", label: "Pricing" }, "Claude", true)).toContain("added to the pipeline");
  expect(roomActionSummary({ kind: "note", label: "Pricing" }, "Claude", false)).toContain("failed");
});

test("normalizers reject unknown roles and kinds instead of trusting the row", () => {
  const normalized = normalizeRoomMessage({ id: "m", role: "hacker", kind: "exploit", cost_micros: "42", seq: "7" });
  expect(normalized.role).toBe("system");
  expect(normalized.kind).toBe("message");
  expect(normalized.costMicros).toBe(42);
  expect(normalized.seq).toBe(7);

  const round = normalizeRoomRound({ id: "r", status: "sideways", agent_ids: ["claude", 9] });
  expect(round.status).toBe("queued");
  expect(round.agentIds).toEqual(["claude"]);
});

test("conversation titles come from the first message and stay bounded", () => {
  expect(roomConversationTitle("  What should   we ship next?  ")).toBe("What should we ship next?");
  expect(roomConversationTitle("x".repeat(200)).length).toBe(50);
  expect(roomConversationTitle("   ")).toBe("New chat");
});

test("detects an unapplied room migration", () => {
  expect(roomSchemaMissing(404)).toBe(true);
  expect(roomSchemaMissing(400, { code: "PGRST205", message: "client_room_messages" })).toBe(true);
  expect(roomSchemaMissing(401)).toBe(false);
});
