"use client";

import { useState } from "react";
import { BookOpenCheck, ExternalLink, FileText, KeyRound, LoaderCircle, Search, ShieldCheck, Sparkles } from "lucide-react";

type Source = { id: string; title: string; url: string; tab?: string; text: string; collectedAt: string };
type Run = { id: string; startUrl: string; scopePrefix: string; createdAt: string; sources: Source[]; skipped: string[] };

async function request(body: Record<string, unknown>) {
  const response = await fetch("/api/classroom-research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok || json.error) throw new Error(String(json.error || "Request failed."));
  return json;
}

export default function ClassroomResearchView() {
  const [url, setUrl] = useState("");
  const [scope, setScope] = useState("");
  const [maxPages, setMaxPages] = useState(25);
  const [confirmed, setConfirmed] = useState(false);
  const [loginId, setLoginId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("");

  async function signIn() {
    setBusy("login"); setError("");
    try { const result = await request({ action: "begin-login", startUrl: url }); setLoginId(result.loginId); setMessage("A browser window is open. Sign in and complete any verification yourself, then return here and save the session."); }
    catch (reason) { setError(String(reason)); }
    setBusy(null);
  }
  async function saveSession() {
    if (!loginId) return;
    setBusy("save"); setError("");
    try { await request({ action: "save-login", loginId }); setLoginId(null); setMessage("Session saved locally with owner-only file permissions. You can now collect the approved classroom scope."); }
    catch (reason) { setError(String(reason)); }
    setBusy(null);
  }
  async function collect() {
    setBusy("collect"); setError(""); setAnswer("");
    try { const result = await request({ action: "collect", startUrl: url, scopePrefix: scope || undefined, maxPages }); setRun(result.run); setMessage(`Collected ${result.run.sources.length} source${result.run.sources.length === 1 ? "" : "s"}. Each source below is the evidence pack for answers.`); }
    catch (reason) { setError(String(reason)); }
    setBusy(null);
  }
  async function ask() {
    if (!run || !question.trim()) return;
    setBusy("answer"); setError("");
    try { const result = await request({ action: "answer", runId: run.id, question }); setAnswer(result.answer); setModel(result.model); }
    catch (reason) { setError(String(reason)); }
    setBusy(null);
  }

  const disabled = !confirmed || !url.trim() || Boolean(busy);
  return <div className="space-y-5">
    <section className="panel p-5"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border" style={{ color: "#5eead4", borderColor: "rgba(94,234,212,.38)", background: "rgba(94,234,212,.10)" }}><BookOpenCheck size={20} /></div><div><p className="eyebrow">Private source-grounded research</p><h2 className="mt-1 text-lg font-semibold text-[var(--cream)]">Classroom Research</h2><p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--cream-dim)]">Collect the classroom you are authorized to access, preserve every page link, then ask the local model only about that evidence. This does not evade Cloudflare, CAPTCHA, access controls, or bot detection.</p></div></div></section>
    <section className="panel p-5 space-y-4"><div className="grid gap-3 md:grid-cols-[1fr_220px_120px]"><label><span className="eyebrow">Classroom URL</span><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.skool.com/your-classroom/classroom" className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,.035)", borderColor: "var(--line-soft)", color: "var(--cream)" }} /></label><label><span className="eyebrow">Allowed path</span><input value={scope} onChange={(event) => setScope(event.target.value)} placeholder="/your-classroom" className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,.035)", borderColor: "var(--line-soft)", color: "var(--cream)" }} /></label><label><span className="eyebrow">Page limit</span><input min="1" max="100" type="number" value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))} className="mt-1.5 w-full rounded-md border px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,.035)", borderColor: "var(--line-soft)", color: "var(--cream)" }} /></label></div><label className="flex gap-2 text-[11.5px] text-[var(--cream-dim)]"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />I own this account or have permission to collect this classroom, and its terms allow this use.</label><div className="flex flex-wrap gap-2"><button onClick={() => void signIn()} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ color: "#06211e", background: "#5eead4" }}>{busy === "login" ? <LoaderCircle size={13} className="animate-spin" /> : <KeyRound size={13} />}Open sign-in browser</button><button onClick={() => void saveSession()} disabled={!loginId || Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ color: "#5eead4", borderColor: "rgba(94,234,212,.45)" }}>{busy === "save" ? <LoaderCircle size={13} className="animate-spin" /> : <ShieldCheck size={13} />}I completed sign-in</button><button onClick={() => void collect()} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ color: "#c4b5fd", borderColor: "rgba(196,181,253,.45)" }}>{busy === "collect" ? <LoaderCircle size={13} className="animate-spin" /> : <Search size={13} />}Collect source pack</button></div>{message && <p className="rounded-md border border-emerald-300/25 bg-emerald-300/5 p-3 text-[11.5px] text-emerald-200">{message}</p>}{error && <p className="rounded-md border border-rose-300/25 bg-rose-300/5 p-3 text-[11.5px] text-rose-200">{error}</p>}</section>
    {run && <><section className="panel p-5"><div className="flex flex-wrap items-center gap-3"><div className="flex-1"><p className="eyebrow">Evidence-only answer</p><p className="mt-1 text-[12px] text-[var(--cream-dim)]">Uses your local Ollama model. It must cite every non-heading line or AgentOS rejects the response.</p></div><span className="text-[10px] text-[var(--cream-mute)]">{run.sources.length} sources · {run.scopePrefix}</span></div><div className="mt-4 flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} placeholder="What should I create from this classroom?" className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,.035)", borderColor: "var(--line-soft)", color: "var(--cream)" }} /><button onClick={() => void ask()} disabled={!question.trim() || Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-semibold disabled:opacity-40" style={{ color: "#1c102a", background: "#c4b5fd" }}>{busy === "answer" ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}Ask locally</button></div>{answer && <div className="mt-4 rounded-md border p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,.02)" }}><div className="mb-2 text-[10px] text-[var(--cream-mute)]">CITATION-VALIDATED · {model}</div><pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-[var(--cream-dim)]">{answer}</pre></div>}</section><section className="panel p-5"><div className="flex items-center gap-2"><FileText size={15} color="#5eead4" /><div><p className="eyebrow">Collected source pack</p><p className="mt-1 text-[11px] text-[var(--cream-mute)]">Open a source to verify the exact context behind its citation.</p></div></div><div className="mt-4 grid gap-2">{run.sources.map((source) => <article key={source.id} className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,.018)" }}><div className="flex gap-3"><span className="text-[10px] font-semibold" style={{ color: "#5eead4" }}>[{source.id}]</span><div className="min-w-0 flex-1"><a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--cream)] hover:text-[#5eead4]">{source.title}{source.tab ? ` · ${source.tab}` : ""}<ExternalLink size={11} /></a><p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-[var(--cream-mute)]">{source.text}</p></div></div></article>)}</div>{run.skipped.length > 0 && <details className="mt-4 text-[11px] text-[var(--cream-mute)]"><summary className="cursor-pointer">{run.skipped.length} skipped page{run.skipped.length === 1 ? "" : "s"}</summary><pre className="mt-2 whitespace-pre-wrap">{run.skipped.join("\n")}</pre></details>}</section></>}
  </div>;
}
