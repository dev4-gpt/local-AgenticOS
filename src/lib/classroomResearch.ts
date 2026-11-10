import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { safeClientSourceUrl } from "@/lib/clientSourcePack";
import { isAllowedV96ResearchUrl } from "@/lib/v96Contracts";
import { localChat, resolveModel } from "@/lib/localOllama";

export type ClassroomSource = {
  id: string;
  title: string;
  url: string;
  tab?: string;
  text: string;
  collectedAt: string;
  links: { url: string; text: string }[];
};

export type ClassroomRun = {
  id: string;
  startUrl: string;
  scopePrefix: string;
  createdAt: string;
  sources: ClassroomSource[];
  skipped: string[];
  visited?: string[];
  pending?: string[];
  pagesVisited?: number;
  resumedFrom?: string;
  interrupted?: string;
};

type LoginSession = { browser: Browser; context: BrowserContext; origin: string };
type LoginRegistry = typeof globalThis & { __classroomResearchLogins?: Map<string, LoginSession> };

const ROOT = process.env.AGENTIC_OS_CLASSROOM_RESEARCH_DIR?.trim()
  || path.join(os.homedir(), ".agentic-os", "classroom-research");
const SESSIONS_DIR = path.join(ROOT, "sessions");
const RUNS_DIR = path.join(ROOT, "runs");
const SPACE = /[\t ]+/g;
const EXTRA_BREAKS = /\n{3,}/g;
const PRIVATE_V4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.)/;

function registry() {
  const host = globalThis as LoginRegistry;
  return host.__classroomResearchLogins ?? (host.__classroomResearchLogins = new Map());
}

function privateAddress(address: string) {
  const value = address.toLowerCase();
  return PRIVATE_V4.test(value) || value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
}

function cleanText(value: string) {
  return value.replace(SPACE, " ").replace(EXTRA_BREAKS, "\n\n").trim();
}

function normaliseUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function sourceOrigin(value: string) {
  const url = new URL(value);
  if (!isAllowedV96ResearchUrl(url.toString())) throw new Error("Use a public HTTPS URL; local, credentialed, and non-HTTPS addresses are blocked.");
  if (url.hostname === "skool.com" || url.hostname.endsWith(".skool.com")) {
    throw new Error("Skool automated collection is disabled under its platform policy. Use an approved owner-provided export instead.");
  }
  return url.origin;
}

function defaultScope(value: string) {
  const first = new URL(value).pathname.split("/").filter(Boolean)[0];
  return first ? `/${first}` : "/";
}

function safeScope(value: string | undefined, startUrl: string) {
  const scope = value?.trim() || defaultScope(startUrl);
  if (!scope.startsWith("/") || scope.includes("//") || scope.includes("..")) throw new Error("Scope must be a normal URL path beginning with '/'.");
  return scope.replace(/\/$/, "") || "/";
}

async function assertPublicResolution(value: string) {
  const host = new URL(value).hostname;
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) throw new Error("This source resolves to a private or unsafe network address.");
}

export function isClassroomUrlInScope(value: string, origin: string, prefix: string) {
  try {
    const url = new URL(value);
    return url.origin === origin && (prefix === "/" || url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  } catch { return false; }
}

function sessionPath(origin: string) {
  return path.join(SESSIONS_DIR, `${createHash("sha256").update(origin).digest("hex")}.json`);
}

export async function beginClassroomLogin(startUrl: string) {
  const url = normaliseUrl(startUrl);
  const origin = sourceOrigin(url);
  await assertPublicResolution(url);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const loginId = randomUUID();
  registry().set(loginId, { browser, context, origin });
  return { loginId, origin };
}

export async function saveClassroomLogin(loginId: string) {
  const active = registry().get(loginId);
  if (!active) throw new Error("That sign-in window is no longer active. Open a new one and complete sign-in there.");
  try {
    await mkdir(SESSIONS_DIR, { recursive: true });
    const file = sessionPath(active.origin);
    await active.context.storageState({ path: file });
    await chmod(file, 0o600);
    return { origin: active.origin };
  } finally {
    registry().delete(loginId);
    await active.context.close().catch(() => undefined);
    await active.browser.close().catch(() => undefined);
  }
}

export async function classroomLinksOn(page: Page) {
  const raw = await page.locator("a[href], video[src], video source[src], audio[src], audio source[src], iframe[src]").evaluateAll((elements) => elements
    .filter((element) => {
      if (element.tagName === "SOURCE") return true;
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    })
    .map((element) => {
      const media = element.tagName !== "A";
      const url = element.getAttribute(media ? "src" : "href") || "";
      const label = element.getAttribute("title") || element.getAttribute("aria-label") || (element as HTMLElement).innerText || element.textContent || "";
      return { url: new URL(url, document.baseURI).toString(), text: media ? `${element.tagName === "IFRAME" ? "Embed" : "Media"}: ${label || url}` : label };
    }));
  const seen = new Set<string>();
  return raw.flatMap((item) => {
    try {
      const url = safeClientSourceUrl(normaliseUrl(item.url));
      if (seen.has(url)) return [];
      seen.add(url);
      return [{ url, text: cleanText(item.text).slice(0, 300) }];
    } catch { return []; }
  });
}

async function sourceFromPage(page: Page, id: string, tab?: string): Promise<ClassroomSource> {
  const main = page.locator("main, [role='main'], article").first();
  const text = await (await main.count() ? main.innerText() : page.locator("body").innerText());
  const h1 = page.locator("h1").first();
  const title = await (await h1.count() ? h1.innerText() : page.title());
  const url = safeClientSourceUrl(normaliseUrl(page.url()));
  return { id, title: cleanText(title) || url, url, ...(tab ? { tab } : {}), text: cleanText(text), collectedAt: new Date().toISOString(), links: await classroomLinksOn(page) };
}

function isChallenge(source: ClassroomSource) {
  const text = `${source.title}\n${source.text}`.toLowerCase();
  return text.includes("verify you are human") || text.includes("verify you're human") || text.includes("checking your browser") || text.includes("cf-chl-");
}

export async function classroomTabSources(page: Page, startAt: number, origin: string, scopePrefix: string) {
  const tabs = page.locator("[role='tab']");
  const total = await tabs.count();
  const count = Math.min(total, 100);
  const sources: ClassroomSource[] = [];
  const skipped: string[] = total > count ? [`${page.url()} (${total - count} tabs exceed the per-page limit)`] : [];
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    const label = cleanText((await tab.innerText().catch(() => "")) || "Tab");
    try {
      await tab.click({ timeout: 5_000 });
      await page.waitForTimeout(350);
      if (!isClassroomUrlInScope(page.url(), origin, scopePrefix)) throw new Error("tab left approved scope");
      const source = await sourceFromPage(page, `S${startAt + sources.length}`, label);
      if (source.text) sources.push(source);
      else skipped.push(`${page.url()} [tab ${label}] (empty tab)`);
    } catch (error) { skipped.push(`${page.url()} [tab ${label}] (${error instanceof Error ? error.message : "unavailable"})`); }
  }
  return { sources, skipped };
}

export async function collectClassroom(input: { startUrl?: string; scopePrefix?: string; maxPages?: number; delayMs?: number; resumeRunId?: string }) {
  const previous = input.resumeRunId ? await readRun(input.resumeRunId) : null;
  if (previous && (!Array.isArray(previous.pending) || !Array.isArray(previous.visited))) throw new Error("This older run cannot be resumed. Start a new collection.");
  const startUrl = previous?.startUrl ?? normaliseUrl(input.startUrl ?? "");
  const origin = sourceOrigin(startUrl);
  const scopePrefix = previous?.scopePrefix ?? safeScope(input.scopePrefix, startUrl);
  if (!isClassroomUrlInScope(startUrl, origin, scopePrefix)) throw new Error("The classroom URL is outside the selected scope.");
  await assertPublicResolution(startUrl);
  const authFile = sessionPath(origin);
  if (!existsSync(authFile)) throw new Error("Sign in first. AgentOS never asks for or stores your password.");
  const maxPages = Math.max(1, Math.min(100, Math.floor(input.maxPages ?? 25)));
  const delayMs = Math.max(250, Math.min(10_000, Math.floor(input.delayMs ?? 900)));
  const pending = previous ? [...previous.pending!] : [startUrl];
  const queued = new Set(pending);
  const visited = new Set(previous?.visited ?? []);
  const sources: ClassroomSource[] = [...(previous?.sources ?? [])];
  const skipped: string[] = [...(previous?.skipped ?? [])];
  let pagesThisRun = 0;
  let interrupted: string | undefined;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();
    const checkedHosts = new Map<string, Promise<void>>();
    await page.route("**/*", async (route) => {
      const request = route.request();
      const target = request.url();
      if (/^https?:/i.test(target)) {
        if (!isAllowedV96ResearchUrl(target)) return route.abort();
        const host = new URL(target).hostname;
        if (!checkedHosts.has(host)) checkedHosts.set(host, assertPublicResolution(target));
        try { await checkedHosts.get(host); }
        catch { return route.abort(); }
      }
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()
        && !isClassroomUrlInScope(target, origin, scopePrefix)) return route.abort();
      return route.continue();
    });
    while (pending.length && pagesThisRun < maxPages) {
      const next = pending.shift();
      if (next) queued.delete(next);
      if (!next || visited.has(next)) continue;
      if (!isClassroomUrlInScope(next, origin, scopePrefix)) { skipped.push(`${next} (outside approved scope)`); continue; }
      try { await assertPublicResolution(next); }
      catch { skipped.push(`${next} (unsafe or unavailable DNS resolution)`); continue; }
      visited.add(next);
      pagesThisRun += 1;
      try {
        const response = await page.goto(next, { waitUntil: "domcontentloaded", timeout: 45_000 });
        if (!response || response.status() >= 400) { skipped.push(`${next} (HTTP ${response?.status() ?? "no response"})`); continue; }
        if (!isClassroomUrlInScope(page.url(), origin, scopePrefix)) { skipped.push(`${next} (redirected outside approved scope)`); continue; }
        await page.waitForTimeout(600);
        const source = await sourceFromPage(page, `S${sources.length + 1}`);
        if (isChallenge(source)) throw new Error("A challenge page appeared. Open Sign-in browser, complete it yourself, save the session, then retry.");
        if (source.text) sources.push(source);
        else skipped.push(`${next} (empty page)`);
        const tabs = await classroomTabSources(page, sources.length + 1, origin, scopePrefix);
        sources.push(...tabs.sources);
        skipped.push(...tabs.skipped);
        for (const link of [source, ...tabs.sources].flatMap((item) => item.links)) {
          if (isClassroomUrlInScope(link.url, origin, scopePrefix) && !visited.has(link.url) && !queued.has(link.url)) {
            pending.push(link.url);
            queued.add(link.url);
          }
        }
        await page.waitForTimeout(delayMs);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unavailable";
        if (message.startsWith("A challenge page appeared")) {
          visited.delete(next);
          pending.unshift(next);
          interrupted = message;
          break;
        }
        skipped.push(`${next} (${message})`);
      }
    }
    await context.close();
  } finally { await browser.close(); }
  const run: ClassroomRun = {
    id: randomUUID(), startUrl, scopePrefix, createdAt: new Date().toISOString(), sources, skipped,
    visited: [...visited], pending, pagesVisited: visited.size,
    ...(previous ? { resumedFrom: previous.id } : {}),
    ...(interrupted ? { interrupted } : {}),
  };
  await saveRun(run);
  return run;
}

export function sourcePack(run: ClassroomRun) {
  return ["# Classroom source pack", "", `Collected: ${run.createdAt}`, `Scope: \`${run.startUrl}\``, "", ...run.sources.flatMap((source) => [
    `## [${source.id}] ${source.title}${source.tab ? ` — ${source.tab}` : ""}`,
    `Source: \`${source.url}\``,
    "",
    source.text,
    "",
    ...(source.links.length ? ["Links:", ...source.links.flatMap((link) => {
      try {
        const url = safeClientSourceUrl(link.url);
        const label = cleanText(link.text || "Link").replace(/[\\[\]]/g, "\\$&");
        return [`- [${label}](<${url}>)`];
      } catch { return []; }
    }), ""] : []),
  ])].join("\n");
}

async function saveRun(run: ClassroomRun) {
  await mkdir(RUNS_DIR, { recursive: true });
  const jsonPath = path.join(RUNS_DIR, `${run.id}.json`);
  await writeFile(jsonPath, JSON.stringify(run, null, 2), { encoding: "utf8", mode: 0o600 });
  await writeFile(path.join(RUNS_DIR, `${run.id}.md`), sourcePack(run), { encoding: "utf8", mode: 0o600 });
}

/** Store records obtained through an approved API or a user-provided export in
 * the same immutable, citation-first format as classroom captures. */
export async function storeSourceRun(input: Omit<ClassroomRun, "id" | "createdAt" | "skipped"> & { skipped?: string[] }) {
  const run: ClassroomRun = {
    id: randomUUID(),
    startUrl: input.startUrl,
    scopePrefix: input.scopePrefix,
    createdAt: new Date().toISOString(),
    sources: input.sources,
    skipped: input.skipped ?? [],
    ...(input.visited ? { visited: input.visited } : {}),
    ...(input.pending ? { pending: input.pending } : {}),
    ...(input.pagesVisited !== undefined ? { pagesVisited: input.pagesVisited } : {}),
  };
  await saveRun(run);
  return run;
}

export async function readRun(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid research run.");
  const file = path.join(RUNS_DIR, `${id}.json`);
  return JSON.parse(await readFile(file, "utf8")) as ClassroomRun;
}

export function answerViolations(answer: string, sources: ClassroomSource[]) {
  const valid = new Set(sources.map((source) => source.id));
  const errors: string[] = [];
  for (const [index, raw] of answer.split("\n").entries()) {
    const line = raw.trim();
    if (!line || /^#{1,6}\s/.test(line)) continue;
    const citations = [...line.matchAll(/\[(S\d+)\]/g)].map((match) => match[1]);
    if (!citations.length) errors.push(`Line ${index + 1} has no citation.`);
    for (const citation of citations) if (!valid.has(citation)) errors.push(`Line ${index + 1} cites an unknown source: ${citation}.`);
  }
  return errors;
}

function relevantSources(sources: ClassroomSource[], question: string) {
  const terms = [...new Set(question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  const score = (source: ClassroomSource) => terms.reduce((total, term) => {
    const titleHits = (source.title.toLowerCase().match(new RegExp(term, "g")) ?? []).length;
    const textHits = (source.text.toLowerCase().match(new RegExp(term, "g")) ?? []).length;
    return total + titleHits * 8 + Math.min(textHits, 12);
  }, 0);
  return [...sources].sort((left, right) => score(right) - score(left)).slice(0, 12);
}

export async function answerFromClassroom(run: ClassroomRun, question: string) {
  const compactSources = relevantSources(run.sources, question).map((source) => `[#${source.id}] ${source.title}\nURL: ${source.url}\n${source.text.slice(0, 6_000)}`).join("\n\n");
  const model = await resolveModel();
  const answer = await localChat(model,
    "You answer only from the supplied classroom sources. Never use outside knowledge. Every non-heading, non-empty line must end with one or more citations in the exact format [S1]. If the sources do not establish the answer, say exactly 'I don't have enough evidence in the collected sources. [S1]' using the closest relevant source. Do not invent titles, URLs, dates, facts, or citation IDs.",
    `Question: ${question.trim()}\n\nClassroom sources:\n${compactSources}`,
    { temperature: 0, numCtx: 32_768, numPredict: 2_000, timeoutMs: 180_000 },
  );
  const violations = answerViolations(answer, run.sources);
  if (violations.length) throw new Error(`The local model response was rejected: ${violations.join(" ")}`);
  return { answer, model };
}
