import { createHash } from "node:crypto";
import { eccAdapter, ECC_REVISION } from "@/lib/eccCatalog";
import { eccInstructionRisk, eccSecretLike } from "@/lib/eccSafety";

export type EccEvidence = { reference: string; summary: string; sourceHash: string };
export type EccInput = { adapterId: string; brief: string; evidence: EccEvidence[]; contextBudgetBytes: number };
export type EccPolicy = { tenantSlug: string; enabled: boolean; role: string };
export const eccHash = (value: string) => createHash("sha256").update(value).digest("hex");

export function parseEccInput(value: unknown): EccInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["adapterId", "brief", "evidence", "contextBudgetBytes"].includes(key))) return null;
  if (typeof input.adapterId !== "string" || typeof input.brief !== "string" || !input.brief.trim() || input.brief.length > 8000) return null;
  const budget = input.contextBudgetBytes ?? 12000;
  if (!Number.isSafeInteger(budget) || Number(budget) < 256 || Number(budget) > 64000) return null;
  const rawEvidence = input.evidence ?? [];
  if (!Array.isArray(rawEvidence) || rawEvidence.length > 20) return null;
  const evidence: EccEvidence[] = [];
  const references = new Set<string>();
  for (const item of rawEvidence) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key => !["reference", "summary", "sourceHash"].includes(key))) return null;
    if (typeof item.reference !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9:._/#-]{0,199}$/.test(item.reference) || references.has(item.reference)
      || typeof item.summary !== "string" || !item.summary.trim() || item.summary.length > 2000
      || typeof item.sourceHash !== "string" || !/^[0-9a-f]{64}$/.test(item.sourceHash)) return null;
    references.add(item.reference); evidence.push({ reference: item.reference, summary: item.summary.trim(), sourceHash: item.sourceHash });
  }
  const result = { adapterId: input.adapterId, brief: input.brief.trim(), evidence, contextBudgetBytes: Number(budget) };
  if (eccSecretLike(JSON.stringify(result))) return null;
  return result;
}

export function runEccAdapter(value: unknown, policy: EccPolicy) {
  if (!policy.tenantSlug || !policy.enabled || !["owner", "admin", "member"].includes(policy.role)) return { ok: false as const, error: "ecc_execution_not_authorized" };
  const input = parseEccInput(value);
  if (!input) return { ok: false as const, error: "ecc_input_invalid" };
  const adapter = eccAdapter(input.adapterId);
  if (!adapter || adapter.externalInference || adapter.tools.length) return { ok: false as const, error: "ecc_adapter_unavailable" };
  const started = performance.now();
  const contextBytes = Buffer.byteLength(input.brief + input.evidence.map(item => item.summary).join("\n"), "utf8");
  const overBudget = contextBytes > input.contextBudgetBytes;
  const instructionRisk = eccInstructionRisk(JSON.stringify(input));
  const findings = [
    ...(input.evidence.length === 0 ? [{ code: "missing_evidence", detail: "No source references supplied; the underlying work has not been verified." }] : []),
    ...(overBudget ? [{ code: "context_budget_exceeded", detail: `${contextBytes} UTF-8 bytes exceeds the ${input.contextBudgetBytes}-byte budget; reduce context before provider execution.` }] : []),
    ...(instructionRisk ? [{ code: "untrusted_instruction_text", detail: "Instruction-like text remains quoted input. It does not change permissions or become an active lesson." }] : []),
  ];
  const artifact = {
    schemaVersion: 1, kind: adapter.artifactKind, adapterId: adapter.id, department: adapter.department,
    upstreamRevision: ECC_REVISION, componentId: adapter.componentId,
    brief: input.brief, evidence: input.evidence.map(item => ({ ...item, verification: "provided-unverified" as const })),
    context: { utf8Bytes: contextBytes, budgetBytes: input.contextBudgetBytes, overBudget, modelTokens: null },
    checklist: adapter.steps.map((step, index) => ({ id: `${adapter.id}-${index + 1}`, action: step, status: "awaiting-review" as const, evidenceReferences: input.evidence.map(item => item.reference) })),
    findings, reviewStatus: "review-required", underlyingWorkVerified: false, externalActionsExecuted: false,
  };
  const artifactHash = eccHash(JSON.stringify(artifact));
  const evaluation = {
    schemaVersion: 1, adapterId: adapter.id, artifactHash,
    checks: [
      { id: "artifact-contract", status: "passed" },
      { id: "source-evidence", status: input.evidence.length ? "unverified" : "missing" },
      { id: "context-budget", status: overBudget ? "failed" : "passed" },
      { id: "instruction-boundary", status: instructionRisk ? "review-required" : "passed" },
      { id: "semantic-correctness", status: "not-assessed" },
      { id: "deployment-acceptance", status: "not-assessed" },
    ],
    releaseReady: false, inferenceCalls: 0, providerCostMicros: 0, infrastructureCostMicros: null,
    runtimeMs: Math.max(0, performance.now() - started),
  };
  return { ok: true as const, artifact, artifactHash, inputHash: eccHash(JSON.stringify(input)), evaluation };
}
