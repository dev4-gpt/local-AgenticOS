// Server-side data access for the hosted Agent Room.

import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, deleteClientRecord, insertClientRecord, selectClientRecords, updateClientRecord } from "@/lib/clientDataPlane";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import {
  ROOM_PERSONAS,
  normalizeRoomConversation,
  normalizeRoomMessage,
  normalizeRoomRound,
  resolveRoomRoster,
  roomSchemaMissing,
  type RoomConversation,
  type RoomMessage,
  type RoomRound,
} from "@/lib/clientRoomAdapter";

export const ROOM_TABLES = {
  conversations: "client_room_conversations",
  messages: "client_room_messages",
  rounds: "client_room_rounds",
} as const;

export const ROOM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RoomSession = { userId: string; tenantSlug: string };

/**
 * The room speaks to external providers, so it needs the text-agents capability
 * on top of orchestration. Membership plus an active session is the boundary.
 */
export async function roomSession(): Promise<RoomSession | null> {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return null;
  if (!clientCapabilityEnabled("orchestration") || !clientCapabilityEnabled("text-agents")) return null;
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  return tenantSlug ? { userId: user.id, tenantSlug } : null;
}

export function roomError(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, {
    status,
    headers: {
      "cache-control": "private, no-store",
      ...(code === "runtime_rate_limited" ? { "Retry-After": "900" } : {}),
    },
  });
}

export function roomJson(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status, headers: { "cache-control": "private, no-store" } });
}

export function roomReadLimit() {
  return checkClientRuntimeRateLimit("room-read", 300, 900);
}

export function roomWriteLimit() {
  return checkClientRuntimeRateLimit("room-write", 40, 900);
}

/**
 * The roster the tenant may actually call. A persona whose provider is not
 * allowlisted comes back disabled with the real reason instead of being
 * silently dropped, so the UI can explain the blocked prerequisite.
 */
export function roomRoster() {
  const fallback = process.env.CLIENT_WORKSPACE_PROVIDER?.trim().toLowerCase() || "openrouter";
  return resolveRoomRoster(ROOM_PERSONAS, (provider) => {
    const policy = clientProviderRequestAllowed(provider, null);
    return policy.ok
      ? { ok: true as const, provider: policy.provider, model: policy.model }
      : { ok: false as const, error: policy.error };
  }, fallback);
}

type Read<T> = { ok: true; rows: T[] } | { ok: false; schemaMissing: boolean; status: number };

async function read<T>(table: string, filters: Record<string, string>, normalize: (row: Record<string, unknown>) => T): Promise<Read<T>> {
  const result = await selectClientRecords(table, filters);
  if (!result.ok) return { ok: false, schemaMissing: roomSchemaMissing(result.status), status: result.status };
  return { ok: true, rows: result.records.map(normalize) };
}

export function readRoomConversations(tenantSlug: string) {
  return read<RoomConversation>(ROOM_TABLES.conversations, {
    tenant_slug: `eq.${tenantSlug}`,
    order: "updated_at.desc",
    limit: "80",
  }, normalizeRoomConversation);
}

export function readRoomMessages(tenantSlug: string, conversationId: string) {
  return read<RoomMessage>(ROOM_TABLES.messages, {
    tenant_slug: `eq.${tenantSlug}`,
    conversation_id: `eq.${conversationId}`,
    order: "seq.asc",
    limit: "400",
  }, normalizeRoomMessage);
}

export function readRoomRounds(tenantSlug: string, conversationId: string) {
  return read<RoomRound>(ROOM_TABLES.rounds, {
    tenant_slug: `eq.${tenantSlug}`,
    conversation_id: `eq.${conversationId}`,
    order: "created_at.desc",
    limit: "10",
  }, normalizeRoomRound);
}

export async function readRoomConversation(tenantSlug: string, id: string) {
  const result = await selectClientRecords(ROOM_TABLES.conversations, {
    tenant_slug: `eq.${tenantSlug}`,
    id: `eq.${id}`,
    limit: "1",
  });
  if (!result.ok || !result.records[0]) return null;
  return normalizeRoomConversation(result.records[0]);
}

export function insertRoomConversation(record: Record<string, unknown>) {
  return insertClientRecord(ROOM_TABLES.conversations, record);
}

export function updateRoomConversation(tenantSlug: string, id: string, patch: Record<string, unknown>) {
  return updateClientRecord(ROOM_TABLES.conversations, { id: `eq.${id}`, tenant_slug: `eq.${tenantSlug}` }, { ...patch, updated_at: new Date().toISOString() });
}

export function deleteRoomConversation(tenantSlug: string, id: string) {
  return deleteClientRecord(ROOM_TABLES.conversations, { id: `eq.${id}`, tenant_slug: `eq.${tenantSlug}` });
}

export function insertRoomRound(record: Record<string, unknown>) {
  return insertClientRecord(ROOM_TABLES.rounds, record);
}

export function updateRoomRound(tenantSlug: string, id: string, patch: Record<string, unknown>) {
  return updateClientRecord(ROOM_TABLES.rounds, { id: `eq.${id}`, tenant_slug: `eq.${tenantSlug}` }, { ...patch, updated_at: new Date().toISOString() });
}

/**
 * Appends a message through the sequencing function so two writers cannot land
 * on the same seq for one conversation.
 */
export async function appendRoomMessage(input: {
  tenantSlug: string;
  conversationId: string;
  role: string;
  kind?: string;
  content: string;
  agentId?: string | null;
  agentName?: string | null;
  agentColor?: string | null;
  provider?: string | null;
  model?: string | null;
  costMicros?: number;
  errorCode?: string | null;
  linkedRecordId?: string | null;
}) {
  const result = await clientRpc("append_client_room_message", {
    p_tenant_slug: input.tenantSlug,
    p_conversation_id: input.conversationId,
    p_role: input.role,
    p_kind: input.kind ?? "message",
    p_content: input.content,
    p_agent_id: input.agentId ?? null,
    p_agent_name: input.agentName ?? null,
    p_agent_color: input.agentColor ?? null,
    p_provider: input.provider ?? null,
    p_model: input.model ?? null,
    p_cost_micros: Math.max(0, Math.round(input.costMicros ?? 0)),
    p_error_code: input.errorCode ?? null,
    p_linked_record_id: input.linkedRecordId ?? null,
  });
  if (!result.ok) return { ok: false as const, schemaMissing: roomSchemaMissing(result.status, result.value), status: result.status };
  const row = result.value && typeof result.value === "object" && !Array.isArray(result.value) ? result.value as Record<string, unknown> : null;
  return row ? { ok: true as const, message: normalizeRoomMessage(row) } : { ok: false as const, schemaMissing: false, status: 502 };
}

/**
 * Approved context for a round: the tenant's own memory records. This is the
 * hosted stand-in for the local room reading an Obsidian vault — same product
 * outcome, tenant-owned rows instead of a laptop filesystem.
 */
export async function roomMemoryContext(tenantSlug: string, query: string) {
  const result = await selectClientRecords("client_runtime_records", {
    tenant_slug: `eq.${tenantSlug}`,
    kind: "eq.memory",
    order: "created_at.desc",
    limit: "40",
  });
  if (!result.ok) return { titles: [] as string[], text: "" };
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3);
  const scored = result.records
    .map((row) => {
      const title = typeof row.title === "string" ? row.title : "";
      const content = typeof row.content === "string" ? row.content : "";
      const haystack = `${title}\n${content}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { title, content, score };
    })
    .filter((entry) => entry.title)
    .sort((left, right) => right.score - left.score);
  // Always give the agents something recent to ground on, even when the
  // question shares no keywords with stored memory.
  const chosen = (scored.some((entry) => entry.score > 0) ? scored.filter((entry) => entry.score > 0) : scored).slice(0, 5);
  if (!chosen.length) return { titles: [], text: "" };
  return {
    titles: chosen.map((entry) => entry.title),
    text: chosen.map((entry) => `• ${entry.title} — ${entry.content.replace(/\s+/g, " ").slice(0, 200)}`).join("\n").slice(0, 4000),
  };
}
