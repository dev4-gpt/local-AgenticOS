import { lookup } from "node:dns/promises";
import net from "node:net";
import { chromium } from "@playwright/test";

export interface FlowCaptureRequest {
  sourceUrl: string;
  permission: "owned" | "authorized" | "public-reference";
}

export interface FlowCaptureResult {
  sourceUrl: string;
  capturedAt: string;
  viewport: { width: number; height: number };
  inventory: {
    scrollDepth: number;
    chapterBands: number;
    headings: number;
    navigation: number;
    fixedOrSticky: number;
    interactiveControls: number;
    images: number;
    videos: number;
    canvases: number;
    animatedElements: number;
  };
  observations: string[];
  veloceAssetDirections: string[];
  implementationPlan: string[];
  constraints: string[];
}

const VIEWPORT = { width: 1440, height: 900 };
const MAX_SCROLL_DEPTH = 120_000;

function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

async function assertPublicUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Add a valid public https URL."); }
  if (url.protocol !== "https:") throw new Error("Flow Capture accepts public https references only.");
  if (url.username || url.password || url.port) throw new Error("Flow Capture does not accept credentials or custom ports.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || net.isIP(host) && isPrivateAddress(host)) throw new Error("Local and private-network addresses are not allowed.");
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("The reference host resolves to a private network address.");
  return url;
}

function observations(inventory: FlowCaptureResult["inventory"]) {
  const result = [
    `${inventory.chapterBands} scroll bands across roughly ${Math.round(inventory.scrollDepth / 1_000)}k pixels indicate a ${inventory.chapterBands >= 6 ? "chapter-led" : "compact"} narrative rather than a single static landing page.`,
    `${inventory.fixedOrSticky} fixed or sticky elements and ${inventory.navigation} navigation regions suggest where progress, orientation, or persistent context should be carried in an original Veloce story.`,
    `${inventory.interactiveControls} interactive controls should be sorted into primary conversion actions, navigation, and supporting state changes before designing Veloce equivalents.`,
  ];
  if (inventory.canvases || inventory.videos) result.push(`${inventory.canvases + inventory.videos} canvas/video surfaces indicate that visual depth is meaningful; use an original procedural scene or owned media with a DOM fallback.`);
  if (inventory.animatedElements) result.push(`${inventory.animatedElements} elements expose CSS animation or transition behavior; translate only the motion purpose and pacing, not the choreography.`);
  if (inventory.images) result.push(`${inventory.images} image elements were observed. Treat them as evidence of visual density and asset roles only; do not reuse or download them.`);
  return result;
}

export async function captureReferenceFlow(input: FlowCaptureRequest): Promise<FlowCaptureResult> {
  if (input.permission !== "public-reference") throw new Error("Flow Capture is for declared public-reference studies. Use Authorized Site Replication for client-provided owned materials.");
  const source = await assertPublicUrl(input.sourceUrl);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: "block" });
  const page = await context.newPage();

  try {
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font"].includes(type)) return route.abort();
      return route.continue();
    });
    await page.goto(source.toString(), { waitUntil: "domcontentloaded", timeout: 35_000 });
    await page.waitForTimeout(1_200);
    await assertPublicUrl(page.url());

    const inventory = await page.evaluate((limit) => {
      const body = document.body;
      const root = document.documentElement;
      const scrollDepth = Math.min(limit, Math.max(body.scrollHeight, root.scrollHeight) - window.innerHeight);
      const elements = Array.from(document.querySelectorAll<HTMLElement>("body *")).slice(0, 5_000);
      const animatedElements = elements.reduce((count, element) => {
        const style = getComputedStyle(element);
        return count + Number((style.animationName && style.animationName !== "none") || style.transitionProperty !== "all" && style.transitionProperty !== "none");
      }, 0);
      const chapterAnchors = Array.from(document.querySelectorAll<HTMLElement>("main > section, main > article, main > div, section, article"));
      const bands = new Set(chapterAnchors.map((element) => Math.round((element.getBoundingClientRect().top + window.scrollY) / Math.max(window.innerHeight, 1))));
      return {
        scrollDepth,
        chapterBands: Math.min(12, Math.max(1, bands.size)),
        headings: document.querySelectorAll("h1, h2, h3").length,
        navigation: document.querySelectorAll("nav, [role=navigation]").length,
        fixedOrSticky: elements.reduce((count, element) => {
          const position = getComputedStyle(element).position;
          return count + Number(position === "fixed" || position === "sticky");
        }, 0),
        interactiveControls: document.querySelectorAll("a, button, input, select, textarea, [role=button]").length,
        images: document.querySelectorAll("img, picture, [style*='background-image']").length,
        videos: document.querySelectorAll("video").length,
        canvases: document.querySelectorAll("canvas, model-viewer").length,
        animatedElements,
      };
    }, MAX_SCROLL_DEPTH);

    return {
      sourceUrl: source.toString(),
      capturedAt: new Date().toISOString(),
      viewport: VIEWPORT,
      inventory,
      observations: observations(inventory),
      veloceAssetDirections: [
        "Signal ignition: an original deep-space opening that turns scattered inputs into a visible operating signal.",
        "Private memory constellation: procedural knowledge nodes with no source-brand imagery, marks, or copy.",
        "Workflow orbit: a DOM-backed handoff map with optional lazy Three.js depth and a static fallback.",
        "Human approval eclipse: a high-contrast decision gate that visibly pauses external action for review.",
        "Delivery observatory: an original progress, outcome, and spend artifact that closes the narrative with evidence.",
      ],
      implementationPlan: [
        "Use the capture to select a Veloce chapter count and information density; do not map source sections one-to-one.",
        "Create Veloce-owned composition, copy, tokens, components, and motion rules in Web Studio.",
        "Use Framer Motion for editorial state changes and lazy Three.js only where depth communicates a real system state.",
        "Keep navigation, primary CTA, and all essential copy in the DOM with keyboard, mobile, and reduced-motion paths.",
      ],
      constraints: [
        "This capture stores no screenshots, copied text, source code, downloaded assets, or cloneable page specification.",
        "Use the result for high-level pacing, interaction purpose, visual density, and narrative analysis only.",
        "Do not reproduce reference branding, assets, copy, layout, or scene-by-scene interaction choreography.",
      ],
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
