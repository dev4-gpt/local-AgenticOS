import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { estimateElevenLabsMusicCostMicros } from "../src/lib/clientMediaAdapter";

test("music uses its own ElevenLabs key, never the speech one", () => {
  // Speech and music are separately metered products. Charging music against
  // the speech key would spend a budget the client never approved for it.
  const source = readFileSync("src/lib/clientMediaAdapter.ts", "utf8");
  const musicFn = source.slice(source.indexOf("runClientElevenLabsMusicAdapter"), source.indexOf("export async function runClientMusicAdapter"));
  expect(musicFn).toContain("ELEVENLABS_MUSIC_API_KEY");
  expect(musicFn).not.toContain('providerEnvKey("ELEVENLABS_API_KEY")');

  const route = readFileSync("src/app/api/client-runtime/hosted-jobs/route.ts", "utf8");
  expect(route).toContain('"elevenlabs-music": "ELEVENLABS_MUSIC_API_KEY"');
});

test("music is synchronous, so it stores no provider job id", () => {
  // Suno returns a task to poll; ElevenLabs returns the audio. The music lane
  // must not inherit the callback-and-poll machinery it does not need.
  const source = readFileSync("src/lib/clientMediaAdapter.ts", "utf8");
  const musicFn = source.slice(source.indexOf("runClientElevenLabsMusicAdapter"), source.indexOf("export async function runClientMusicAdapter"));
  expect(musicFn).not.toContain("providerJobId");
  expect(musicFn).not.toContain("callBackUrl");
  expect(musicFn).toContain("readBoundedResponseBytes");
});

test("length is clamped to what the API accepts", () => {
  // The endpoint takes 3s to 10 minutes; anything outside that is a failed call
  // the client still waited for.
  const source = readFileSync("src/lib/clientMediaAdapter.ts", "utf8");
  expect(source).toContain("Math.max(3_000, Math.min(600_000,");
});

test("the cost estimate scales with length and errs high", () => {
  // Under-counting lets real spend pass the cap before the guard notices.
  // Over-counting only stops you early, so the default leans that way.
  const thirty = estimateElevenLabsMusicCostMicros(30_000);
  expect(thirty).toBe(100_000);
  expect(estimateElevenLabsMusicCostMicros(60_000)).toBe(thirty * 2);
  expect(estimateElevenLabsMusicCostMicros(15_000)).toBe(thirty / 2);
  // A sub-minimum request is still billed at the minimum the API will run.
  expect(estimateElevenLabsMusicCostMicros(0)).toBe(estimateElevenLabsMusicCostMicros(3_000));
});

test("the worker accepts the new provider and routes it to the sync path", () => {
  const worker = readFileSync("src/app/api/internal/client-runtime/jobs/route.ts", "utf8");
  expect(worker).toContain('job.provider !== "elevenlabs-music"');
  expect(worker).toContain("runClientElevenLabsMusicAdapter");
  // It must reserve budget using the music estimate, not the speech one.
  expect(worker).toContain('provider === "elevenlabs-music" ? estimateElevenLabsMusicCostMicros');
});
