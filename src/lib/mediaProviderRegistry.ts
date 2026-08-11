import { CAPABILITY_CONTRACT_VERSION, isValidCapabilityTenantSlug } from "@/lib/capabilityContracts";

export type MediaProviderKind = "image" | "video" | "audio";
export type MediaProviderApproval = "review-before-artifact" | "human-before-external-action";

export interface MediaProviderDescriptor {
  id: string;
  label: string;
  kind: MediaProviderKind;
  model: string;
  license: string;
  provenance: string;
  approval: MediaProviderApproval;
  enabledByDefault: false;
  supports: readonly string[];
}

export const MEDIA_PROVIDER_REGISTRY: readonly MediaProviderDescriptor[] = [
  { id: "openai-image", label: "OpenAI image", kind: "image", model: "gpt-image-1", license: "provider-terms", provenance: "Veloce approved adapter", approval: "review-before-artifact", enabledByDefault: false, supports: ["image-generation"] },
  { id: "heygen-video", label: "HeyGen video", kind: "video", model: "heygen-video", license: "provider-terms", provenance: "Veloce approved adapter", approval: "human-before-external-action", enabledByDefault: false, supports: ["avatar-video"] },
  { id: "elevenlabs-speech", label: "ElevenLabs speech", kind: "audio", model: "eleven-multilingual-v2", license: "provider-terms", provenance: "Veloce approved adapter", approval: "review-before-artifact", enabledByDefault: false, supports: ["speech"] },
  { id: "skyreels-v2", label: "SkyReels V2", kind: "video", model: "skyreels-v2", license: "pending-host-review", provenance: "future isolated GPU adapter", approval: "human-before-external-action", enabledByDefault: false, supports: ["video-generation"] },
];

export interface GovernedMediaRequest {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tenantSlug: string;
  requestId: string;
  providerId: string;
  artifactInputIds: readonly string[];
  prompt: string;
  budgetMicros: number;
  publication: "private-artifact" | "approved-destination";
}

export interface VisualQaRequest {
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tenantSlug: string;
  artifactId: string;
  maxFrames: number;
  maxRuntimeMs: number;
  detector: "supervision" | "contract-only";
}

export function validateMediaProviderDescriptor(input: Partial<MediaProviderDescriptor>) {
  const errors: string[] = [];
  if (!input.id || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.id)) errors.push("provider id is invalid");
  if (!input.label?.trim()) errors.push("provider label is required");
  if (!input.model?.trim()) errors.push("provider model is required");
  if (!input.license?.trim()) errors.push("provider license is required");
  if (!input.provenance?.trim()) errors.push("provider provenance is required");
  if (input.enabledByDefault !== false) errors.push("providers must be disabled by default");
  if (!Array.isArray(input.supports) || input.supports.length < 1) errors.push("provider supports at least one capability");
  return errors;
}

export function validateGovernedMediaRequest(input: Partial<GovernedMediaRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.requestId?.trim()) errors.push("requestId is required");
  if (!MEDIA_PROVIDER_REGISTRY.some((provider) => provider.id === input.providerId)) errors.push("provider is not registered");
  if (!Array.isArray(input.artifactInputIds) || input.artifactInputIds.some((id) => typeof id !== "string" || !id.trim())) errors.push("artifactInputIds must contain non-empty ids");
  if (!input.prompt?.trim() || input.prompt.length > 10_000) errors.push("prompt must contain 1 to 10000 characters");
  if (!Number.isSafeInteger(input.budgetMicros) || (input.budgetMicros ?? -1) < 0) errors.push("budgetMicros must be a non-negative safe integer");
  if (input.publication !== "private-artifact" && input.publication !== "approved-destination") errors.push("publication boundary is invalid");
  return errors;
}

export function validateVisualQaRequest(input: Partial<VisualQaRequest>) {
  const errors: string[] = [];
  if (input.contractVersion !== CAPABILITY_CONTRACT_VERSION) errors.push("contractVersion must be v96");
  if (!input.tenantSlug || !isValidCapabilityTenantSlug(input.tenantSlug)) errors.push("tenantSlug is invalid");
  if (!input.artifactId?.trim()) errors.push("artifactId is required");
  if (!Number.isInteger(input.maxFrames) || (input.maxFrames ?? 0) < 1 || (input.maxFrames ?? 0) > 120) errors.push("maxFrames must be between 1 and 120");
  if (!Number.isInteger(input.maxRuntimeMs) || (input.maxRuntimeMs ?? 0) < 100 || (input.maxRuntimeMs ?? 0) > 120_000) errors.push("maxRuntimeMs must be between 100 and 120000");
  if (input.detector !== "supervision" && input.detector !== "contract-only") errors.push("detector is invalid");
  return errors;
}
