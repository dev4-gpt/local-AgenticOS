import { NextResponse } from "next/server";
import { currentClientMember } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, recordClientAudit } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled, clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";
import { runClientTextAdapter } from "@/lib/clientProviderAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await currentClientMember())) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  if (!clientCapabilityEnabled("text-agents")) return NextResponse.json({ ok: false, error: "capability_not_enabled" }, { status: 403 });
  if (!clientProviderCallsEnabled()) return NextResponse.json({ ok: false, error: "provider_calls_require_approval" }, { status: 403 });
  const rateLimit = await checkClientRuntimeRateLimit("provider-chat", 10, 900);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, error: "runtime_limit_unavailable" }, { status: 503 });
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "runtime_rate_limited" }, { status: 429, headers: { "Retry-After": "900" } });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const provider = typeof body.provider === "string" ? body.provider : "";
  const model = typeof body.model === "string" ? body.model : undefined;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const history = Array.isArray(body.history) ? body.history.filter((item): item is { role: "system" | "user" | "assistant"; content: string } => Boolean(item && typeof item === "object" && ["system", "user", "assistant"].includes(String((item as Record<string, unknown>).role)) && typeof (item as Record<string, unknown>).content === "string")).slice(-16) : [];
  const result = await runClientTextAdapter({ provider, model, prompt, history });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  await recordClientAudit("provider.text.completed", { provider: result.provider, model: result.model });
  return NextResponse.json({ ok: true, provider: result.provider, model: result.model, output: result.output }, { headers: { "cache-control": "no-store" } });
}
