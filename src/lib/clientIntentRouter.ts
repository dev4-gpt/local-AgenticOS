import { createHash } from "node:crypto";
import type { ClientIntentSurface, ClientPlaybook } from "@/lib/clientPlaybooks";

export const CLIENT_INTENT_ROUTER_VERSION = "v96-intent-1" as const;
export const CLIENT_INTENT_CONFIDENCE_THRESHOLD = 0.78;

const GATED_INTENT_PATTERNS = [
  /\bsecurity\s+(?:assessment|scan|test|audit)\b/i,
  /\bpenetration\s+test(?:ing)?\b/i,
  /\bpen\s*test\b/i,
  /\b(?:scan|test)\s+(?:against|on)\s+(?:a\s+)?(?:staging|test)\s+target\b/i,
];

export interface IntentCandidate {
  playbook: ClientPlaybook;
  score: number;
  matchedIntents: readonly string[];
}

export interface IntentCandidates {
  candidates: readonly IntentCandidate[];
  deterministic: boolean;
  reason: string;
  clarificationQuestion: string | null;
}

export interface ClientIntentClassification {
  playbookId: string;
  confidence: number;
  reason: string;
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "this", "that", "from", "please", "help", "need", "want", "into"]);

function tokens(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function requestHash(request: string) {
  return createHash("sha256").update(request).digest("hex");
}

export function resolveClientIntent(input: {
  request: string;
  surface: ClientIntentSurface;
  tenantPolicy?: Record<string, unknown>;
  enabledCapabilities: readonly string[];
  availablePlaybooks: readonly ClientPlaybook[];
}): IntentCandidates {
  if (GATED_INTENT_PATTERNS.some((pattern) => pattern.test(input.request))) {
    return {
      candidates: [],
      deterministic: true,
      reason: "This request matches an intentionally gated capability and cannot be auto-dispatched.",
      clarificationQuestion: "Would you like a reviewable security plan instead? Live security execution requires an explicitly authorized target and approval.",
    };
  }
  const requestTokens = new Set(tokens(input.request));
  const enabled = new Set(input.enabledCapabilities);
  const scored = input.availablePlaybooks
    .filter((playbook) => playbook.supportedSurfaces.includes(input.surface))
    .filter((playbook) => playbook.eligibleCapabilities.some((capability) => enabled.has(capability)))
    .map((playbook) => {
      const matched = playbook.intents.filter((intent) => tokens(intent).some((token) => requestTokens.has(token)));
      const explicit = matched.length > 0 && playbook.intents.some((intent) => input.request.toLowerCase().includes(intent.toLowerCase()));
      return { playbook, score: matched.length + (explicit ? 2 : 0), matchedIntents: matched };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.playbook.id.localeCompare(right.playbook.id));

  if (scored.length === 0) {
    return { candidates: [], deterministic: false, reason: "No ready playbook matched the request.", clarificationQuestion: "What outcome should Veloce produce: research, a draft, a plan, a quality review, or a general answer?" };
  }
  const [first, second] = scored;
  const deterministic = first.score >= 2 && (!second || first.score > second.score);
  return {
    candidates: scored.slice(0, 5), deterministic,
    reason: deterministic ? `Matched the ${first.playbook.label.toLowerCase()} playbook from the request and surface.` : "More than one ready playbook could satisfy this request.",
    clarificationQuestion: deterministic ? null : "Should Veloce research this, draft an answer, create a workflow plan, or review quality?",
  };
}

export function buildIntentClassifierPrompt(request: string, surface: ClientIntentSurface, candidates: readonly IntentCandidate[]) {
  const catalog = candidates.map(({ playbook }) => ({ id: playbook.id, label: playbook.label, description: playbook.description, outputType: playbook.outputType, riskClass: playbook.riskClass })).slice(0, 8);
  return [
    "Classify this client request against the approved playbook catalog.",
    "Return JSON only with exactly: {\"playbookId\":string,\"confidence\":number,\"reason\":string}.",
    "Never invent IDs, capabilities, tools, roles, permissions, or actions. This is classification only; do not execute anything.",
    JSON.stringify({ surface, catalog, request: request.slice(0, 6000) }),
  ].join("\n");
}

export function parseClientIntentClassification(output: string, availablePlaybooks: readonly ClientPlaybook[]) {
  let parsed: unknown;
  try {
    const normalized = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    parsed = JSON.parse(normalized);
  } catch {
    return { ok: false as const, error: "classifier_json_invalid" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false as const, error: "classifier_schema_invalid" };
  const value = parsed as Record<string, unknown>;
  const playbookId = typeof value.playbookId === "string" ? value.playbookId : "";
  const confidence = typeof value.confidence === "number" ? value.confidence : Number.NaN;
  const reason = typeof value.reason === "string" ? value.reason.trim().slice(0, 500) : "";
  const playbook = availablePlaybooks.find((candidate) => candidate.id === playbookId);
  if (!playbook || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || !reason) return { ok: false as const, error: "classifier_result_not_approved" };
  if (confidence < CLIENT_INTENT_CONFIDENCE_THRESHOLD) return { ok: false as const, error: "classifier_confidence_low", confidence };
  return { ok: true as const, value: { playbookId, confidence, reason } satisfies ClientIntentClassification, playbook };
}

export function intentEvidence(input: { request: string; surface: string; candidateCount: number; classifierUsed: boolean; confidence?: number; compression?: Record<string, unknown> | null }) {
  return {
    routerVersion: CLIENT_INTENT_ROUTER_VERSION,
    requestHash: requestHash(input.request),
    requestChars: input.request.length,
    surface: input.surface,
    candidateCount: input.candidateCount,
    classifierUsed: input.classifierUsed,
    ...(typeof input.confidence === "number" ? { confidence: input.confidence } : {}),
    ...(input.compression ? { compression: input.compression } : {}),
  };
}
