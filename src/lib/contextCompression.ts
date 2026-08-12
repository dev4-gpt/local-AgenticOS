import { createHash } from "node:crypto";

export const CONTEXT_COMPRESSION_POLICY_VERSION = "v96-context-compression-1" as const;

export type CompressibleProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ContextCompressionEvidence = {
  policyVersion: typeof CONTEXT_COMPRESSION_POLICY_VERSION;
  mode: "compressed" | "no-op" | "original-fallback";
  originalChars: number;
  compressedChars: number;
  compressionRatio: number;
  inputHash: string;
  preservedSegments: readonly string[];
  removedSegments: readonly string[];
};

export type ContextCompressionResult =
  | { ok: true; messages: readonly CompressibleProviderMessage[]; evidence: ContextCompressionEvidence }
  | { ok: false; error: "context_compression_input_invalid" | "context_compression_limit_exceeded"; messages: readonly CompressibleProviderMessage[]; evidence: ContextCompressionEvidence };

const URL_OR_CITATION = /https?:\/\/[^\s]+|\[[^\]]+\]\([^\)]+\)/i;
const CODE_FENCE = /```[\s\S]*?```/g;

/**
 * Compresses only repeated, non-authoritative context. The current user
 * request, system policy, code blocks, URLs, citations, and approval text are
 * retained verbatim. This is intentionally local and deterministic: upstream
 * Headroom is a provenance reference, not a runtime dependency.
 */
export function compressProviderContext(input: {
  messages: readonly CompressibleProviderMessage[];
  maxPromptChars: number;
  capability?: string | null;
  provider?: string | null;
}): ContextCompressionResult {
  const original = input.messages.map((message) => ({ role: message.role, content: message.content }));
  const originalChars = totalChars(original);
  const inputHash = hashMessages(original);
  const preserved = new Set<string>();
  const removed: string[] = [];

  if (!Number.isSafeInteger(input.maxPromptChars) || input.maxPromptChars < 1 || original.some((message) => !isValidMessage(message))) {
    return { ok: false, error: "context_compression_input_invalid", messages: original, evidence: evidence("original-fallback", originalChars, originalChars, inputHash, preserved, ["invalid-input"]) };
  }

  const currentUserIndex = [...original].map((message) => message.role).lastIndexOf("user");
  const seen = new Set<string>();
  const compressed: CompressibleProviderMessage[] = [];

  original.forEach((message, index) => {
    const authoritative = message.role === "system" || index === currentUserIndex;
    if (authoritative) {
      compressed.push(message);
      preserved.add(message.role === "system" ? "system-policy" : "current-user-request");
      if (CODE_FENCE.test(message.content)) preserved.add("code-fence");
      CODE_FENCE.lastIndex = 0;
      if (URL_OR_CITATION.test(message.content)) preserved.add("url-or-citation");
      return;
    }

    const normalized = normalizeContextText(message.content);
    if (!normalized) {
      removed.push("empty-context");
      return;
    }
    const key = `${message.role}:${normalized}`;
    if (seen.has(key)) {
      removed.push("duplicate-context");
      return;
    }
    seen.add(key);
    compressed.push({ role: message.role, content: normalized });
    if (normalized !== message.content) removed.push("redundant-whitespace");
    if (CODE_FENCE.test(message.content)) preserved.add("code-fence");
    CODE_FENCE.lastIndex = 0;
    if (URL_OR_CITATION.test(message.content)) preserved.add("url-or-citation");
  });

  const compressedChars = totalChars(compressed);
  const mode = compressedChars < originalChars ? "compressed" : "no-op";
  const resultEvidence = evidence(mode, originalChars, compressedChars, inputHash, preserved, removed);
  if (compressedChars <= input.maxPromptChars) return { ok: true, messages: compressed, evidence: resultEvidence };
  if (originalChars <= input.maxPromptChars) {
    return {
      ok: true,
      messages: original,
      evidence: evidence("original-fallback", originalChars, originalChars, inputHash, preserved, [...removed, "compressed-context-over-limit"]),
    };
  }
  return { ok: false, error: "context_compression_limit_exceeded", messages: original, evidence: resultEvidence };
}

function isValidMessage(message: CompressibleProviderMessage) {
  return Boolean(message && ["system", "user", "assistant"].includes(message.role) && typeof message.content === "string" && message.content.length <= 200_000);
}

function normalizeContextText(value: string) {
  const protectedBlocks: string[] = [];
  const withPlaceholders = value.replace(CODE_FENCE, (block) => {
    protectedBlocks.push(block);
    return `\u0000CODE_${protectedBlocks.length - 1}\u0000`;
  });
  const normalized = withPlaceholders
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
    .replace(/\u0000CODE_(\d+)\u0000/g, (_, index: string) => protectedBlocks[Number(index)] ?? "");
  return normalized;
}

function totalChars(messages: readonly CompressibleProviderMessage[]) {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

function hashMessages(messages: readonly CompressibleProviderMessage[]) {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
}

function evidence(
  mode: ContextCompressionEvidence["mode"],
  originalChars: number,
  compressedChars: number,
  inputHash: string,
  preserved: ReadonlySet<string>,
  removed: readonly string[],
): ContextCompressionEvidence {
  return {
    policyVersion: CONTEXT_COMPRESSION_POLICY_VERSION,
    mode,
    originalChars,
    compressedChars,
    compressionRatio: originalChars === 0 ? 1 : Number((compressedChars / originalChars).toFixed(4)),
    inputHash,
    preservedSegments: [...preserved].sort(),
    removedSegments: [...new Set(removed)].sort(),
  };
}
