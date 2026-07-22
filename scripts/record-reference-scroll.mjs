import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const sourceUrl = process.argv[2] || "https://www.shopify.com/editions/winter2026";
const outputDir = "/tmp/veloce-reference-captures";
const width = 1440;
const height = 900;
const pixelsPerSecond = Number(process.env.SCROLL_RATE || 420);
const intervalMs = 80;
const maxDurationMs = Number(process.env.MAX_DURATION_MS || 12 * 60 * 1000);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputMp4 = path.join(outputDir, `reference-scroll-${timestamp}.mp4`);

if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
  throw new Error("SCROLL_RATE must be a positive number of pixels per second.");
}

mkdirSync(outputDir, { recursive: true });

console.log("Recording a public reference for permission-aware visual study only.");
console.log(`Source: ${sourceUrl}`);
console.log(`Rate: ${pixelsPerSecond}px/s. The recording will stop at the stable page bottom.`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  recordVideo: { dir: outputDir, size: { width, height } },
  reducedMotion: "no-preference",
});
const page = await context.newPage();

let video;
try {
  await page.goto(sourceUrl, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(2_000);
  video = page.video();

  const increment = (pixelsPerSecond * intervalMs) / 1_000;
  const startedAt = Date.now();
  let stableBottomTicks = 0;

  while (Date.now() - startedAt < maxDurationMs) {
    const { top, max } = await page.evaluate((distance) => {
      window.scrollBy(0, distance);
      const root = document.documentElement;
      const body = document.body;
      const documentHeight = Math.max(root.scrollHeight, body.scrollHeight);
      return { top: window.scrollY, max: Math.max(0, documentHeight - window.innerHeight) };
    }, increment);

    if (top >= max - 2) {
      stableBottomTicks += 1;
      // Give lazy-loaded sections a moment to extend the document before ending.
      if (stableBottomTicks >= 16) break;
    } else {
      stableBottomTicks = 0;
    }

    await page.waitForTimeout(intervalMs);
  }

  if (Date.now() - startedAt >= maxDurationMs) {
    console.warn("Reached MAX_DURATION_MS before a stable page end. The partial recording was retained.");
  }
} finally {
  await context.close();
  await browser.close();
}

if (!video) throw new Error("Playwright did not initialize video capture.");
const webmPath = await video.path();
if (!existsSync(webmPath)) throw new Error("The browser recording file was not created.");

execFileSync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y", "-i", webmPath,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputMp4,
], { stdio: "inherit" });

rmSync(webmPath);
console.log(`Saved MP4: ${outputMp4}`);
