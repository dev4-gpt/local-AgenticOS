import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, selectClientRecords } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = /^[a-z0-9-]{1,80}$/;

export async function GET(request: Request) {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember())) return jsonError("not_authenticated", 401);
  if (!clientCapabilityEnabled("text-agents")) return jsonError("capability_not_enabled", 403);

  const rateLimit = await checkClientRuntimeRateLimit("provider-history-read", 60, 900);
  if (!rateLimit.ok) return jsonError("runtime_limit_unavailable", 503);
  if (!rateLimit.allowed) return jsonError("runtime_rate_limited", 429);

  const provider = new URL(request.url).searchParams.get("provider")?.trim().toLowerCase() ?? "";
  if (!PROVIDER.test(provider)) return jsonError("provider_invalid", 400);

  const result = await selectClientRecords("client_runtime_jobs", {
    tenant_slug: `eq.${process.env.CLIENT_SLUG ?? ""}`,
    capability: "eq.text-agents",
    provider: `eq.${provider}`,
    order: "created_at.asc",
    limit: "120",
  });
  if (!result.ok) return jsonError("provider_history_read_failed", 502);

  const messages = result.records.flatMap((job) => {
    const input = asRecord(job.input_metadata);
    const output = asRecord(job.output_metadata);
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    if (!prompt) return [];

    const jobId = typeof job.id === "string" ? job.id : undefined;
    const createdAt = toTimestamp(job.created_at);
    const userMessage = { id: `${jobId ?? createdAt}-user`, role: "user" as const, content: prompt, jobId, createdAt };
    const assistantOutput = typeof output.output === "string" ? output.output.trim() : "";
    if (job.status === "succeeded" && assistantOutput) {
      return [userMessage, { id: `${jobId ?? createdAt}-assistant`, role: "assistant" as const, content: assistantOutput, jobId, createdAt: toTimestamp(job.finished_at) || createdAt }];
    }
    return [userMessage];
  });

  return NextResponse.json({ ok: true, provider, messages }, { headers: { "cache-control": "private, no-store" } });
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toTimestamp(value: unknown) {
  const timestamp = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "private, no-store" } });
}
