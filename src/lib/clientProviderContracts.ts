export type ClientProviderProtocol = "openai" | "anthropic" | "gemini";
export type ClientProviderToolMode = "none" | "reviewed-plan";

export type ClientProviderContract = {
  protocol: ClientProviderProtocol;
  workspace: "tenant-records" | "tenant-workflow" | "tenant-code-plan" | "tenant-media";
  toolMode: ClientProviderToolMode;
  maxPromptChars: number;
  maxHistoryMessages: number;
  maxOutputTokens: number;
  attribution: "none" | "openrouter";
};

export const CLIENT_REVIEWED_PLAN_TOOL = "propose_reviewed_plan";

const REVIEWED_PLAN_PROPERTIES = {
  summary: { type: "string", description: "A concise summary of the proposed work, without secrets or external actions." },
  steps: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", description: "One bounded work item." },
        rationale: { type: "string", description: "Why this work item is needed." },
        owner: { type: "string", description: "A role or tenant member label, never a credential." },
      },
      required: ["title"],
    },
  },
};

const REVIEWED_PLAN_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: REVIEWED_PLAN_PROPERTIES,
  required: ["summary", "steps"],
};

const GEMINI_FUNCTION_SCHEMA_FIELDS = new Set(["type", "format", "description", "nullable", "properties", "items", "enum", "required"]);

function toGeminiFunctionSchema(value: unknown, parentKey = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => toGeminiFunctionSchema(item));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (parentKey !== "properties" && !GEMINI_FUNCTION_SCHEMA_FIELDS.has(key)) continue;
    output[key] = toGeminiFunctionSchema(item, key);
  }
  return output;
}

const CONTRACTS: Record<string, ClientProviderContract> = {
  anthropic: { protocol: "anthropic", workspace: "tenant-records", toolMode: "none", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  openai: { protocol: "openai", workspace: "tenant-records", toolMode: "none", maxPromptChars: 20000, maxHistoryMessages: 16, maxOutputTokens: 4096, attribution: "none" },
  codex: { protocol: "openai", workspace: "tenant-code-plan", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 10, maxOutputTokens: 4096, attribution: "none" },
  openrouter: { protocol: "openai", workspace: "tenant-workflow", toolMode: "none", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 3072, attribution: "openrouter" },
  openclaw: { protocol: "openai", workspace: "tenant-workflow", toolMode: "reviewed-plan", maxPromptChars: 14000, maxHistoryMessages: 8, maxOutputTokens: 3072, attribution: "openrouter" },
  hermes: { protocol: "openai", workspace: "tenant-workflow", toolMode: "reviewed-plan", maxPromptChars: 14000, maxHistoryMessages: 8, maxOutputTokens: 3072, attribution: "openrouter" },
  freeclaude: { protocol: "openai", workspace: "tenant-records", toolMode: "none", maxPromptChars: 12000, maxHistoryMessages: 8, maxOutputTokens: 2048, attribution: "openrouter" },
  fusion: { protocol: "openai", workspace: "tenant-workflow", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 10, maxOutputTokens: 3072, attribution: "openrouter" },
  groq: { protocol: "openai", workspace: "tenant-workflow", toolMode: "none", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 3072, attribution: "none" },
  moonshot: { protocol: "openai", workspace: "tenant-code-plan", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  kimi: { protocol: "openai", workspace: "tenant-code-plan", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  glm: { protocol: "openai", workspace: "tenant-code-plan", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  "glm-code": { protocol: "openai", workspace: "tenant-code-plan", toolMode: "reviewed-plan", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  xai: { protocol: "openai", workspace: "tenant-records", toolMode: "none", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 3072, attribution: "none" },
  grok: { protocol: "openai", workspace: "tenant-records", toolMode: "none", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 3072, attribution: "none" },
  sakana: { protocol: "openai", workspace: "tenant-workflow", toolMode: "reviewed-plan", maxPromptChars: 14000, maxHistoryMessages: 8, maxOutputTokens: 3072, attribution: "none" },
  gemini: { protocol: "gemini", workspace: "tenant-records", toolMode: "none", maxPromptChars: 16000, maxHistoryMessages: 12, maxOutputTokens: 4096, attribution: "none" },
  antigravity: { protocol: "gemini", workspace: "tenant-workflow", toolMode: "reviewed-plan", maxPromptChars: 14000, maxHistoryMessages: 8, maxOutputTokens: 4096, attribution: "none" },
};

export function clientProviderContract(provider: string) {
  return CONTRACTS[provider.trim().toLowerCase()] ?? null;
}

export function clientProviderContractNames() {
  return Object.keys(CONTRACTS);
}

export function clientProviderAttributionHeaders(provider: string) {
  const contract = clientProviderContract(provider);
  if (contract?.attribution !== "openrouter") return {};
  const referer = process.env.CLIENT_RUNTIME_BASE_URL?.trim();
  return {
    ...(referer ? { "HTTP-Referer": referer } : {}),
    "X-Title": "Veloce Client Runtime",
  };
}

export function clientProviderToolPayload(provider: string) {
  const contract = clientProviderContract(provider);
  if (!contract || contract.toolMode !== "reviewed-plan") return {};
  if (contract.protocol === "anthropic") {
    return {
      tools: [{ name: CLIENT_REVIEWED_PLAN_TOOL, description: "Propose a bounded plan for human review. This tool cannot execute work or access external systems.", input_schema: REVIEWED_PLAN_PARAMETERS }],
      tool_choice: { type: "tool", name: CLIENT_REVIEWED_PLAN_TOOL },
    };
  }
  if (contract.protocol === "gemini") {
    return {
      tools: [{ functionDeclarations: [{ name: CLIENT_REVIEWED_PLAN_TOOL, description: "Propose a bounded plan for human review. This tool cannot execute work or access external systems.", parameters: toGeminiFunctionSchema(REVIEWED_PLAN_PARAMETERS) }] }],
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [CLIENT_REVIEWED_PLAN_TOOL] } },
    };
  }
  return {
    tools: [{ type: "function", function: { name: CLIENT_REVIEWED_PLAN_TOOL, description: "Propose a bounded plan for human review. This tool cannot execute work or access external systems.", parameters: REVIEWED_PLAN_PARAMETERS } }],
    tool_choice: { type: "function", function: { name: CLIENT_REVIEWED_PLAN_TOOL } },
  };
}

export type ClientReviewedPlanStep = { title: string; rationale?: string; owner?: string };

export type ClientReviewedPlan = {
  summary: string;
  steps: ClientReviewedPlanStep[];
  approvalRequired: true;
};

export type ClientReviewedPlanEnvelope = {
  type: "reviewed_plan";
  tool: typeof CLIENT_REVIEWED_PLAN_TOOL;
  plan: ClientReviewedPlan;
};

export function normalizeClientReviewedPlan(value: unknown): ClientReviewedPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.summary !== "string" || input.summary.trim().length < 1) return null;
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 8) return null;
  // Built with a loop rather than `.map` + `.some(step => step === null)` so the
  // element type narrows. The previous form left `null` in the inferred type,
  // which every consumer then had to defend against for a case that cannot occur.
  const steps: ClientReviewedPlanStep[] = [];
  for (const step of input.steps) {
    if (!step || typeof step !== "object" || Array.isArray(step)) return null;
    const item = step as Record<string, unknown>;
    if (typeof item.title !== "string" || item.title.trim().length < 1) return null;
    steps.push({
      title: item.title.trim().slice(0, 240),
      ...(typeof item.rationale === "string" && item.rationale.trim() ? { rationale: item.rationale.trim().slice(0, 600) } : {}),
      ...(typeof item.owner === "string" && item.owner.trim() ? { owner: item.owner.trim().slice(0, 120) } : {}),
    });
  }
  return {
    summary: input.summary.trim().slice(0, 2_000),
    steps,
    approvalRequired: true,
  };
}

export function serializeClientReviewedPlan(value: unknown) {
  const plan = normalizeClientReviewedPlan(value);
  return plan ? JSON.stringify({ type: "reviewed_plan", tool: CLIENT_REVIEWED_PLAN_TOOL, plan }) : null;
}

/**
 * The inverse of `serializeClientReviewedPlan`. Lives here, beside the
 * serializer, so the envelope shape is asserted in exactly one place — the chat
 * UI and the workspace artifact path both call this rather than each hand-rolling
 * a `JSON.parse` guard.
 *
 * Fails closed on anything that is not a well-formed envelope. That matters
 * because `safeClientProviderOutput` may already have replaced the provider
 * output with a withheld-content notice, which is not JSON at all.
 */
export function parseClientReviewedPlan(content: string): ClientReviewedPlanEnvelope | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown; tool?: unknown; plan?: unknown };
    if (parsed?.type !== "reviewed_plan" || parsed?.tool !== CLIENT_REVIEWED_PLAN_TOOL) return null;
    // Re-normalise rather than trusting the parsed shape: this string may have
    // round-tripped through storage since it was produced.
    const plan = normalizeClientReviewedPlan(parsed.plan);
    return plan ? { type: "reviewed_plan", tool: CLIENT_REVIEWED_PLAN_TOOL, plan } : null;
  } catch {
    return null;
  }
}

/**
 * Renders a reviewed plan as markdown, mirroring what `ReviewedPlanCard` shows
 * in the chat UI so the stored artifact and the on-screen card read as the same
 * object.
 *
 * The approval line is not decoration. Once the JSON envelope is discarded, it
 * is the only remaining trace that this is a proposal awaiting review rather
 * than finished work.
 */
export function reviewedPlanMarkdown(plan: ClientReviewedPlan) {
  const steps = plan.steps.map((step, index) => {
    const lines = [`${index + 1}. **${step.title}**`];
    if (step.owner) lines.push(`   - Owner: ${step.owner}`);
    if (step.rationale) lines.push(`   - ${step.rationale}`);
    return lines.join("\n");
  });
  return [
    "# Reviewed plan",
    "**Human approval required.** This was produced through the reviewed-plan tool boundary. It is a proposal, not completed work, and no external action has been taken.",
    "## Summary",
    plan.summary,
    "## Steps",
    steps.join("\n\n"),
  ].join("\n\n");
}
