import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { answerFromClassroom, type ClassroomSource, readRun, storeSourceRun } from "@/lib/classroomResearch";
import { isLocalOnlyRequest } from "@/lib/localOnlyRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BSKY_API = "https://public.api.bsky.app/xrpc";

function string(value: unknown) { return typeof value === "string" ? value : ""; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function source(id: string, input: { title: string; url: string; text: string; collectedAt?: string }): ClassroomSource {
  return { id, title: input.title, url: input.url, text: input.text.slice(0, 40_000), collectedAt: input.collectedAt || new Date().toISOString(), links: [] };
}

function blueskyUrl(post: Record<string, unknown>) {
  const author = post.author as Record<string, unknown> | undefined;
  const handle = string(author?.handle);
  const uri = string(post.uri);
  const rkey = uri.split("/").at(-1);
  return handle && rkey ? `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(rkey)}` : "https://bsky.app";
}

function blueskySource(post: Record<string, unknown>, index: number) {
  const author = post.author as Record<string, unknown> | undefined;
  const record = post.record as Record<string, unknown> | undefined;
  const handle = string(author?.handle) || "unknown";
  const createdAt = string(record?.createdAt) || string(post.indexedAt);
  const metrics = [`likes ${number(post.likeCount)}`, `reposts ${number(post.repostCount)}`, `replies ${number(post.replyCount)}`].join(" · ");
  return source(`S${index + 1}`, { title: `Bluesky · @${handle}`, url: blueskyUrl(post), collectedAt: createdAt, text: `${string(record?.text)}\n\n${createdAt ? `Published: ${createdAt}\n` : ""}${metrics}` });
}

async function blueskyRun(mode: "search" | "feed", query: string, limit: number) {
  const url = new URL(`${BSKY_API}/${mode === "search" ? "app.bsky.feed.searchPosts" : "app.bsky.feed.getAuthorFeed"}`);
  url.searchParams.set(mode === "search" ? "q" : "actor", query);
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Veloce-AgenticOS/0.1 (local research; no automated publishing)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 240);
    throw new Error(`Bluesky API returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`);
  }
  const body = await response.json() as { posts?: unknown[]; feed?: Array<{ post?: unknown }> };
  const posts = mode === "search" ? body.posts ?? [] : (body.feed ?? []).map((item) => item.post);
  const sources = posts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).map(blueskySource);
  return storeSourceRun({ startUrl: url.toString(), scopePrefix: "/xrpc", sources });
}

async function threadsRun(limit: number) {
  const token = process.env.AGENTIC_OS_THREADS_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("Threads is ready for an official OAuth token. Set AGENTIC_OS_THREADS_ACCESS_TOKEN after connecting your Meta app; AgentOS does not accept a token in the browser.");
  const url = new URL("https://graph.threads.net/v1.0/me/threads");
  url.searchParams.set("fields", "id,text,timestamp,permalink,username,media_type,shortcode");
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Threads API returned HTTP ${response.status}. Reconnect the official Meta app and confirm its permissions.`);
  const body = await response.json() as { data?: unknown[] };
  const sources = (body.data ?? []).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).map((post, index) => {
    const username = string(post.username) || "your Threads account";
    const permalink = string(post.permalink) || `https://www.threads.net/@${encodeURIComponent(username)}/post/${encodeURIComponent(string(post.id))}`;
    return source(`S${index + 1}`, { title: `Threads · @${username}`, url: permalink, collectedAt: string(post.timestamp), text: string(post.text) || "[No text content returned by the official API.]" });
  });
  return storeSourceRun({ startUrl: "https://graph.threads.net/v1.0/me/threads", scopePrefix: "/v1.0", sources });
}

async function snscrapeImport(jsonl: string) {
  if (jsonl.length > 5_000_000) throw new Error("The import is limited to 5 MB. Split a larger export into smaller files.");
  const rows = jsonl.split("\n").filter(Boolean).slice(0, 1_000).flatMap((line) => { try { const item = JSON.parse(line); return item && typeof item === "object" ? [item as Record<string, unknown>] : []; } catch { return []; } });
  if (!rows.length) throw new Error("No valid JSONL records found. Export with `snscrape --jsonl` and paste the output.");
  const sources: ClassroomSource[] = [];
  for (const row of rows) {
    const user = row.user as Record<string, unknown> | undefined;
    const username = string(user?.username) || string(user?.displayname) || "imported account";
    const url = string(row.url);
    if (!/^https:\/\/[^\s]+$/i.test(url)) continue;
    const text = string(row.rawContent) || string(row.content) || string(row.renderedContent) || "[No text content in imported record.]";
    sources.push(source(`S${sources.length + 1}`, { title: `Imported social post · ${username}`, url, collectedAt: string(row.date), text }));
  }
  if (!sources.length) throw new Error("The import contains no records with a canonical HTTPS post URL, so it cannot be cited reliably.");
  return storeSourceRun({ startUrl: "user-import://snscrape", scopePrefix: "/", sources });
}

const SNSCRAPE_MODES = new Set(["twitter-search", "twitter-user", "twitter-hashtag", "mastodon-user", "reddit-search", "telegram-channel"]);

async function runSnscrape(mode: string, query: string, limit: number) {
  if (!SNSCRAPE_MODES.has(mode)) throw new Error("That snscrape mode is not available in AgentOS.");
  if (!query || query.length > 250) throw new Error("Enter a query or handle up to 250 characters.");
  const executable = process.env.AGENTIC_OS_SNSCRAPE_BIN?.trim() || "snscrape";
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(executable, ["--jsonl", "--max-results", String(limit), mode, query], { shell: false, windowsHide: true });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let total = 0;
    const timer = setTimeout(() => { child.kill(); reject(new Error("snscrape timed out after 60 seconds.")); }, 60_000);
    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > 5_000_000) { child.kill(); reject(new Error("snscrape output exceeded the 5 MB safety limit.")); return; }
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(new Error(`Could not start snscrape: ${error.message}. Install it yourself first, then restart AgentOS.`)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8");
      if (code !== 0 && !output.trim()) reject(new Error(`snscrape exited with code ${code}: ${Buffer.concat(errors).toString("utf8").slice(0, 500)}`));
      else resolve(output);
    });
  });
  return snscrapeImport(stdout);
}

export async function POST(request: Request) {
  if (!isLocalOnlyRequest(request)) return NextResponse.json({ error: "local only" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = string(body.action);
    const limit = Math.max(1, Math.min(100, Math.floor(number(body.limit) || 25)));
    if (action === "bluesky") {
      const mode = body.mode === "feed" ? "feed" : "search";
      const query = string(body.query).trim();
      if (!query || query.length > 250) return NextResponse.json({ error: "Enter a search or Bluesky handle up to 250 characters." }, { status: 400 });
      return NextResponse.json({ run: await blueskyRun(mode, query, limit) });
    }
    if (action === "threads") return NextResponse.json({ run: await threadsRun(limit) });
    if (action === "snscrape-import") return NextResponse.json({ run: await snscrapeImport(string(body.jsonl)) });
    if (action === "snscrape-run") return NextResponse.json({ run: await runSnscrape(string(body.mode), string(body.query).trim(), limit) });
    if (action === "answer") {
      const question = string(body.question).trim();
      if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });
      return NextResponse.json(await answerFromClassroom(await readRun(string(body.runId)), question));
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Social research failed." }, { status: 400 }); }
}
