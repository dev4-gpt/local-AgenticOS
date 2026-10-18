import { clientRpc, selectClientRecords } from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { readBoundedJsonObject } from "@/lib/clientNetworkSafety";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import { validRoomDirectiveProposal, type RoomDirectiveReview } from "@/lib/clientRoomAdapter";
import { ROOM_UUID_RE, readRoomConversation, roomError, roomJson, roomReadLimit, roomSession, roomWriteLimit } from "@/lib/clientRoomData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await roomSession();
  if (!session) return roomError("not_authenticated", 401);
  const limit = await roomReadLimit();
  if (!limit.ok) return roomError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return roomError("runtime_rate_limited", 429);
  const params = new URL(request.url).searchParams;
  const conversationId = params.get("conversationId") ?? "";
  const offset = params.get("offset") ?? "0";
  if (!ROOM_UUID_RE.test(conversationId) || !/^(0|[1-9][0-9]{0,4})$/.test(offset)) return roomError("room_input_invalid", 400);
  if (!(await readRoomConversation(session.tenantSlug, conversationId))) return roomError("room_conversation_not_found", 404);
  const result = await selectClientRecords("client_runtime_jobs", {
    tenant_slug: `eq.${session.tenantSlug}`, requested_by: `eq.${session.userId}`,
    capability: "eq.room-round", status: "eq.succeeded", error_code: "is.null",
    "input_metadata->>conversationId": `eq.${conversationId}`,
    order: "created_at.desc,id.desc", limit: "11", offset,
  });
  if (!result.ok) return roomError("room_proposals_read_failed", 502);
  const proposals: RoomDirectiveReview[] = [];
  for (const row of result.records.slice(0, 10)) {
    const output = row.output_metadata as Record<string, unknown> | null;
    if (!output || output.failureDisposition === "blocked" || !Array.isArray(output.roomDirectives)
      || output.roomDirectives.length > 16 || typeof row.id !== "string" || !ROOM_UUID_RE.test(row.id)) continue;
    const reviews = output.roomDirectiveReviews && typeof output.roomDirectiveReviews === "object"
      ? output.roomDirectiveReviews as Record<string, Record<string, unknown>> : {};
    output.roomDirectives.forEach((proposal, index) => {
      if (!validRoomDirectiveProposal(proposal)) return;
      const review = reviews[String(index)];
      proposals.push({ jobId: row.id as string, index, proposal,
        decision: review?.decision === "approved" || review?.decision === "rejected" ? review.decision : "pending",
        recordId: typeof review?.recordId === "string" ? review.recordId : null });
    });
  }
  return roomJson({ proposals, hasMore: result.records.length > 10, nextOffset: Number(offset) + 10 });
}

export async function POST(request: Request) {
  const session = await roomSession();
  if (!session) return roomError("not_authenticated", 401);
  const limit = await roomWriteLimit();
  if (!limit.ok) return roomError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return roomError("runtime_rate_limited", 429);
  const parsed = await readBoundedJsonObject(request, 32 * 1024);
  if (!parsed.ok) return roomError("room_review_input_invalid", parsed.reason === "too_large" ? 413 : 400);
  const { jobId, index, proposal, decision } = parsed.value;
  if (typeof jobId !== "string" || !ROOM_UUID_RE.test(jobId) || !Number.isInteger(index) || Number(index) < 0 || Number(index) >= 16
    || !validRoomDirectiveProposal(proposal) || (decision !== "approved" && decision !== "rejected")) return roomError("room_review_input_invalid", 400);
  if (proposal.kind === "note" && !clientCapabilityEnabled("tenant-data")) return roomError("capability_not_enabled", 403);
  if (containsClientSecretLike(`${proposal.label}\n${proposal.body}`)) return roomError("secret_like_input_rejected", 400);
  const result = await clientRpc("review_client_room_directive", {
    p_tenant_slug: session.tenantSlug, p_job_id: jobId, p_index: index, p_expected: proposal, p_decision: decision,
  });
  if (!result.ok) return roomError("room_review_unavailable", 503);
  if (!result.value || typeof result.value !== "object" || Array.isArray(result.value)) return roomError("room_review_conflict", 409);
  const review = result.value as Record<string, unknown>;
  if (review.decision !== decision) return roomError("room_review_conflict", 409);
  return roomJson({ review });
}
