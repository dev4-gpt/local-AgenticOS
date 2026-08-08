import { containsClientSecretLike } from "@/lib/clientInputSafety";
import { recordClientAudit } from "@/lib/clientDataPlane";
import { clientProviderRequestAllowed } from "@/lib/clientProviderAdapter";
import {
  PAPERCLIP_TABLES,
  UUID_RE,
  deletePaperclipRow,
  insertPaperclipRow,
  paperclipError,
  paperclipJson,
  paperclipReadLimit,
  paperclipSession,
  paperclipWriteLimit,
  readPaperclipAgents,
  updatePaperclipRow,
} from "@/lib/clientPaperclipData";
import { PAPERCLIP_AGENT_STATUSES, paperclipUrlKey, sortPaperclipAgents } from "@/lib/clientPaperclipAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BUDGET_MICROS = 1_000_000_000;

export async function GET() {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipReadLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const agents = await readPaperclipAgents(session.tenantSlug);
  if (!agents.ok) {
    return agents.schemaMissing
      ? paperclipJson({ configured: false, reason: "paperclip_schema_missing", agents: [] })
      : paperclipError("paperclip_read_failed", 502);
  }
  return paperclipJson({ configured: true, agents: sortPaperclipAgents(agents.rows) });
}

export async function POST(request: Request) {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipWriteLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const role = typeof body.role === "string" ? body.role.trim().slice(0, 80) : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const icon = typeof body.icon === "string" ? body.icon.trim().slice(0, 8) : "";
  const reportsTo = typeof body.reportsTo === "string" && UUID_RE.test(body.reportsTo.trim()) ? body.reportsTo.trim() : null;
  const budgetMicros = Math.min(MAX_BUDGET_MICROS, Math.max(0, Math.round(Number(body.budgetMicros ?? 0) || 0)));
  if (!name || containsClientSecretLike(name, role, title)) return paperclipError("paperclip_agent_input_invalid", 400);

  // An agent may only advertise a provider/model this tenant is actually
  // approved to call. Otherwise the roster would promise capability the
  // runtime would refuse at dispatch time.
  const requestedProvider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  const requestedModel = typeof body.model === "string" ? body.model.trim() : null;
  let provider: string | null = null;
  let model: string | null = null;
  if (requestedProvider) {
    const policy = clientProviderRequestAllowed(requestedProvider, requestedModel);
    if (!policy.ok) return paperclipError(policy.error, policy.status);
    provider = policy.provider;
    model = policy.model;
  }

  const stored = await insertPaperclipRow(PAPERCLIP_TABLES.agents, {
    tenant_slug: session.tenantSlug,
    created_by: session.userId,
    name,
    role,
    title: title || role,
    icon,
    reports_to: reportsTo,
    provider,
    model,
    budget_monthly_micros: budgetMicros,
    url_key: paperclipUrlKey(name, `agent-${Date.now().toString(36)}`),
  });
  if (!stored.ok) {
    if (stored.status === 404) return paperclipError("paperclip_schema_missing", 503);
    return paperclipError(stored.status === 409 ? "paperclip_agent_duplicate" : "paperclip_agent_write_failed", stored.status === 409 ? 409 : 502);
  }
  await recordClientAudit("paperclip.agent_created", { role, provider: provider ?? "none" });
  return paperclipJson({}, 201);
}

export async function PATCH(request: Request) {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipWriteLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) return paperclipError("paperclip_agent_input_invalid", 400);
  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string" && (PAPERCLIP_AGENT_STATUSES as readonly string[]).includes(body.status)) patch.status = body.status;
  if (typeof body.role === "string") patch.role = body.role.trim().slice(0, 80);
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 120);
  if (body.reportsTo === null) patch.reports_to = null;
  else if (typeof body.reportsTo === "string" && UUID_RE.test(body.reportsTo.trim())) {
    if (body.reportsTo.trim() === id) return paperclipError("paperclip_agent_input_invalid", 400);
    patch.reports_to = body.reportsTo.trim();
  }
  if (body.budgetMicros !== undefined) patch.budget_monthly_micros = Math.min(MAX_BUDGET_MICROS, Math.max(0, Math.round(Number(body.budgetMicros) || 0)));
  if (typeof body.provider === "string" && body.provider.trim()) {
    const policy = clientProviderRequestAllowed(body.provider.trim().toLowerCase(), typeof body.model === "string" ? body.model.trim() : null);
    if (!policy.ok) return paperclipError(policy.error, policy.status);
    patch.provider = policy.provider;
    patch.model = policy.model;
  }
  if (containsClientSecretLike(patch.role, patch.title)) return paperclipError("secret_like_input_rejected", 400);
  if (Object.keys(patch).length === 0) return paperclipError("paperclip_agent_input_invalid", 400);
  const updated = await updatePaperclipRow(PAPERCLIP_TABLES.agents, session.tenantSlug, id, patch);
  if (!updated.ok) return paperclipError("paperclip_agent_write_failed", 502);
  return paperclipJson({});
}

export async function DELETE(request: Request) {
  const session = await paperclipSession();
  if (!session) return paperclipError("not_authenticated", 401);
  const limit = await paperclipWriteLimit();
  if (!limit.ok) return paperclipError("runtime_limit_unavailable", 503);
  if (!limit.allowed) return paperclipError("runtime_rate_limited", 429);
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!UUID_RE.test(id)) return paperclipError("paperclip_agent_input_invalid", 400);
  const removed = await deletePaperclipRow(PAPERCLIP_TABLES.agents, session.tenantSlug, id);
  if (!removed.ok) return paperclipError("paperclip_agent_delete_failed", 502);
  await recordClientAudit("paperclip.agent_deleted", {});
  return paperclipJson({});
}
