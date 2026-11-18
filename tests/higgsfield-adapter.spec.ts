import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { CLIENT_CREDENTIAL_OPTIONS } from "../src/lib/clientCredentialCatalog";
import { MEDIA_PROVIDER_REGISTRY, validateMediaProviderDescriptor } from "../src/lib/mediaProviderRegistry";
import { loadReviewModule } from "./helpers/load-review-module";

// Higgsfield (Phase 6, off by default). Endpoints and settings follow docs.higgsfield.ai as checked on 2026-10-21.
// Every key, id and URL below is made up inside this test; nothing reaches the network.
const catalog = loadReviewModule("src/lib/higgsfieldCatalog.ts", {});
const inputSafety = loadReviewModule("src/lib/clientInputSafety.ts", {});
const FAKE_KEY = "fakekeyid:fake-secret-value-0000";
const JOB_ID = "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff";

type Sent = { url: string; method: string; headers: Record<string, string>; body: string };
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function stubFetch(reply: (request: Sent) => Response): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = { url: String(input), method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers as HeadersInit).entries()), body: String(init?.body ?? "") };
    sent.push(request);
    return reply(request);
  }) as typeof fetch;
  return sent;
}

function adapter(options: { allowed?: boolean; key?: string | null } = {}) {
  return loadReviewModule("src/lib/clientMediaAdapter.ts", {
    "@/lib/clientExecutionCredential": { clientExecutionCredential: async (name: string) => name === "HIGGSFIELD_API_KEY" ? (options.key === undefined ? FAKE_KEY : options.key) : null },
    "@/lib/clientRuntimePolicy": { clientProviderEnabled: (name: string) => (options.allowed ?? true) && name === "HIGGSFIELD_API_KEY" },
    "@/lib/clientInputSafety": inputSafety,
    "@/lib/clientNetworkSafety": {
      isPrivateAddress: (host: string) => host === "localhost" || /^(10|127)\./.test(host) || /^192\.168\./.test(host),
      readBoundedResponseBytes: async (response: Response, max: number) => {
        const bytes = Buffer.from(await response.arrayBuffer());
        return bytes.length > max ? null : bytes;
      },
    },
    "@/lib/higgsfieldCatalog": catalog,
  });
}

test("each model sends its documented endpoint with defaults filled in and nothing undeclared", () => {
  expect(catalog.buildHiggsfieldRequest("seedance-2.5", "  Ocean waves at sunset  ")).toEqual({
    ok: true,
    model: catalog.higgsfieldModel("seedance-2.5"),
    endpoint: "bytedance/seedance-2.5/text-to-video",
    body: { prompt: "Ocean waves at sunset", duration: 5, resolution: "720p", aspect_ratio: "16:9", output_format: "mp4", generate_audio: true },
  });
  expect(catalog.buildHiggsfieldRequest("kling-3-standard", "A coastal road", { duration: 15, cfg_scale: 0.37, sound: "off" })).toMatchObject({
    ok: true, endpoint: "kling-video/v3.0/std/text-to-video", body: { duration: 15, cfg_scale: 0.37, sound: "off", aspect_ratio: "16:9" },
  });
  expect(catalog.buildHiggsfieldRequest("soul-2", "Editorial portrait", { batch_size: 4 })).toMatchObject({
    ok: true, endpoint: "higgsfield-ai/soul/v2/standard", body: { batch_size: 4, resolution: "720p", aspect_ratio: "1:1", enhance_prompt: false },
  });
  for (const model of catalog.HIGGSFIELD_MODELS) {
    expect(catalog.higgsfieldSubmitUrl(model)).toBe(`https://api.higgsfield.ai/${model.endpoint}`);
    expect(catalog.higgsfieldEstimateUrl(model)).toBe(`https://api.higgsfield.ai/estimate/${model.endpoint}`);
  }
});

test("unknown models, bad prompts and settings outside the declared values are refused", () => {
  const refused = (model: unknown, prompt: unknown, settings?: unknown) => catalog.buildHiggsfieldRequest(model, prompt, settings).error;
  expect(refused("kling-3-pro", "x")).toBe("higgsfield_model_unknown");
  expect(refused("../seedance-2.5", "x")).toBe("higgsfield_model_unknown");
  expect(refused("seedance-2.5", "   ")).toBe("higgsfield_prompt_invalid");
  expect(refused("seedance-2.5", "x".repeat(2_501))).toBe("higgsfield_prompt_invalid");
  expect(refused("seedance-2.5", 42)).toBe("higgsfield_prompt_invalid");
  expect(refused("seedance-2.5", "x", [])).toBe("higgsfield_settings_invalid");
  expect(refused("seedance-2.5", "x", { webhook_url: "https://example.invalid" })).toBe("higgsfield_setting_unknown");
  expect(refused("seedance-2.5", "x", { bitrate_mode: "high" })).toBe("higgsfield_setting_unknown");
  expect(refused("seedance-2.5", "x", { duration: 31 })).toBe("higgsfield_setting_invalid");
  expect(refused("seedance-2.5", "x", { duration: 4.5 })).toBe("higgsfield_setting_invalid");
  expect(refused("seedance-2.5", "x", { duration: "5" })).toBe("higgsfield_setting_invalid");
  expect(refused("seedance-2.5", "x", { resolution: "4k" })).toBe("higgsfield_setting_invalid");
  expect(refused("seedance-2.5", "x", { generate_audio: "yes" })).toBe("higgsfield_setting_invalid");
  expect(refused("kling-3-standard", "x", { cfg_scale: 0.505 })).toBe("higgsfield_setting_invalid");
  expect(refused("kling-3-standard", "x", { duration: 2 })).toBe("higgsfield_setting_invalid");
  expect(refused("soul-2", "x", { batch_size: 2 })).toBe("higgsfield_setting_invalid");
  expect(refused("soul-2", "x", { resolution: Number.NaN })).toBe("higgsfield_setting_invalid");
});

test("credentials and request ids have one accepted shape", () => {
  expect(catalog.isHiggsfieldCredential(FAKE_KEY)).toBe(true);
  for (const bad of ["no-colon-here-at-all", "a:short", ":missing-id-part", "id:has space inside", "id:one:two-colons", `id:${"x".repeat(600)}`, null, 7]) {
    expect(catalog.isHiggsfieldCredential(bad)).toBe(false);
  }
  expect(catalog.isHiggsfieldRequestId(JOB_ID)).toBe(true);
  for (const bad of ["../requests", "abc", `${JOB_ID}/../../x`, ""]) expect(catalog.isHiggsfieldRequestId(bad)).toBe(false);
  expect(catalog.higgsfieldStatusUrl(JOB_ID)).toBe(`https://api.higgsfield.ai/requests/${JOB_ID}/status`);
  expect(catalog.higgsfieldOutcome("completed")).toEqual({ state: "completed" });
  expect(catalog.higgsfieldOutcome("nsfw")).toEqual({ state: "failed", error: "provider_content_rejected" });
  expect(catalog.higgsfieldOutcome("canceled")).toEqual({ state: "failed", error: "provider_generation_canceled" });
  expect(catalog.higgsfieldOutcome("in_progress")).toEqual({ state: "processing" });
});

test("nothing is sent unless the client allowlisted Higgsfield and stored a well-formed key", async () => {
  const sent = stubFetch(() => Response.json({}));
  expect(await adapter({ allowed: false }).quoteClientHiggsfield({ model: "soul-2", prompt: "A lake" })).toMatchObject({ ok: false, status: 403, error: "provider_not_allowlisted" });
  expect(await adapter({ key: null }).quoteClientHiggsfield({ model: "soul-2", prompt: "A lake" })).toMatchObject({ ok: false, status: 503, error: "provider_not_configured" });
  const malformed = await adapter({ key: "just-a-token-without-id" }).quoteClientHiggsfield({ model: "soul-2", prompt: "A lake" });
  expect(malformed).toMatchObject({ ok: false, error: "provider_not_configured" });
  expect(JSON.stringify(malformed)).not.toContain("just-a-token");
  expect(await adapter().quoteClientHiggsfield({ model: "soul-2", prompt: "A lake", settings: { batch_size: 3 } })).toMatchObject({ ok: false, status: 400 });
  expect(await adapter().quoteClientHiggsfield({ model: "soul-2", prompt: "password: hunter2hunter2" })).toMatchObject({ ok: false, error: "secret_like_input_rejected" });
  expect(sent).toHaveLength(0);
});

test("a quote asks Higgsfield's estimate endpoint for this exact request and reserves its dollar figure", async () => {
  const sent = stubFetch(() => Response.json({ credits: "1.500", usd: "0.094" }));
  const quote = await adapter().quoteClientHiggsfield({ model: "seedance-2.5", prompt: "Ocean waves", settings: { duration: 10 } });
  expect(quote).toEqual({ ok: true, provider: "higgsfield", model: "seedance-2.5", estimatedCostMicros: 94_000 });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ url: "https://api.higgsfield.ai/estimate/bytedance/seedance-2.5/text-to-video", method: "POST" });
  expect(sent[0].headers.authorization).toBe(`Key ${FAKE_KEY}`);
  expect(JSON.parse(sent[0].body)).toEqual({ prompt: "Ocean waves", duration: 10, resolution: "720p", aspect_ratio: "16:9", output_format: "mp4", generate_audio: true });

  stubFetch(() => Response.json({ usd: "not-a-number" }));
  expect(await adapter().quoteClientHiggsfield({ model: "soul-2", prompt: "A lake" })).toMatchObject({ ok: false, error: "provider_estimate_invalid" });
  stubFetch(() => Response.json({ usd: "999" }));
  expect(await adapter().quoteClientHiggsfield({ model: "soul-2", prompt: "A lake" })).toMatchObject({ ok: false, error: "provider_estimate_over_limit" });
});

test("a submit needs the job's idempotency key, sends it, and keeps only a valid request id", async () => {
  let sent = stubFetch(() => Response.json({ status: "queued", request_id: JOB_ID }));
  expect(await adapter().runClientHiggsfieldAdapter({ model: "kling-3-standard", prompt: "A coastal road" })).toMatchObject({ ok: false, error: "higgsfield_idempotency_key_required" });
  expect(sent).toHaveLength(0);

  const started = await adapter().runClientHiggsfieldAdapter({ model: "kling-3-standard", prompt: "A coastal road", idempotencyKey: "job-1234-abcd" });
  expect(started).toEqual({ ok: true, provider: "higgsfield", model: "kling-3-standard", state: "processing", providerJobId: JOB_ID });
  expect(sent[0]).toMatchObject({ url: "https://api.higgsfield.ai/kling-video/v3.0/std/text-to-video", method: "POST" });
  expect(sent[0].headers["idempotency-key"]).toBe("job-1234-abcd");

  sent = stubFetch(() => Response.json({ status: "queued", request_id: "../../steal" }));
  expect(await adapter().runClientHiggsfieldAdapter({ model: "soul-2", prompt: "A lake", idempotencyKey: "job-1234-abcd" })).toMatchObject({ ok: false, error: "provider_output_invalid" });
});

test("failures report a status-derived code and never echo what Higgsfield sent back", async () => {
  const cases: Array<[number, string]> = [[401, "provider_key_rejected"], [404, "provider_model_unavailable"], [423, "provider_model_unavailable"], [503, "provider_model_unavailable"], [429, "provider_rate_limited"], [500, "provider_request_failed"]];
  for (const [status, code] of cases) {
    stubFetch(() => Response.json({ detail: "your prompt was: A secret product launch" }, { status }));
    const result = await adapter().runClientHiggsfieldAdapter({ model: "soul-2", prompt: "A secret product launch", idempotencyKey: "job-1234-abcd" });
    expect(result).toMatchObject({ ok: false, status, error: code });
    expect(JSON.stringify(result)).not.toContain("secret product");
  }
  globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
  expect(await adapter().runClientHiggsfieldAdapter({ model: "soul-2", prompt: "A lake", idempotencyKey: "job-1234-abcd" })).toMatchObject({ ok: false, error: "provider_unreachable" });
});

test("a status check goes to Higgsfield's own address and only safe output links come back", async () => {
  let sent = stubFetch(() => Response.json({ status: "completed", request_id: JOB_ID, video: { url: "https://cdn.example.com/out.mp4" }, status_url: "https://evil.example/steal" }));
  const done = await adapter().runClientHiggsfieldAdapter({ model: "seedance-2.5", providerJobId: JOB_ID });
  expect(done).toEqual({ ok: true, provider: "higgsfield", model: "seedance-2.5", state: "completed", providerJobId: JOB_ID, outputUrls: ["https://cdn.example.com/out.mp4"] });
  expect(sent[0].url).toBe(`https://api.higgsfield.ai/requests/${JOB_ID}/status`);
  expect(sent[0].headers.authorization).toBe(`Key ${FAKE_KEY}`);

  stubFetch(() => Response.json({ status: "completed", request_id: JOB_ID, images: [{ url: "https://cdn.example.com/a.png" }, { url: "https://cdn.example.com/b.png" }] }));
  expect(await adapter().runClientHiggsfieldAdapter({ model: "soul-2", providerJobId: JOB_ID })).toMatchObject({ state: "completed", outputUrls: ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"] });

  for (const url of ["http://cdn.example.com/out.mp4", "https://10.0.0.5/out.mp4", "https://user:pass@cdn.example.com/out.mp4", "not a url"]) {
    stubFetch(() => Response.json({ status: "completed", request_id: JOB_ID, video: { url } }));
    expect(await adapter().runClientHiggsfieldAdapter({ model: "seedance-2.5", providerJobId: JOB_ID })).toMatchObject({ ok: false, error: "provider_output_invalid" });
  }
  stubFetch(() => Response.json({ status: "completed", request_id: JOB_ID, images: [{ url: "https://cdn.example.com/a.png" }, { url: "https://127.0.0.1/b.png" }] }));
  expect(await adapter().runClientHiggsfieldAdapter({ model: "soul-2", providerJobId: JOB_ID })).toMatchObject({ ok: false, error: "provider_output_invalid" });

  stubFetch(() => Response.json({ status: "completed", request_id: "ffffffff-6699-4f6c-bb45-2ad7fd9158ff", video: { url: "https://cdn.example.com/out.mp4" } }));
  expect(await adapter().runClientHiggsfieldAdapter({ model: "seedance-2.5", providerJobId: JOB_ID })).toMatchObject({ ok: false, error: "provider_output_invalid" });
  stubFetch(() => Response.json({ status: "nsfw", request_id: JOB_ID }));
  expect(await adapter().runClientHiggsfieldAdapter({ model: "seedance-2.5", providerJobId: JOB_ID })).toMatchObject({ ok: true, state: "failed", error: "provider_content_rejected" });
  stubFetch(() => Response.json({ status: "in_progress", request_id: JOB_ID }));
  expect(await adapter().runClientHiggsfieldAdapter({ model: "seedance-2.5", providerJobId: JOB_ID })).toMatchObject({ ok: true, state: "processing" });

  sent = stubFetch(() => Response.json({}));
  expect(await adapter().runClientHiggsfieldAdapter({ model: "seedance-2.5", providerJobId: "../../admin" })).toMatchObject({ ok: false, error: "provider_job_invalid" });
  expect(sent).toHaveLength(0);
});

test("the Higgsfield code never logs, and it is registered off by default with a per-client key", () => {
  const source = readFileSync("src/lib/clientMediaAdapter.ts", "utf8");
  const higgsfield = source.slice(source.indexOf("export interface ClientHiggsfieldQuote"), source.indexOf("export function safeProviderOutputUrl"));
  expect(higgsfield.length).toBeGreaterThan(1_000);
  expect(higgsfield).not.toMatch(/console\./);
  expect(readFileSync("src/lib/higgsfieldCatalog.ts", "utf8")).not.toMatch(/console\./);

  const provider = MEDIA_PROVIDER_REGISTRY.find((entry) => entry.id === "higgsfield");
  expect(provider).toBeDefined();
  expect(provider?.enabledByDefault).toBe(false);
  expect(validateMediaProviderDescriptor(provider!)).toEqual([]);
  expect(CLIENT_CREDENTIAL_OPTIONS.find((option) => option.key === "HIGGSFIELD_API_KEY")).toMatchObject({ secret: true, submitAllowed: true, category: "Video" });
});
