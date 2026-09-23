import { randomUUID } from "node:crypto";
import { recordClientAudit } from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import {
  ROOM_UUID_RE,
  deleteRoomConversation,
  insertRoomConversation,
  readRoomConversations,
  roomError,
  roomJson,
  roomReadLimit,
  roomRoster,
  roomSession,
  roomWriteLimit,
  updateRoomConversation,
} from "@/lib/clientRoomData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The room's history list plus the roster this tenant may actually call.
export async function GET() {
  const session = await roomSession();
  if (!session) return roomError("not_authenticated", 401);
  const limit = await roomReadLimit();
  if (!limit.ok) return roomError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return roomError("runtime_rate_limited", 429);
  const conversations = await readRoomConversations(session.tenantSlug);
  if (!conversations.ok) {
    return conversations.schemaMissing
      ? roomJson({ configured: false, reason: "room_schema_missing", conversations: [], roster: await roomRoster() })
      : roomError("room_read_failed", 502);
  }
  return roomJson({ configured: true, conversations: conversations.rows, roster: await roomRoster() });
}

export async function POST(request: Request) {
  const session = await roomSession();
  if (!session) return roomError("not_authenticated", 401);
  const limit = await roomWriteLimit();
  if (!limit.ok) return roomError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return roomError("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "New chat";
  if (containsClientSecretLike(title)) return roomError("secret_like_input_rejected", 400);

  // Default the room to every persona the tenant can actually call, so a new
  // chat is usable without first configuring a roster.
  const available = (await roomRoster()).filter((entry) => entry.available).map((entry) => entry.id);
  const requested = Array.isArray(body.presentAgents)
    ? body.presentAgents.filter((value): value is string => typeof value === "string" && available.includes(value))
    : available;

  const id = randomUUID();
  const stored = await insertRoomConversation({
    id,
    tenant_slug: session.tenantSlug,
    created_by: session.userId,
    title,
    present_agents: requested.slice(0, 16),
  });
  if (!stored.ok) return roomError(stored.status === 404 ? "room_schema_missing" : "room_write_failed", stored.status === 404 ? 503 : 502);
  await recordClientAudit("room.conversation_created", { agents: requested.length });
  return roomJson({ conversationId: id }, 201);
}

export async function PATCH(request: Request) {
  const session = await roomSession();
  if (!session) return roomError("not_authenticated", 401);
  const limit = await roomWriteLimit();
  if (!limit.ok) return roomError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return roomError("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!ROOM_UUID_RE.test(id)) return roomError("room_input_invalid", 400);

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) {
    if (containsClientSecretLike(body.title)) return roomError("secret_like_input_rejected", 400);
    patch.title = body.title.trim().slice(0, 120);
  }
  if (body.status === "active" || body.status === "archived") patch.status = body.status;
  if (Array.isArray(body.presentAgents)) {
    const available = (await roomRoster()).filter((entry) => entry.available).map((entry) => entry.id);
    // A persona whose provider is not approved cannot be added to the room; the
    // roster chip stays visible but disabled rather than silently accepted.
    patch.present_agents = body.presentAgents
      .filter((value): value is string => typeof value === "string" && available.includes(value))
      .slice(0, 16);
  }
  if (Object.keys(patch).length === 0) return roomError("room_input_invalid", 400);

  const updated = await updateRoomConversation(session.tenantSlug, id, patch);
  if (!updated.ok) return roomError("room_write_failed", 502);
  return roomJson({});
}

export async function DELETE(request: Request) {
  const session = await roomSession();
  if (!session) return roomError("not_authenticated", 401);
  const limit = await roomWriteLimit();
  if (!limit.ok) return roomError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return roomError("runtime_rate_limited", 429);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!ROOM_UUID_RE.test(id)) return roomError("room_input_invalid", 400);
  const removed = await deleteRoomConversation(session.tenantSlug, id);
  if (!removed.ok) return roomError("room_delete_failed", 502);
  await recordClientAudit("room.conversation_deleted", {});
  return roomJson({});
}
