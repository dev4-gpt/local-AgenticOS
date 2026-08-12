import { expect, test } from "@playwright/test";
import { compressProviderContext, CONTEXT_COMPRESSION_POLICY_VERSION } from "../src/lib/contextCompression";
import { estimateClientTextCostMicros, prepareClientProviderMessages, type ClientProviderMessage } from "../src/lib/clientProviderAdapter";

test("compression is deterministic and removes repeated context without changing the current request", () => {
  const input = {
    messages: [
      { role: "system" as const, content: "Follow the approval policy.\n\n\nNever publish without review." },
      { role: "assistant" as const, content: "Repeated research context.\n\n\n" },
      { role: "assistant" as const, content: "Repeated research context.\n\n\n" },
      { role: "user" as const, content: "Current request with https://example.com and [citation](https://example.com/source)." },
    ],
    maxPromptChars: 10_000,
    capability: "text-agents",
    provider: "openrouter",
  };
  const first = compressProviderContext(input);
  const second = compressProviderContext(input);
  expect(first).toEqual(second);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(first.evidence.policyVersion).toBe(CONTEXT_COMPRESSION_POLICY_VERSION);
  expect(first.evidence.mode).toBe("compressed");
  expect(first.evidence.removedSegments).toEqual(expect.arrayContaining(["duplicate-context", "redundant-whitespace"]));
  expect(first.messages.at(-1)?.content).toBe(input.messages.at(-1)?.content);
  expect(first.evidence.preservedSegments).toEqual(expect.arrayContaining(["system-policy", "current-user-request", "url-or-citation"]));
});

test("compression preserves fenced code and falls back instead of truncating", () => {
  const code = "```ts\nconst value = '  keep exact  ';\n```";
  const input = {
    messages: [
      { role: "assistant" as const, content: `Context\n\n${code}` },
      { role: "user" as const, content: "Do the reviewed change." },
    ],
    maxPromptChars: 10_000,
  };
  const result = compressProviderContext(input);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.messages[0].content).toContain(code);
  expect(result.evidence.preservedSegments).toContain("code-fence");

  const fallback = compressProviderContext({ messages: input.messages, maxPromptChars: 5 });
  expect(fallback.ok).toBe(false);
  expect(fallback.error).toBe("context_compression_limit_exceeded");
  expect(fallback.evidence.mode).toBe("no-op");
});

test("invalid messages fail closed and evidence contains no message content", () => {
  const result = compressProviderContext({
    messages: [{ role: "user" as const, content: "secret-like private content" }, { role: "system" as const, content: 3 as unknown as string }],
    maxPromptChars: 1_000,
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toBe("context_compression_input_invalid");
  expect(JSON.stringify(result.evidence)).not.toContain("secret-like private content");
});

test("the provider adapter compresses before its budget estimate", () => {
  const previousTraits = process.env.CLIENT_ENABLED_TRAITS;
  const previousPricing = process.env.CLIENT_MODEL_PRICING_JSON;
  process.env.CLIENT_ENABLED_TRAITS = "context-compression";
  process.env.CLIENT_MODEL_PRICING_JSON = JSON.stringify({ "openai/gpt-4o-mini": { inputMicrosPer1k: 100, outputMicrosPer1k: 0 } });
  try {
    const messages: ClientProviderMessage[] = [
      { role: "system", content: "Preserve policy." },
      { role: "assistant", content: "Repeated context that can be safely removed. ".repeat(12) },
      { role: "assistant", content: "Repeated context that can be safely removed. ".repeat(12) },
      { role: "user", content: "Current request." },
    ];
    const prepared = prepareClientProviderMessages({ provider: "openrouter", capability: "text-agents", messages });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const rawEstimate = estimateClientTextCostMicros("openai/gpt-4o-mini", messages, 256);
    const compressedEstimate = estimateClientTextCostMicros("openai/gpt-4o-mini", prepared.messages, 256);
    expect(prepared.compression?.compressedChars).toBeLessThan(prepared.compression?.originalChars ?? 0);
    expect(compressedEstimate).toBeLessThan(rawEstimate ?? Number.POSITIVE_INFINITY);
  } finally {
    if (previousTraits === undefined) delete process.env.CLIENT_ENABLED_TRAITS;
    else process.env.CLIENT_ENABLED_TRAITS = previousTraits;
    if (previousPricing === undefined) delete process.env.CLIENT_MODEL_PRICING_JSON;
    else process.env.CLIENT_MODEL_PRICING_JSON = previousPricing;
  }
});
