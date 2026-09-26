import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
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

function inScope(value: string, origin: string, prefix: string) {
  try {
    const url = new URL(value);
    return url.origin === origin && url.pathname.startsWith(prefix);
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

async function linksOn(page: Page) {
  const raw = await page.locator("a[href]").evaluateAll((anchors) => anchors
    .filter((anchor) => {
      const style = window.getComputedStyle(anchor);
      return style.display !== "none" && style.visibility !== "hidden";
    })
    .map((anchor) => ({ url: (anchor as HTMLAnchorElement).href, text: (anchor as HTMLElement).innerText || anchor.textContent || "" })));
  const seen = new Set<string>();
  return raw.flatMap((item) => {
    try {
      const url = normaliseUrl(item.url);
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
  const canonical = page.locator("link[rel='canonical']").first();
  const canonicalHref = await (await canonical.count() ? canonical.getAttribute("href") : null);
  const currentUrl = page.url();
  const url = canonicalHref ? normaliseUrl(new URL(canonicalHref, currentUrl).toString()) : normaliseUrl(currentUrl);
  return { id, title: cleanText(title) || url, url, ...(tab ? { tab } : {}), text: cleanText(text), collectedAt: new Date().toISOString(), links: await linksOn(page) };
}

function isChallenge(source: ClassroomSource) {
  const text = `${source.title}\n${source.text}`.toLowerCase();
  return text.includes("verify you are human") || text.includes("verify you're human") || text.includes("checking your browser") || text.includes("cf-chl-");
}

async function tabSources(page: Page, startAt: number) {
  const tabs = page.locator("[role='tab']");
  const count = Math.min(await tabs.count(), 30);
  const sources: ClassroomSource[] = [];
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    const label = cleanText((await tab.innerText().catch(() => "")) || "Tab");
    try {
      await tab.click({ timeout: 5_000 });
      await page.waitForTimeout(350);
      const source = await sourceFromPage(page, `S${startAt + sources.length}`, label);
      if (source.text && !sources.some((previous) => previous.text === source.text)) sources.push(source);
    } catch { /* A non-interactive tab is not a collection failure. */ }
  }
  return sources;
}

export async function collectClassroom(input: { startUrl: string; scopePrefix?: string; maxPages?: number; delayMs?: number }) {
  const startUrl = normaliseUrl(input.startUrl);
  const origin = sourceOrigin(startUrl);
  const scopePrefix = safeScope(input.scopePrefix, startUrl);
  if (!inScope(startUrl, origin, scopePrefix)) throw new Error("The classroom URL is outside the selected scope.");
  await assertPublicResolution(startUrl);
  const authFile = sessionPath(origin);
  if (!existsSync(authFile)) throw new Error("Sign in first. AgentOS never asks for or stores your password.");
  const maxPages = Math.max(1, Math.min(100, Math.floor(input.maxPages ?? 25)));
  const delayMs = Math.max(250, Math.min(10_000, Math.floor(input.delayMs ?? 900)));
  const pending = [startUrl];
  const visited = new Set<string>();
  const sources: ClassroomSource[] = [];
  const skipped: string[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();
    while (pending.length && sources.length < maxPages) {
      const next = pending.shift();
      if (!next || visited.has(next)) continue;
      visited.add(next);
      try {
        const response = await page.goto(next, { waitUntil: "domcontentloaded", timeout: 45_000 });
        if (!response || response.status() >= 400) { skipped.push(`${next} (HTTP ${response?.status() ?? "no response"})`); continue; }
        if (!inScope(page.url(), origin, scopePrefix)) { skipped.push(`${next} (redirected outside approved scope)`); continue; }
        await page.waitForTimeout(600);
        const source = await sourceFromPage(page, `S${sources.length + 1}`);
        if (isChallenge(source)) throw new Error("A challenge page appeared. Open Sign-in browser, complete it yourself, save the session, then retry.");
        if (source.text) sources.push(source);
        const tabs = await tabSources(page, sources.length + 1);
        sources.push(...tabs.filter((tab) => sources.length < maxPages && tab.text !== source.text));
        for (const link of source.links) if (inScope(link.url, origin, scopePrefix) && !visited.has(link.url)) pending.push(link.url);
        await page.waitForTimeout(delayMs);
      } catch (error) { skipped.push(`${next} (${error instanceof Error ? error.message : "unavailable"})`); }
    }
    await context.close();
  } finally { await browser.close(); }
  const run: ClassroomRun = { id: randomUUID(), startUrl, scopePrefix, createdAt: new Date().toISOString(), sources, skipped };
  await saveRun(run);
  return run;
}

export function sourcePack(run: ClassroomRun) {
  return ["# Classroom source pack", "", `Collected: ${run.createdAt}`, `Scope: ${run.startUrl}`, "", ...run.sources.flatMap((source) => [
    `## [${source.id}] ${source.title}${source.tab ? ` — ${source.tab}` : ""}`,
    `Source: ${source.url}`,
    "",
    source.text,
    "",
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
