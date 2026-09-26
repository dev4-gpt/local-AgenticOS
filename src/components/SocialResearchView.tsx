"use client";

import { useState } from "react";
import { DatabaseZap, ExternalLink, FileJson2, LoaderCircle, Search, ShieldCheck, Sparkles } from "lucide-react";

type Source = { id: string; title: string; url: string; text: string };
type Run = { id: string; sources: Source[]; skipped: string[] };
type Mode = "bluesky-search" | "bluesky-feed" | "threads" | "snscrape-run" | "snscrape-import";

const modes: Array<{ id: Mode; label: string; note: string }> = [
  { id: "bluesky-search", label: "Bluesky search", note: "Direct public AT Protocol API · no login · free" },
  { id: "bluesky-feed", label: "Bluesky feed", note: "Direct public AT Protocol API · no login · free" },
  { id: "threads", label: "Threads", note: "Official Meta API · your connected account only" },
  { id: "snscrape-run", label: "snscrape local", note: "Your installed CLI · local output becomes cited sources" },
  { id: "snscrape-import", label: "Import export", note: "Paste user-provided JSONL · no bundled GPL code" },
];

async function request(body: Record<string, unknown>) {
  const response = await fetch("/api/social-research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok || json.error) throw new Error(String(json.error || "Request failed."));
  return json;
}

export default function SocialResearchView() {
  const [mode, setMode] = useState<Mode>("bluesky-search");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(25);
  const [jsonl, setJsonl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  async function collect() {
    setBusy(true); setError(""); setAnswer("");
    try {
      const result = mode === "snscrape-import"
        ? await request({ action: "snscrape-import", jsonl })
        : mode === "snscrape-run"
          ? await request({ action: "snscrape-run", mode: queryMode, query, limit })
        : mode === "threads"
          ? await request({ action: "threads", limit })
          : await request({ action: "bluesky", mode: mode === "bluesky-feed" ? "feed" : "search", query, limit });
      setRun(result.run); setMessage(`Saved ${result.run.sources.length} source${result.run.sources.length === 1 ? "" : "s"} as a citation-ready research pack.`);
    } catch (reason) { setError(String(reason)); }
    setBusy(false);
  }
  async function ask() {
    if (!run || !question.trim()) return;
    setBusy(true); setError("");
    try { const result = await request({ action: "answer", runId: run.id, question }); setAnswer(result.answer); }
    catch (reason) { setError(String(reason)); }
    setBusy(false);
  }
  const [queryMode, setQueryMode] = useState("twitter-search");
  const requiresQuery = mode === "bluesky-search" || mode === "bluesky-feed" || mode === "snscrape-run";
  const ready = !busy && (!requiresQuery || Boolean(query.trim())) && (mode !== "snscrape-import" || Boolean(jsonl.trim()));
  return <div className="space-y-5">
    <section className="panel p-5"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border" style={{ color: "#60a5fa", borderColor: "rgba(96,165,250,.4)", background: "rgba(96,165,250,.1)" }}><DatabaseZap size={20} /></div><div><p className="eyebrow">Citation-first social intelligence</p><h2 className="mt-1 text-lg font-semibold text-[var(--cream)]">Social Research</h2><p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--cream-dim)]">Turn permitted public data, official account APIs, or your own exports into a local source pack. Claims generated from it must cite the original post permalink.</p></div></div></section>
    <section className="panel p-5"><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">{modes.map((item) => <button key={item.id} type="button" onClick={() => { setMode(item.id); setError(""); }} className="rounded-md border p-3 text-left transition" style={{ borderColor: mode === item.id ? "rgba(96,165,250,.8)" : "var(--line-soft)", background: mode === item.id ? "rgba(96,165,250,.10)" : "rgba(255,255,255,.015)" }}><span className="block text-[12px] font-semibold text-[var(--cream)]">{item.label}</span><span className="mt-1 block text-[10px] leading-relaxed text-[var(--cream-mute)]">{item.note}</span></button>)}</div>
      {requiresQuery && <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_120px]">{mode === "snscrape-run" && <label><span className="eyebrow">Source mode</span><select value={queryMode} onChange={(event) => setQueryMode(event.target.value)} className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm" style={{ background: "#151528", borderColor: "var(--line-soft)", color: "var(--cream)" }}><option value="twitter-search">X search</option><option value="twitter-user">X user</option><option value="twitter-hashtag">X hashtag</option><option value="mastodon-user">Mastodon user</option><option value="reddit-search">Reddit search</option><option value="telegram-channel">Telegram channel</option></select></label>}<label><span className="eyebrow">{mode === "bluesky-feed" ? "Bluesky handle" : mode === "snscrape-run" ? "Query or handle" : "Search query"}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "bluesky-feed" ? "example.bsky.social" : mode === "snscrape-run" ? "example" : "agentic AI"} className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,.035)", borderColor: "var(--line-soft)", color: "var(--cream)" }} /></label><label><span className="eyebrow">Results</span><input type="number" min="1" max="100" value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,.035)", borderColor: "var(--line-soft)", color: "var(--cream)" }} /></label></div>}
      {mode === "threads" && <div className="mt-4 rounded-md border p-3 text-[11px] leading-relaxed text-[var(--cream-dim)]" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,.02)" }}><ShieldCheck size={13} className="mr-1 inline" color="#5eead4" />This reads <strong>your connected Threads account</strong> through Meta&apos;s official API. Configure <code>AGENTIC_OS_THREADS_ACCESS_TOKEN</code> in the local server environment after completing Meta OAuth; the dashboard never receives or stores the token.</div>}
      {mode === "snscrape-run" && <p className="mt-4 text-[11px] leading-relaxed text-[var(--cream-mute)]"><ShieldCheck size={12} className="mr-1 inline" color="#5eead4" />AgentOS invokes only its fixed <code>snscrape --jsonl --max-results …</code> template. Install and own the GPL tool yourself; no proxy rotation, login automation, or bypass is added.</p>}
      {mode === "snscrape-import" && <label className="mt-4 block"><span className="eyebrow">snscrape JSONL export</span><textarea value={jsonl} onChange={(event) => setJsonl(event.target.value)} rows={8} placeholder={'Run snscrape yourself, for example:\nsnscrape --jsonl twitter-user example\n\nPaste the resulting JSONL here.'} className="mt-1.5 w-full rounded-md border px-3 py-2 font-mono text-[11px]" style={{ background: "rgba(255,255,255,.035)", borderColor: "var(--line-soft)", color: "var(--cream)" }} /></label>}
      <button onClick={() => void collect()} disabled={!ready} className="mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ color: "#07111d", background: "#60a5fa" }}>{busy ? <LoaderCircle size={13} className="animate-spin" /> : mode === "snscrape-import" ? <FileJson2 size={13} /> : <Search size={13} />}{mode === "snscrape-import" ? "Import source pack" : "Collect source pack"}</button>
      {message && <p className="mt-3 rounded-md border border-emerald-300/25 bg-emerald-300/5 p-3 text-[11.5px] text-emerald-200">{message}</p>}{error && <p className="mt-3 rounded-md border border-rose-300/25 bg-rose-300/5 p-3 text-[11.5px] text-rose-200">{error}</p>}</section>
    {run && <><section className="panel p-5"><p className="eyebrow">Evidence-only answer</p><div className="mt-3 flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} placeholder="What content patterns stand out?" className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,.035)", borderColor: "var(--line-soft)", color: "var(--cream)" }} /><button onClick={() => void ask()} disabled={busy || !question.trim()} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ color: "#1c102a", background: "#c4b5fd" }}>{busy ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}Ask locally</button></div>{answer && <pre className="mt-4 whitespace-pre-wrap rounded-md border p-4 font-sans text-[12.5px] leading-relaxed text-[var(--cream-dim)]" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,.02)" }}>{answer}</pre>}</section><section className="panel p-5"><p className="eyebrow">Source links</p><div className="mt-3 grid gap-2">{run.sources.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="rounded-md border p-3 transition hover:border-blue-300/50" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,.018)" }}><span className="mr-2 text-[10px] font-semibold text-blue-300">[{item.id}]</span><span className="text-[12px] font-medium text-[var(--cream)]">{item.title}</span><ExternalLink size={11} className="ml-1 inline text-[var(--cream-mute)]" /><p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--cream-mute)]">{item.text}</p></a>)}</div></section></>}
  </div>;
}
