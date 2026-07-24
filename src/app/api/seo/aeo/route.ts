import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AEO (Agent/Answer Engine Optimization) checks for a verified domain: is the
// site reachable to AI crawlers, does it publish llms.txt, does it expose
// structured data. All read-only HTTP GETs against the site's own public
// pages - nothing is written anywhere, no paid API involved.

const AI_CRAWLERS = [
  { name: "OpenAI (GPTBot)", agent: "GPTBot" },
  { name: "OpenAI (ChatGPT-User)", agent: "ChatGPT-User" },
  { name: "Anthropic (ClaudeBot)", agent: "ClaudeBot" },
  { name: "Anthropic (anthropic-ai)", agent: "anthropic-ai" },
  { name: "Perplexity", agent: "PerplexityBot" },
  { name: "Google AI (Google-Extended)", agent: "Google-Extended" },
  { name: "Common Crawl (feeds most LLM training sets)", agent: "CCBot" },
  { name: "Apple Intelligence", agent: "Applebot-Extended" },
  { name: "Amazon", agent: "Amazonbot" },
];

interface RobotsRule { allow: string[]; disallow: string[]; }

// Simplified robots.txt reader: groups directives by User-agent block and,
// for a given bot, checks whether root ("/") is blocked in its own block or
// (if it has no dedicated block) the wildcard "*" block. Covers the common
// case (a flat Disallow: / or nothing) rather than implementing the full
// longest-match-wins RFC9309 algorithm.
function parseRobots(text: string): Map<string, RobotsRule> {
  const blocks = new Map<string, RobotsRule>();
  let current: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      current = [value.toLowerCase()];
      for (const agent of current) {
        if (!blocks.has(agent)) blocks.set(agent, { allow: [], disallow: [] });
      }
    } else if (key === "disallow" && current.length) {
      for (const agent of current) blocks.get(agent)!.disallow.push(value);
    } else if (key === "allow" && current.length) {
      for (const agent of current) blocks.get(agent)!.allow.push(value);
    }
  }
  return blocks;
}

function isRootBlocked(blocks: Map<string, RobotsRule>, agent: string): boolean {
  const rule = blocks.get(agent.toLowerCase()) ?? blocks.get("*");
  if (!rule) return false; // no matching block at all -> default allow
  const blocksRoot = rule.disallow.some((p) => p === "/" || p === "");
  if (!blocksRoot) return false;
  const allowsRoot = rule.allow.some((p) => p === "/" || p === "");
  return !allowsRoot;
}

async function fetchText(url: string, timeoutMs = 6000): Promise<{ ok: boolean; status: number; body: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": "Veloce-AEO-Check/1.0" } });
    const body = r.ok ? await r.text() : "";
    return { ok: r.ok, status: r.status, body };
  } catch {
    return { ok: false, status: 0, body: "" };
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: Request) {
  const site = new URL(req.url).searchParams.get("site");
  if (!site || !/^[a-z0-9.-]+$/i.test(site)) {
    return NextResponse.json({ error: "bad site" }, { status: 400 });
  }

  const base = `https://${site}`;
  const [robots, llms, home] = await Promise.all([
    fetchText(`${base}/robots.txt`),
    fetchText(`${base}/llms.txt`),
    fetchText(`${base}/`),
  ]);

  if (!robots.ok && !home.ok) {
    return NextResponse.json({ error: `Could not reach ${base} — check the domain is live and resolves over HTTPS.` }, { status: 502 });
  }

  const blocks = robots.ok ? parseRobots(robots.body) : new Map<string, RobotsRule>();
  const crawlers = AI_CRAWLERS.map((c) => ({
    name: c.name,
    agent: c.agent,
    allowed: !isRootBlocked(blocks, c.agent),
  }));

  const structuredData = /<script[^>]+type=["']application\/ld\+json["']/i.test(home.body);

  return NextResponse.json(
    {
      site,
      robotsChecked: robots.ok,
      crawlers,
      llmsTxt: { present: llms.ok && llms.body.trim().length > 0, url: `${base}/llms.txt` },
      structuredData: { present: structuredData },
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

// POST {site} -> a starter llms.txt draft built from the site's own <title>
// and meta description. Template-based, not AI-generated - no model call, no
// cost. Returned as text for the operator to review and publish themselves;
// this never writes to the live site.
export async function POST(req: Request) {
  const { site } = await req.json().catch(() => ({}));
  if (!site || typeof site !== "string" || !/^[a-z0-9.-]+$/i.test(site)) {
    return NextResponse.json({ error: "bad site" }, { status: 400 });
  }

  const home = await fetchText(`https://${site}/`);
  if (!home.ok) {
    return NextResponse.json({ error: `Could not reach https://${site}/` }, { status: 502 });
  }

  const title = home.body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || site;
  const description = home.body.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim()
    || home.body.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1]?.trim()
    || "";

  const draft = [
    `# ${title}`,
    "",
    description || "One or two sentences describing what this site/product does and who it's for.",
    "",
    "## About",
    `- Site: https://${site}`,
    "- Add 2-3 bullets on what makes this offering distinct.",
    "",
    "## Key pages",
    "- [Add your most important pages here, e.g. pricing, docs, product pages]",
    "",
    "## Contact",
    "- Add a contact or support link.",
  ].join("\n");

  return NextResponse.json({ site, draft }, { headers: { "cache-control": "no-store" } });
}
