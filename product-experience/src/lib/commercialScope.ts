export const BASE_PACKAGE_ID = "platform" as const;
export const BASE_SETUP_USD = 2_500;
export const BASE_MONTHLY_USD = 1_250;
export const BASE_SEAT_LIMIT = 5;

export const CORE_CAPABILITIES = [
  "tenant-data",
  "artifacts",
  "orchestration",
  "knowledge",
  "delivery",
  "quality",
  "text-agents",
] as const;

export type CredentialModel = "client_owned" | "managed_allowance" | "oauth";
export type ProviderUsagePreference = "byok" | "managed_credits" | "both";
export type MediaRequirement = "none" | "image" | "video" | "music" | "full_media";
export type SupportLevel = "standard" | "priority" | "dedicated";
export type ManagedServiceNeed = "self_directed" | "strategy" | "content" | "growth" | "full_operations";

export interface CommercialScopeInputs {
  seatCount: number;
  brandCount: number;
  workflowCount: number;
  integrations: string[];
  capabilityAreas: string[];
  mediaRequirement: MediaRequirement;
  externalActions: boolean;
  knowledgeMigration: boolean;
  supportLevel: SupportLevel;
  managedServiceNeed: ManagedServiceNeed;
  credentialModel: CredentialModel;
  providerUsagePreference: ProviderUsagePreference;
  providerCreditBudgetUsd: number | null;
  retentionDays: number | null;
  approvalRule: string;
}

export interface CommercialScopeRecommendation {
  version: "commercial-scope-v1";
  packageId: typeof BASE_PACKAGE_ID;
  complexity: "standard" | "expanded" | "custom";
  complexityScore: number;
  flags: string[];
  addOns: Array<{ id: string; label: string; reason: string }>;
  setupRangeUsd: { min: number; max: number };
  monthlyRangeUsd: { min: number; max: number };
  providerCredits: {
    mode: ProviderUsagePreference;
    requestedMonthlyBudgetUsd: number | null;
    includedInPlatformFee: false;
  };
  requiredCapabilities: string[];
  approvalRequired: true;
}

export type CommercialScopeStatus = "recommended" | "approved" | "rejected" | "superseded";

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 30);
  return String(value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function parseUsd(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100_000_000 ? Math.round(parsed) : null;
}

export function normalizeCommercialScopeInputs(input: Partial<CommercialScopeInputs> | Record<string, unknown>): CommercialScopeInputs {
  const source = input as Record<string, unknown>;
  const mediaRequirement = ["none", "image", "video", "music", "full_media"].includes(String(source.mediaRequirement))
    ? String(source.mediaRequirement) as MediaRequirement
    : "none";
  const supportLevel = ["standard", "priority", "dedicated"].includes(String(source.supportLevel))
    ? String(source.supportLevel) as SupportLevel
    : "standard";
  const managedServiceNeed = ["self_directed", "strategy", "content", "growth", "full_operations"].includes(String(source.managedServiceNeed))
    ? String(source.managedServiceNeed) as ManagedServiceNeed
    : "self_directed";
  const credentialModel = ["client_owned", "managed_allowance", "oauth"].includes(String(source.credentialModel))
    ? String(source.credentialModel) as CredentialModel
    : "client_owned";
  const providerUsagePreference = ["byok", "managed_credits", "both"].includes(String(source.providerUsagePreference))
    ? String(source.providerUsagePreference) as ProviderUsagePreference
    : credentialModel === "managed_allowance" ? "managed_credits" : "byok";

  return {
    seatCount: Math.min(500, positiveInteger(source.seatCount, 1)),
    brandCount: Math.min(100, positiveInteger(source.brandCount, 1)),
    workflowCount: Math.min(500, positiveInteger(source.workflowCount, 1)),
    integrations: cleanList(source.integrations),
    capabilityAreas: cleanList(source.capabilityAreas).map((item) => item.toLowerCase()),
    mediaRequirement,
    externalActions: source.externalActions === true || String(source.externalActions).toLowerCase() === "true" || String(source.externalActions) === "on",
    knowledgeMigration: source.knowledgeMigration === true || String(source.knowledgeMigration).toLowerCase() === "true" || String(source.knowledgeMigration) === "on",
    supportLevel,
    managedServiceNeed,
    credentialModel,
    providerUsagePreference,
    providerCreditBudgetUsd: parseUsd(source.providerCreditBudgetUsd ?? source.monthlyBudget),
    retentionDays: parseUsd(source.retentionDays),
    approvalRule: String(source.approvalRule || "approve_external_actions").trim().slice(0, 120),
  };
}

export function recommendCommercialScope(input: Partial<CommercialScopeInputs> | Record<string, unknown>): CommercialScopeRecommendation {
  const normalized = normalizeCommercialScopeInputs(input);
  const flags: string[] = [];
  const addOns: CommercialScopeRecommendation["addOns"] = [];
  const capabilities = new Set<string>(CORE_CAPABILITIES);
  let score = 0;

  if (normalized.seatCount > BASE_SEAT_LIMIT) {
    score += 1;
    flags.push("additional_seats");
    addOns.push({ id: "additional-capacity", label: "Additional tenant capacity", reason: `More than ${BASE_SEAT_LIMIT} named seats requested.` });
  }
  if (normalized.brandCount > 1) {
    score += 1;
    flags.push("multiple_brands");
    addOns.push({ id: "multi-brand", label: "Multi-brand operations", reason: "More than one brand or business unit requires separate operating context." });
  }
  if (normalized.workflowCount > 3) {
    score += 2;
    flags.push("workflow_complexity");
    addOns.push({ id: "advanced-automation", label: "Advanced workflow automation", reason: "More than three initial workflows require additional design and acceptance work." });
  }
  if (normalized.integrations.length > 0) {
    addOns.push({ id: "integrations", label: "External integrations", reason: `${normalized.integrations.length} integration${normalized.integrations.length === 1 ? "" : "s"} requested.` });
    capabilities.add("delivery-actions");
    if (normalized.integrations.length > 2) {
      score += 2;
      flags.push("integration_complexity");
    }
  }
  if (normalized.capabilityAreas.some((area) => ["growth", "seo", "lead_generation", "leads"].includes(area))) {
    addOns.push({ id: "growth-operations", label: "Growth operations", reason: "SEO, lead-generation, or growth workflows require separate adapters and approval boundaries." });
    capabilities.add("seo-research");
  }
  if (normalized.capabilityAreas.some((area) => ["creative", "content", "media", "design"].includes(area))) {
    addOns.push({ id: "creative-production", label: "Creative production", reason: "Content and creative delivery requires artifact, media, and provider controls." });
    capabilities.add("web-studio");
    capabilities.add("design-intelligence");
  }
  if (normalized.mediaRequirement !== "none") {
    score += 2;
    flags.push("media_generation");
    if (!addOns.some((item) => item.id === "creative-production")) addOns.push({ id: "creative-production", label: "Creative production", reason: "Media generation requires output storage, provider health, and budget controls." });
    capabilities.add("media");
  }
  if (normalized.externalActions) {
    score += 1;
    flags.push("external_actions");
    addOns.push({ id: "external-delivery", label: "External delivery", reason: "Publishing, outreach, or paid actions require named approval and destination controls." });
    capabilities.add("delivery-actions");
  }
  if (normalized.knowledgeMigration) {
    score += 1;
    flags.push("knowledge_migration");
    addOns.push({ id: "knowledge-migration", label: "Knowledge migration", reason: "Existing knowledge and operating context require migration, validation, and export evidence." });
  }
  if (normalized.supportLevel !== "standard") {
    score += 1;
    flags.push("support_scope");
    addOns.push({ id: "priority-support", label: "Priority support", reason: `${normalized.supportLevel} support was requested.` });
  }
  if (normalized.managedServiceNeed !== "self_directed") {
    score += 2;
    flags.push("managed_service");
    addOns.push({ id: "managed-operations", label: "Managed operations", reason: "Strategy, content, growth, or full operations require a separate service scope and owner." });
  }

  const complexity = score === 0 ? "standard" : score <= 4 ? "expanded" : "custom";
  const setupRangeUsd = complexity === "standard"
    ? { min: BASE_SETUP_USD, max: BASE_SETUP_USD }
    : complexity === "expanded"
      ? { min: 4_000, max: 7_500 }
      : { min: 10_000, max: 25_000 };
  const monthlyRangeUsd = complexity === "standard"
    ? { min: BASE_MONTHLY_USD, max: BASE_MONTHLY_USD }
    : complexity === "expanded"
      ? { min: 1_750, max: 3_500 }
      : { min: 3_500, max: 8_000 };

  return {
    version: "commercial-scope-v1",
    packageId: BASE_PACKAGE_ID,
    complexity,
    complexityScore: score,
    flags: [...new Set(flags)],
    addOns: addOns.filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index),
    setupRangeUsd,
    monthlyRangeUsd,
    providerCredits: {
      mode: normalized.providerUsagePreference,
      requestedMonthlyBudgetUsd: normalized.providerCreditBudgetUsd,
      includedInPlatformFee: false,
    },
    requiredCapabilities: [...capabilities],
    approvalRequired: true,
  };
}

export function applyCommercialScopeToManifest<T extends Record<string, unknown>>(manifest: T, input: Partial<CommercialScopeInputs> | Record<string, unknown>) {
  const normalized = normalizeCommercialScopeInputs(input);
  const recommendation = recommendCommercialScope(normalized);
  const currentCapabilities = Array.isArray(manifest.enabledCapabilities) ? manifest.enabledCapabilities.map(String) : [];
  const budget = manifest.budget && typeof manifest.budget === "object" && !Array.isArray(manifest.budget) ? manifest.budget as Record<string, unknown> : {};
  const retention = manifest.retention && typeof manifest.retention === "object" && !Array.isArray(manifest.retention) ? manifest.retention as Record<string, unknown> : {};
  const mergedCapabilities = [...new Set([...currentCapabilities, ...recommendation.requiredCapabilities])];

  return {
    ...manifest,
    commercialScope: {
      version: recommendation.version,
      packageId: recommendation.packageId,
      complexity: recommendation.complexity,
      addOns: recommendation.addOns.map((item) => item.id),
      providerUsage: recommendation.providerCredits.mode,
      providerCreditsIncluded: false,
    },
    enabledCapabilities: mergedCapabilities,
    approvalPolicy: normalized.approvalRule || manifest.approvalPolicy || "approve_external_actions",
    budget: {
      ...budget,
      ...(normalized.providerCreditBudgetUsd !== null && !budget.monthlyCap ? { monthlyCap: String(normalized.providerCreditBudgetUsd) } : {}),
    },
    retention: {
      ...retention,
      ...(normalized.retentionDays !== null ? { days: normalized.retentionDays } : {}),
    },
  };
}
