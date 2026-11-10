import { randomUUID } from "node:crypto";
import { cancelClientRuntimeJob, enqueueClientRuntimeJob, recordClientAudit, refundClientRuntimeRateLimit } from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import { clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { clientWorkspaceJobConfigured } from "@/lib/clientCloudRunJobs";
import { enqueueClientRuntimeTask } from "@/lib/cloudTasks";
import {
  ROOM_UUID_RE,
  appendRoomMessage,
  insertRoomRound,
  readRoomConversation,
  readRoomMessages,
  readRoomRounds,
  roomError,
  roomJson,
  roomMemoryContext,
  roomReadLimit,
  roomRoster,
  roomSession,
  roomWriteLimit,
  updateRoomConversation,
  updateRoomRound,
} from "@/lib/clientRoomData";
import { roomContextSummary, roomConversationTitle, roomRoundAgents, roomTranscript } from "@/lib/clientRoomAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The transcript plus the live round state. The client polls this while a round
// is running, which is how the hosted room reproduces the local room's
// turn-by-turn arrival without a streaming provider lane.
export async function GET(request: Request) {
  const session = await roomSession();
  if (!session) return roomError("not_authenticated", 401);
  const limit = await roomReadLimit();
  if (!limit.ok) return roomError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return roomError("runtime_rate_limited", 429);
  const conversationId = new URL(request.url).searchParams.get("conversationId")?.trim() ?? "";
  if (!ROOM_UUID_RE.test(conversationId)) return roomError("room_input_invalid", 400);

  const conversation = await readRoomConversation(session.tenantSlug, conversationId);
  if (!conversation) return roomError("room_conversation_not_found", 404);
  const [messages, rounds] = await Promise.all([
    readRoomMessages(session.tenantSlug, conversationId),
    readRoomRounds(session.tenantSlug, conversationId),
  ]);
  if (!messages.ok || !rounds.ok) {
    const schemaMissing = (!messages.ok && messages.schemaMissing) || (!rounds.ok && rounds.schemaMissing);
    return schemaMissing ? roomJson({ configured: false, reason: "room_schema_missing" }) : roomError("room_read_failed", 502);
  }
  const activeRound = rounds.rows.find((round) => round.status === "queued" || round.status === "running") ?? null;
  return roomJson({
    configured: true,
    conversation,
    messages: messages.rows,
    activeRound,
    lastRound: rounds.rows[0] ?? null,
  });
}

/**
 * Sends a message to the room. The user's turn is persisted immediately, then
 * one round job is queued: the worker walks the agents in order and appends
 * each reply as it lands, so the transcript fills in progressively.
 */
export async function POST(request: Request) {
  const session = await roomSession();
  if (!session) return roomError("not_authenticated", 401);
  if (!clientProviderCallsEnabled()) return roomError("provider_calls_require_approval", 403);
  const limit = await roomWriteLimit();
  if (!limit.ok) return roomError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return roomError("runtime_rate_limited", 429);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
  if (!ROOM_UUID_RE.test(conversationId) || !message) return roomError("room_input_invalid", 400);
  if (containsClientSecretLike(message)) return roomError("secret_like_input_rejected", 400);

  const conversation = await readRoomConversation(session.tenantSlug, conversationId);
  if (!conversation) return roomError("room_conversation_not_found", 404);

  // Refuse to start a second round while one is in flight: it would interleave
  // two transcripts and spend the tenant budget twice on the same exchange.
  const rounds = await readRoomRounds(session.tenantSlug, conversationId);
  if (rounds.ok && rounds.rows.some((round) => round.status === "queued" || round.status === "running")) {
    return roomError("room_round_already_active", 409);
  }

  const roster = await roomRoster();
  const availableIds = roster.filter((entry) => entry.available).map((entry) => entry.id);
  const present = conversation.presentAgents.filter((id) => availableIds.includes(id));
  if (!present.length) return roomError("room_no_available_agents", 409);

  const speakingIds = roomRoundAgents(message, present).slice(0, 8);
  // Every speaker must clear the allowlist before anything is queued.
  const resolved = speakingIds.map((id) => {
    const entry = roster.find((candidate) => candidate.id === id);
    const policy = entry?.resolvedProvider ? clientProviderRequestAllowed(entry.resolvedProvider, entry.model) : { ok: false as const, error: "provider_not_allowlisted", status: 403 };
    return { id, entry, policy };
  });
  const rejected = resolved.find((item) => !item.policy.ok);
  if (rejected && !rejected.policy.ok) return roomError(rejected.policy.error, rejected.policy.status);

  const stored = await appendRoomMessage({
    tenantSlug: session.tenantSlug,
    conversationId,
    role: "user",
    content: message,
  });
  if (!stored.ok) return roomError(stored.schemaMissing ? "room_schema_missing" : "room_write_failed", stored.schemaMissing ? 503 : 502);

  // Name the conversation from its first message, as the local room does.
  if (stored.message.seq === 1) {
    await updateRoomConversation(session.tenantSlug, conversationId, { title: roomConversationTitle(message) });
  }

  // Ground the round in this tenant's approved memory and show the sources
  // immediately, the way the local room emits its context notice first.
  const context = await roomMemoryContext(session.tenantSlug, message);
  if (context.titles.length) {
    await appendRoomMessage({
      tenantSlug: session.tenantSlug,
      conversationId,
      role: "system",
      kind: "context",
      content: roomContextSummary(context.titles),
    });
  }

  // The worker holds no member session, so it receives the transcript rather
  // than reading tenant rows itself.
  const history = await readRoomMessages(session.tenantSlug, conversationId);
  const transcript = history.ok ? roomTranscript(history.rows).slice(-14) : [{ speaker: "You", text: message }];

  const roundId = randomUUID();
  const roundStored = await insertRoomRound({
    id: roundId,
    tenant_slug: session.tenantSlug,
    conversation_id: conversationId,
    created_by: session.userId,
    agent_ids: speakingIds,
    status: "queued",
  });
  if (!roundStored.ok) return roomError("room_write_failed", 502);

  const jobId = await enqueueClientRuntimeJob({
    capability: "room-round",
    provider: resolved[0]?.policy.ok ? resolved[0].policy.provider : null,
    model: resolved[0]?.policy.ok ? resolved[0].policy.model : null,
    idempotencyKey: `room-round-${roundId}`,
    inputMetadata: {
      conversationId,
      roundId,
      roomCreatedAt: conversation.createdAt,
      roomRetentionExpiresAt: conversation.retentionExpiresAt,
      message,
      transcript,
      contextText: context.text,
      agents: resolved.map((item) => ({
        id: item.id,
        name: item.entry?.name ?? item.id,
        color: item.entry?.color ?? "#a855f7",
        provider: item.policy.ok ? item.policy.provider : null,
        model: item.policy.ok ? item.policy.model : null,
      })),
    },
  });
  if (!jobId) {
    await updateRoomRound(session.tenantSlug, roundId, { status: "failed", error_code: "room_job_store_failed" });
    return roomError("room_job_store_failed", 502);
  }
  await updateRoomRound(session.tenantSlug, roundId, { job_id: jobId });

  const task = await enqueueClientRuntimeTask({ jobId, tenantSlug: session.tenantSlug, path: clientWorkspaceJobConfigured() ? "dispatch" : "jobs" });
  if (!task.ok) {
    const taskError = task.error ?? "task_enqueue_failed";
    await cancelClientRuntimeJob(jobId, taskError);
    await refundClientRuntimeRateLimit("room-write", 900);
    await updateRoomRound(session.tenantSlug, roundId, { status: "failed", error_code: taskError });
    return roomError(taskError, task.status >= 500 ? 503 : task.status);
  }

  await recordClientAudit("room.round_dispatched", { agents: speakingIds.length });
  return roomJson({ roundId, jobId, agentIds: speakingIds, status: "queued" }, 202);
}
