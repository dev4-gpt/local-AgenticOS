import { CAPABILITY_CONTRACT_VERSION, isValidCapabilityTenantSlug } from "@/lib/capabilityContracts";

export interface ProviderRoutePolicy {
  tenantSlug: string;
  approvedProviders: readonly string[];
  fallbackOrder: readonly string[];
  maxBudgetMicros: number;
  allowCompression: boolean;
}

export interface ProviderRouteDecision {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tenantSlug: string;
  requestId: string;
  selectedProvider: string;
  attemptedProviders: readonly string[];
  reason: "primary" | "fallback" | "policy_rejection" | "budget_rejection";
  budgetMicros: number;
}

export interface ResumableWorktreeRequest {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tenantSlug: string;
  runId: string;
  goal: string;
  worktreeRef: string;
  maxTokens: number;
  maxMinutes: number;
  approval: "pending" | "approved" | "rejected";
}

export interface SecurityAssessmentRequest {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tenantSlug: string;
  target: string;
  scope: readonly string[];
  maxMinutes: number;
  budgetMicros: number;
  approval: "pending" | "approved" | "rejected";
}

export interface VoiceRequest {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tenantSlug: string;
  text: string;
  voiceId: string;
  consentRecordId: string;
  storage: "private-artifact";
}

export interface CommunicationRequest {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tenantSlug: string;
  provider: "infobip" | "explee";
  recipients: readonly string[];
  content: string;
  consentRecordId: string;
  approval: "pending" | "approved" | "rejected";
  send: false;
}

export function chooseProviderRoute(input: { requestId: string; policy: ProviderRoutePolicy; estimatedCostMicros: number; failedProviders?: readonly string[] }): ProviderRouteDecision | null {
  const failed = new Set(input.failedProviders ?? []);
  const candidates = input.policy.fallbackOrder.filter((provider) => input.policy.approvedProviders.includes(provider) && !failed.has(provider));
  if (!isValidCapabilityTenantSlug(input.policy.tenantSlug) || !candidates.length) return null;
  if (!Number.isSafeInteger(input.estimatedCostMicros) || input.estimatedCostMicros < 0 || input.estimatedCostMicros > input.policy.maxBudgetMicros) {
    return {
      contractVersion: CAPABILITY_CONTRACT_VERSION,
      tenantSlug: input.policy.tenantSlug,
      requestId: input.requestId,
      selectedProvider: "",
      attemptedProviders: [],
      reason: "budget_rejection",
      budgetMicros: Math.max(0, input.estimatedCostMicros),
    };
  }
  return {
    contractVersion: CAPABILITY_CONTRACT_VERSION,
    tenantSlug: input.policy.tenantSlug,
    requestId: input.requestId,
    selectedProvider: candidates[0],
    attemptedProviders: candidates,
    reason: failed.size ? "fallback" : "primary",
    budgetMicros: input.estimatedCostMicros,
  };
}

export function validateResumableWorktreeRequest(input: Partial<ResumableWorktreeRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.runId?.trim() || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,99}$/.test(input.runId)) errors.push("runId is invalid");
  if (!input.goal?.trim() || input.goal.length > 10_000) errors.push("goal must contain 1 to 10000 characters");
  if (!input.worktreeRef?.trim() || input.worktreeRef.includes("..") || input.worktreeRef.startsWith("/")) errors.push("worktreeRef must be a bounded relative reference");
  if (!Number.isInteger(input.maxTokens) || (input.maxTokens ?? 0) < 1 || (input.maxTokens ?? 0) > 2_000_000) errors.push("maxTokens is invalid");
  if (!Number.isInteger(input.maxMinutes) || (input.maxMinutes ?? 0) < 1 || (input.maxMinutes ?? 0) > 1_440) errors.push("maxMinutes is invalid");
  if (!(["pending", "approved", "rejected"] as readonly string[]).includes(input.approval ?? "")) errors.push("approval is invalid");
  return errors;
}

export function validateSecurityAssessmentRequest(input: Partial<SecurityAssessmentRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.target || !/^https:\/\/(?:staging\.|test\.)[a-z0-9.-]+(?:\/|$)/i.test(input.target)) errors.push("target must be an approved staging origin");
  if (!Array.isArray(input.scope) || input.scope.length < 1 || input.scope.length > 20 || input.scope.some((item) => typeof item !== "string" || !/^[a-z0-9:_-]{1,80}$/i.test(item))) errors.push("scope is invalid");
  if (!Number.isInteger(input.maxMinutes) || (input.maxMinutes ?? 0) < 1 || (input.maxMinutes ?? 0) > 120) errors.push("maxMinutes is invalid");
  if (!Number.isSafeInteger(input.budgetMicros) || (input.budgetMicros ?? -1) < 0) errors.push("budgetMicros is invalid");
  if (input.approval !== "approved") errors.push("security assessment requires approval");
  return errors;
}

export function validateVoiceRequest(input: Partial<VoiceRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.text?.trim() || input.text.length > 10_000) errors.push("text must contain 1 to 10000 characters");
  if (!input.voiceId || !/^[A-Za-z0-9_-]{8,80}$/.test(input.voiceId)) errors.push("voiceId is invalid");
  if (!input.consentRecordId?.trim()) errors.push("consentRecordId is required");
  if (input.storage !== "private-artifact") errors.push("voice output must use private artifact storage");
  return errors;
}

export function validateCommunicationRequest(input: Partial<CommunicationRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (input.provider !== "infobip" && input.provider !== "explee") errors.push("provider is invalid");
  if (!Array.isArray(input.recipients) || input.recipients.length < 1 || input.recipients.length > 100) errors.push("recipients are invalid");
  if (!input.content?.trim() || input.content.length > 10_000) errors.push("content must contain 1 to 10000 characters");
  if (!input.consentRecordId?.trim()) errors.push("consentRecordId is required");
  if (input.approval !== "approved") errors.push("communication requires approval");
  if (input.send !== false) errors.push("communication requests cannot send automatically");
  return errors;
}
