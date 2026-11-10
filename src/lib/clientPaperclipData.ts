// Server-side data access for the hosted Paperclip surfaces.
//
// Six route handlers share the same tenant guard, table reads, and
// schema-missing behaviour. Keeping that here stops each route from
// re-implementing the boundary, which is where isolation bugs come from.

import { NextResponse } from "next/server";
import { currentClientMember, currentClientUser } from "@/lib/clientAuth";
import { checkClientRuntimeRateLimit, clientRpc, deleteClientRecord, insertClientRecord, selectClientRecords, updateClientRecord } from "@/lib/clientDataPlane";
import { clientCapabilityEnabled } from "@/lib/clientRuntimePolicy";
import {
  normalizePaperclipAgent,
  normalizePaperclipCompany,
  normalizePaperclipIssue,
  normalizePaperclipProject,
  normalizePaperclipRun,
  paperclipDefaultPrefix,
  paperclipSchemaMissing,
  type PaperclipAgent,
  type PaperclipCompany,
  type PaperclipIssue,
  type PaperclipProject,
  type PaperclipRun,
} from "@/lib/clientPaperclipAdapter";

export const PAPERCLIP_TABLES = {
  companies: "client_paperclip_companies",
  projects: "client_paperclip_projects",
  agents: "client_paperclip_agents",
  issues: "client_paperclip_issues",
  comments: "client_paperclip_comments",
  runs: "client_paperclip_runs",
} as const;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PaperclipSession = { userId: string; tenantSlug: string };

/**
 * Paperclip is part of the orchestration lens, so it inherits that capability
 * gate. Membership plus an active session is the tenant boundary.
 */
export async function paperclipSession(): Promise<PaperclipSession | null> {
  const user = await currentClientUser();
  if (!user || !(await currentClientMember()) || !clientCapabilityEnabled("orchestration")) return null;
  const tenantSlug = process.env.CLIENT_SLUG?.trim();
  return tenantSlug ? { userId: user.id, tenantSlug } : null;
}

export function paperclipError(code: string, status: number) {
  return NextResponse.json({ ok: false, error: code }, {
    status,
    headers: {
      "cache-control": "private, no-store",
      ...(code === "runtime_rate_limited" ? { "Retry-After": "900" } : {}),
    },
  });
}

export function paperclipJson(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status, headers: { "cache-control": "private, no-store" } });
}

export async function paperclipReadLimit() {
  return checkClientRuntimeRateLimit("paperclip-read", 240, 900);
}

export async function paperclipWriteLimit() {
  return checkClientRuntimeRateLimit("paperclip-write", 60, 900);
}

type TableRead<T> = { ok: true; rows: T[] } | { ok: false; schemaMissing: boolean; status: number };

async function readTable<T>(table: string, tenantSlug: string, normalize: (row: Record<string, unknown>) => T, extra: Record<string, string> = {}): Promise<TableRead<T>> {
  const result = await selectClientRecords(table, {
    tenant_slug: `eq.${tenantSlug}`,
    retention_expires_at: `gt.${new Date().toISOString()}`,
    ...extra,
  });
  if (!result.ok) return { ok: false, schemaMissing: paperclipSchemaMissing(result.status), status: result.status };
  return { ok: true, rows: result.records.map(normalize) };
}

export function readPaperclipProjects(tenantSlug: string) {
  return readTable<PaperclipProject>(PAPERCLIP_TABLES.projects, tenantSlug, normalizePaperclipProject, { order: "created_at.asc", limit: "100" });
}

export function readPaperclipAgents(tenantSlug: string) {
  return readTable<PaperclipAgent>(PAPERCLIP_TABLES.agents, tenantSlug, normalizePaperclipAgent, { order: "created_at.asc", limit: "100" });
}

export function readPaperclipIssues(tenantSlug: string) {
  return readTable<PaperclipIssue>(PAPERCLIP_TABLES.issues, tenantSlug, normalizePaperclipIssue, { order: "created_at.desc", limit: "200" });
}

export function readPaperclipRuns(tenantSlug: string) {
  return readTable<PaperclipRun>(PAPERCLIP_TABLES.runs, tenantSlug, normalizePaperclipRun, { order: "created_at.desc", limit: "100" });
}

/**
 * Reads the tenant company, creating it on first authenticated visit. The image
 * never ships a seeded company, so the board belongs to whoever signs in.
 */
export async function ensurePaperclipCompany(tenantSlug: string): Promise<{ ok: true; company: PaperclipCompany } | { ok: false; schemaMissing: boolean; status: number }> {
  const fallbackName = process.env.CLIENT_NAME?.trim() || "Hosted Company";
  const prefix = paperclipDefaultPrefix(tenantSlug);
  const existing = await selectClientRecords(PAPERCLIP_TABLES.companies, { tenant_slug: `eq.${tenantSlug}`, limit: "1" });
  if (!existing.ok) return { ok: false, schemaMissing: paperclipSchemaMissing(existing.status), status: existing.status };
  if (existing.records[0]) return { ok: true, company: normalizePaperclipCompany(existing.records[0], fallbackName, prefix) };

  const created = await clientRpc("ensure_client_paperclip_company", { p_tenant_slug: tenantSlug, p_name: fallbackName, p_issue_prefix: prefix });
  if (!created.ok) return { ok: false, schemaMissing: paperclipSchemaMissing(created.status, created.value), status: created.status };
  const row = created.value && typeof created.value === "object" && !Array.isArray(created.value) ? created.value as Record<string, unknown> : null;
  return { ok: true, company: normalizePaperclipCompany(row, fallbackName, prefix) };
}

export async function allocatePaperclipIssue(input: {
  tenantSlug: string;
  title: string;
  description: string;
  priority: string;
  projectId: string | null;
  assigneeAgentId: string | null;
  labels: string[];
}) {
  const result = await clientRpc("allocate_client_paperclip_issue", {
    p_tenant_slug: input.tenantSlug,
    p_title: input.title,
    p_description: input.description,
    p_priority: input.priority,
    p_project_id: input.projectId,
    p_assignee_agent_id: input.assigneeAgentId,
    p_labels: input.labels,
  });
  if (!result.ok) return { ok: false as const, schemaMissing: paperclipSchemaMissing(result.status, result.value), status: result.status };
  const row = result.value && typeof result.value === "object" && !Array.isArray(result.value) ? result.value as Record<string, unknown> : null;
  if (!row) return { ok: false as const, schemaMissing: false, status: 502 };
  return { ok: true as const, issue: normalizePaperclipIssue(row) };
}

export function insertPaperclipRow(table: string, record: Record<string, unknown>) {
  return insertClientRecord(table, record);
}

export function updatePaperclipRow(table: string, tenantSlug: string, id: string, patch: Record<string, unknown>) {
  return updateClientRecord(table, {
    id: `eq.${id}`, tenant_slug: `eq.${tenantSlug}`, retention_expires_at: `gt.${new Date().toISOString()}`,
  }, { ...patch, updated_at: new Date().toISOString() });
}

export function deletePaperclipRow(table: string, tenantSlug: string, id: string) {
  return deleteClientRecord(table, { id: `eq.${id}`, tenant_slug: `eq.${tenantSlug}`, retention_expires_at: `gt.${new Date().toISOString()}` });
}

export async function readPaperclipIssue(tenantSlug: string, id: string) {
  const result = await selectClientRecords(PAPERCLIP_TABLES.issues, {
    tenant_slug: `eq.${tenantSlug}`, id: `eq.${id}`, retention_expires_at: `gt.${new Date().toISOString()}`, limit: "1",
  });
  if (!result.ok || !result.records[0]) return null;
  return normalizePaperclipIssue(result.records[0]);
}
