import { expect, test } from "@playwright/test";
import { GROQ_STT_ENDPOINT, GROQ_STT_MAX_BYTES, GROQ_STT_MODEL, groqSpeechConfigured, transcribeWithGroq } from "../src/lib/groqSpeech";

test("Groq speech contract is bounded and uses the pinned turbo model", async () => {
  expect(GROQ_STT_ENDPOINT).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
  expect(GROQ_STT_MODEL).toBe("whisper-large-v3-turbo");
  expect(GROQ_STT_MAX_BYTES).toBe(25 * 1024 * 1024);

  const previousKey = process.env.GROQ_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GROQ_API_KEY = "test-groq-key";
  let seenAuth = "";
  globalThis.fetch = async (_input, init) => {
    seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    const form = init?.body as FormData;
    expect(form.get("model")).toBe(GROQ_STT_MODEL);
    expect(form.get("response_format")).toBe("json");
    expect(form.get("language")).toBe("en");
    return new Response(JSON.stringify({ text: "hello from groq", x_groq: { id: "req_test" } }), { status: 200 });
  };
  try {
    expect(groqSpeechConfigured()).toBe(true);
    const result = await transcribeWithGroq({ audio: Buffer.from("audio"), filename: "recording.webm", contentType: "audio/webm", language: "en" });
    expect(result).toEqual({ text: "hello from groq", requestId: "req_test", model: GROQ_STT_MODEL });
    expect(seenAuth).toBe("Bearer test-groq-key");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
  }
});

test("Groq speech fails closed without a server key", async () => {
  const previousKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    expect(groqSpeechConfigured()).toBe(false);
    await expect(transcribeWithGroq({ audio: Buffer.from("audio"), filename: "recording.webm", contentType: "audio/webm" })).rejects.toThrow("groq_not_configured");
  } finally {
    if (previousKey !== undefined) process.env.GROQ_API_KEY = previousKey;
  }
});
