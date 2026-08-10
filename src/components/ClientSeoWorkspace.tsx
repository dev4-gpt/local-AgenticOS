"use client";

// The hosted SEO surface, tab for tab with the local one. See
// clientSeoWorkspace.ts for what stands behind each tab and why.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Bot, Download, ExternalLink, FileText, Info, LoaderCircle, Rocket, Search, Sparkles, TrendingUp } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import {
  AEO_CRAWLERS,
  SEO_ARTICLE_PRESETS,
  SEO_NOTICES,
  SEO_RESEARCH_PRESETS,
  SEO_RESEARCH_RESULT_LIMIT,
  SEO_TABS,
  seoArticleGoal,
  seoArticleTitle,
  type SeoTab,
} from "@/lib/clientSeoWorkspace";

type Execution = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  errorCode: string | null;
  createdAt: string | null;
  title: string | null;
  artifactId: string | null;
};
type RecordItem = { id: string; title: string; content: string };

const ACCENT = "#5ab896";
const FIELD = { color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" } as const;
const ICONS: Record<SeoTab, React.ReactNode> = {
  research: <Search size={13} />, aeo: <Bot size={13} />, openseo: <TrendingUp size={13} />,
  generate: <Sparkles size={13} />, deploy: <Rocket size={13} />, history: <FileText size={13} />,
  transcripts: <FileText size={13} />, skill: <BookOpen size={13} />,
};

export default function ClientSeoWorkspace() {
  const [tab, setTab] = useState<SeoTab>("research");
  const [capabilities, setCapabilities] = useState<string[] | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [transcripts, setTranscripts] = useState<RecordItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Research state
  const [question, setQuestion] = useState("");
  const [ourStrategy, setOurStrategy] = useState("");
  // Generate state
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("");
  const [source, setSource] = useState("");
  // AEO state
  const [aeoSite, setAeoSite] = useState("");

  const load = useCallback(async () => {
    const [execRes, recRes, capRes] = await Promise.all([
      fetch("/api/client-runtime/executions?surface=seo", { cache: "no-store" }).catch(() => null),
      fetch("/api/client-runtime/records?kind=notebook", { cache: "no-store" }).catch(() => null),
      fetch("/api/capabilities", { cache: "no-store" }).catch(() => null),
    ]);
    const execData = await execRes?.json().catch(() => null);
    if (execRes?.ok && Array.isArray(execData?.executions)) setExecutions(execData.executions as Execution[]);
    const recData = await recRes?.json().catch(() => null);
    if (recRes?.ok && Array.isArray(recData?.records)) setTranscripts(recData.records as RecordItem[]);
    const capData = await capRes?.json().catch(() => null);
    // Read the real capability state rather than hardcoding a gate: a tab
    // should stop being gated the moment the capability is approved.
    setCapabilities(capRes?.ok && Array.isArray(capData?.capabilities) ? capData.capabilities.map((item: { id: string }) => item.id) : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const inFlight = executions.some((item) => item.status === "queued" || item.status === "running");
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  const researchEnabled = capabilities?.includes("seo-research") ?? false;
  const deliveryEnabled = capabilities?.includes("delivery") ?? false;
  const shipped = useMemo(() => executions.filter((item) => item.artifactId), [executions]);

  async function queue(title: string, goal: string, intent: "copy" | "brief") {
    if (busy) return;
    setBusy(true); setError("");
    const response = await fetch("/api/client-runtime/executions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface: "seo", title, goal, artifactIntent: intent }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "workspace_execution_queue_failed");
    else { await load(); setTab("history"); }
    setBusy(false);
  }

  async function download(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { setError(typeof data?.error === "string" ? data.error : "artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: ACCENT, borderColor: `${ACCENT}52`, background: `${ACCENT}1f` }}><Search size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">V. Govern · Search</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>SEO</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
            Research what already exists, write against it, and keep the trail. Market research and publishing each activate with their own approved connection.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--line-soft)" }}>
        {SEO_TABS.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)}
          className="inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: tab === item.key ? ACCENT : "transparent", color: tab === item.key ? "var(--cream)" : "var(--cream-mute)" }}>
          {ICONS[item.key]}{item.label}{item.key === "history" && shipped.length > 0 ? ` · ${shipped.length}` : ""}
        </button>)}
      </div>
    </section>

    {error && <ClientRuntimeNotice code={error} />}

    {tab === "research" && <>
      <Notice text={SEO_NOTICES.research} />
      {!researchEnabled && <ConfigPanel
        title="Market research is not enabled for this client"
        detail={`It runs through the approved research adapter, which needs this client's own provider credential, a scrape host allowlist, and its own budget. Searching is bounded to ${SEO_RESEARCH_RESULT_LIMIT} results per run and page scraping stays off unless asked for. Nothing on this surface reaches the web until that is approved.`} />}
      <section className="panel p-4 md:p-5">
        <div className="flex flex-wrap gap-2">
          {SEO_RESEARCH_PRESETS.map((preset) => <button key={preset.label} type="button" onClick={() => setQuestion(preset.question)}
            className="rounded-md border px-3 py-2 text-[11px]"
            style={{ borderColor: question === preset.question ? ACCENT : "var(--line-soft)", color: question === preset.question ? ACCENT : "var(--cream-dim)", background: "rgba(255,255,255,0.025)" }}>{preset.label}</button>)}
        </div>
        <Field label="The question" value={question} onChange={setQuestion} placeholder="What do you want to know about how others approach this?" />
        <Field label="Our current strategy" value={ourStrategy} onChange={setOurStrategy} multiline
          placeholder="What we do today, so the comparison has something to compare against." />
        <button type="button" disabled={!researchEnabled || busy || !question.trim() || !ourStrategy.trim()}
          className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
          style={{ background: ACCENT, color: "#07111d" }}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Search size={13} />}
          Search and compare
        </button>
        {!researchEnabled && <p className="mt-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>Enabled by approving the research adapter for this client.</p>}
      </section>
    </>}

    {tab === "aeo" && <>
      <Notice text="Answer Engine Optimisation: whether AI crawlers are allowed to read this site, whether it publishes an llms.txt, and whether its pages carry structured data. Read-only, on a site you name." />
      {!researchEnabled && <ConfigPanel
        title="AEO checks need the research adapter"
        detail="The check reads a named site's robots.txt, llms.txt and page markup. That is a fetch on this client's behalf, so it runs through the same approved adapter and host allowlist as market research, and reports nothing until that is approved." />}
      <section className="panel p-4 md:p-5">
        <Field label="Site to check" value={aeoSite} onChange={setAeoSite} placeholder="example.com" />
        <div className="mt-4 space-y-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>Crawlers reported</p>
          {AEO_CRAWLERS.map((crawler) => <div key={crawler.agent} className="flex items-center justify-between rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)" }}>
            <span style={{ color: "var(--cream-dim)" }}>{crawler.name}</span>
            <span className="font-mono text-[10px]" style={{ color: "var(--cream-mute)" }}>{crawler.agent}</span>
          </div>)}
        </div>
        <button type="button" disabled={!researchEnabled || !aeoSite.trim()}
          className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
          style={{ background: ACCENT, color: "#07111d" }}><Bot size={13} />Run the AEO check</button>
      </section>
    </>}

    {tab === "openseo" && <section className="panel p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md" style={{ color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.1)" }}><TrendingUp size={17} /></div>
        <div className="min-w-0">
          <p className="eyebrow">V. Govern · Search · OpenSEO</p>
          <h2 className="mt-2 text-[19px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Bring your own OpenSEO account</h2>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{SEO_NOTICES.openseo}</p>
        </div>
      </div>
      <a href="https://app.openseo.so" target="_blank" rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]"
        style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><ExternalLink size={13} />Open OpenSEO</a>
    </section>}

    {tab === "generate" && <section className="panel p-4 md:p-5">
      <div className="flex flex-wrap gap-2">
        {SEO_ARTICLE_PRESETS.map((preset) => <button key={preset.label} type="button" onClick={() => setDirection(preset.direction)}
          className="rounded-md border px-3 py-2 text-[11px]"
          style={{ borderColor: direction === preset.direction ? ACCENT : "var(--line-soft)", color: direction === preset.direction ? ACCENT : "var(--cream-dim)", background: "rgba(255,255,255,0.025)" }}>{preset.label}</button>)}
      </div>
      <Field label="Target query" value={query} onChange={setQuery} placeholder="What should this rank for?" />
      <Field label="How it should read" value={direction} onChange={setDirection} multiline placeholder="Audience, angle, and what the reader must be able to do afterwards." />
      <Field label="Source material · optional" value={source} onChange={setSource} multiline
        placeholder="Paste a transcript or research the article should be grounded in. Picking a transcript fills this in." />
      <button type="button" disabled={busy || !query.trim() || !direction.trim()}
        onClick={() => void queue(seoArticleTitle(query), seoArticleGoal({ query, direction, source }), "copy")}
        className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
        style={{ background: ACCENT, color: "#07111d" }}>
        {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}{busy ? "Queueing" : "Write the article"}
      </button>
    </section>}

    {tab === "deploy" && <>
      <Notice text={SEO_NOTICES.deploy} />
      <section className="panel p-5 md:p-6">
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--cream)" }}>Publishing</h2>
        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          {deliveryEnabled
            ? "Delivery is approved for this client. A published article is sent through the approved destination list, and every send is recorded."
            : "Delivery is not enabled for this client. Articles stay as downloadable tenant artifacts until a destination and its host allowlist are approved."}
        </p>
        <div className="mt-4 rounded-md border p-4 text-[11px] leading-relaxed" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>
          Every article in History is downloadable, so it can be published through whatever route this client has approved.
        </div>
      </section>
    </>}

    {tab === "history" && <section className="space-y-2">
      {executions.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>Nothing yet. Research a question or write an article and it lands here.</div>}
      {executions.map((execution) => <div key={execution.id} className="panel flex flex-wrap items-center justify-between gap-2 p-4">
        <div className="min-w-0">
          <p className="truncate text-[12px]" style={{ color: "var(--cream)" }}>{execution.title || "SEO run"}</p>
          <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>
            {execution.status}{execution.errorCode ? ` · ${execution.errorCode}` : ""}{execution.createdAt ? ` · ${new Date(execution.createdAt).toLocaleString()}` : ""}
          </p>
        </div>
        {execution.artifactId
          ? <button type="button" onClick={() => void download(execution.artifactId!)}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Download size={12} />Download</button>
          : <span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{execution.status === "failed" ? "no artifact" : "working"}</span>}
      </div>)}
    </section>}

    {tab === "transcripts" && <>
      <Notice text={SEO_NOTICES.transcripts} />
      <section className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--cream-mute)" }}>{transcripts.length} sources · most recent first</p>
        {transcripts.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>No sources yet. Import one in Notebook and it appears here.</div>}
        {transcripts.map((record) => <button key={record.id} type="button"
          onClick={() => { setSource(record.content.slice(0, 6_000)); setTab("generate"); }}
          className="panel block w-full p-4 text-left">
          <p className="truncate text-[12px]" style={{ color: "var(--cream)" }}>{record.title}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug" style={{ color: "var(--cream-dim)" }}>{record.content.slice(0, 200)}</p>
        </button>)}
      </section>
    </>}

    {tab === "skill" && <section className="panel p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md" style={{ color: ACCENT, border: `1px solid ${ACCENT}4d`, background: `${ACCENT}1a` }}><BookOpen size={17} /></div>
        <div className="min-w-0">
          <p className="eyebrow">V. Govern · Search · Skill</p>
          <h2 className="mt-2 text-[19px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>How the generator writes</h2>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>The rules the Generate tab follows, so the output is predictable rather than a surprise each time.</p>
        </div>
      </div>
      <ul className="mt-5 space-y-2 text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
        {[
          "Answer the query completely. A reader who came for this should not need a second page.",
          "Write for the reader, not for the keyword. No repetition to hit a density target.",
          "No invented statistics, quotes, customer names, or citations. A claim that needs a source it was not given is rewritten so it does not need one.",
          "Structure follows the argument, not a template: headings exist because the piece turns, not to hold keywords.",
          "The output is the article itself, not a brief describing it.",
        ].map((rule) => <li key={rule} className="flex gap-2"><span style={{ color: ACCENT }}>·</span>{rule}</li>)}
      </ul>
    </section>}
  </div>;
}

function Field({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; multiline?: boolean }) {
  return <label className="mt-3 block">
    <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>{label}</span>
    {multiline
      ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}
          className="min-h-[92px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={FIELD} />
      : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}
          className="w-full rounded-md border px-3 py-2.5 text-[12px]" style={FIELD} />}
  </label>;
}

function Notice({ text }: { text: string }) {
  return <section className="panel flex items-start gap-2.5 p-3.5">
    <Info size={14} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
    <p className="text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{text}</p>
  </section>;
}

function ConfigPanel({ title, detail }: { title: string; detail: string }) {
  return <section className="panel p-4 md:p-5" style={{ borderColor: "rgba(251,191,36,0.28)" }}>
    <p className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>{title}</p>
    <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{detail}</p>
  </section>;
}
