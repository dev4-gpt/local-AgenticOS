"use client";

// The hosted SEO surface. See clientSeoWorkspace.ts for why this is a rebuild
// on tenant lanes rather than a port of the local, machine-bound implementation.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, Info, LoaderCircle, Search, Send, Upload } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import {
  SEO_ARTICLE_PRESETS,
  SEO_PLAN_PRESETS,
  SEO_PUBLISH_NOTICE,
  SEO_RESEARCH_NOTICE,
  SEO_TABS,
  seoArticleGoal,
  seoPlanGoal,
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

const FIELD = { color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" } as const;
const ACCENT = "#5ab896";

export default function ClientSeoWorkspace() {
  const [tab, setTab] = useState<SeoTab>("plan");
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("");
  const [extra, setExtra] = useState("");
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/client-runtime/executions?surface=seo", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) { setError(typeof data?.error === "string" ? data.error : "workspace_execution_read_failed"); return; }
    setError("");
    setExecutions(Array.isArray(data?.executions) ? data.executions as Execution[] : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const inFlight = executions.some((item) => item.status === "queued" || item.status === "running");
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  const writing = tab === "article";
  const presets = writing ? SEO_ARTICLE_PRESETS : SEO_PLAN_PRESETS;

  async function run() {
    if (busy || !query.trim() || !direction.trim()) return;
    setBusy(true); setError("");
    const goal = writing
      ? seoArticleGoal({ query, direction, source: extra })
      : seoPlanGoal({ query, direction, data: extra });
    const response = await fetch("/api/client-runtime/executions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        surface: "seo",
        title: `${writing ? "Article" : "Plan"} · ${query.trim().slice(0, 120)}`,
        goal,
        artifactIntent: "brief",
      }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "workspace_execution_queue_failed");
    else { setExtra(""); await load(); setTab("history"); }
    setBusy(false);
  }

  async function download(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { setError(typeof data?.error === "string" ? data.error : "artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  const shipped = useMemo(() => executions.filter((item) => item.artifactId), [executions]);
  const ready = Boolean(query.trim() && direction.trim());

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: ACCENT, borderColor: `${ACCENT}52`, background: `${ACCENT}1f` }}><Search size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">V. Govern · Search</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>SEO</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
            Plan a target query, write the article, and keep the trail in this tenant. Live rank data and publishing each activate through their own approved connection.
          </p>
        </div>
        <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: `${ACCENT}47`, color: ACCENT, background: `${ACCENT}1a` }}>Tenant artifact</div>
      </div>
      <div className="mt-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--line-soft)" }}>
        {SEO_TABS.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)}
          className="border-b-2 px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: tab === item.key ? ACCENT : "transparent", color: tab === item.key ? "var(--cream)" : "var(--cream-mute)" }}>
          {item.key === "history" ? `${item.label} · ${shipped.length}` : item.label}
        </button>)}
      </div>
    </section>

    {error && <ClientRuntimeNotice code={error} />}

    {(tab === "plan" || tab === "article") && <>
      <section className="panel flex items-start gap-2.5 p-3.5">
        <Info size={14} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{SEO_RESEARCH_NOTICE}</p>
      </section>

      <section className="panel p-4 md:p-5">
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => <button key={preset.label} type="button" onClick={() => setDirection(preset.direction)}
            className="rounded-md border px-3 py-2 text-[11px]"
            style={{ borderColor: direction === preset.direction ? ACCENT : "var(--line-soft)", color: direction === preset.direction ? ACCENT : "var(--cream-dim)", background: "rgba(255,255,255,0.025)" }}>{preset.label}</button>)}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Target query</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What should this rank for?"
            className="w-full rounded-md border px-3 py-2.5 text-[12px]" style={FIELD} />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>{writing ? "How it should read" : "What to plan"}</span>
          <textarea value={direction} onChange={(event) => setDirection(event.target.value)}
            placeholder={writing ? "Audience, angle, and what the reader must be able to do afterwards." : "The site, the audience, and the pages or queries in scope."}
            className="min-h-[96px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={FIELD} />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>
            <Upload size={11} />{writing ? "Source material · optional" : "Your own data · optional"}
          </span>
          <textarea value={extra} onChange={(event) => setExtra(event.target.value)}
            placeholder={writing ? "Paste a transcript, notes, or research the article should be grounded in." : "Paste rankings, analytics, or competitor notes you already have."}
            className="min-h-[80px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={FIELD} />
          <span className="mt-1 block text-[10px]" style={{ color: "var(--cream-mute)" }}>Passed as material you supplied. Nothing here is fetched, and the run is told not to claim otherwise.</span>
        </label>

        <button type="button" disabled={!ready || busy} onClick={() => void run()}
          className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
          style={{ background: ACCENT, color: "#07111d" }}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : writing ? <Send size={13} /> : <FileText size={13} />}
          {busy ? "Queueing" : writing ? "Write the article" : "Build the plan"}
        </button>
      </section>
    </>}

    {tab === "history" && <section className="space-y-2">
      {executions.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>Nothing yet. Build a plan or write an article and it lands here.</div>}
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

    {tab === "publish" && <section className="panel p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md" style={{ color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.1)" }}><Info size={17} /></div>
        <div className="min-w-0">
          <p className="eyebrow">V. Govern · Search · Publish</p>
          <h2 className="mt-2 text-[19px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Publishing is a separate approval</h2>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{SEO_PUBLISH_NOTICE}</p>
        </div>
      </div>
      <div className="mt-5 rounded-md border p-4 text-[11px] leading-relaxed" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>
        Every article stays downloadable from the Library tab as a tenant artifact, so it can be reviewed and published through whatever route is approved for this client.
      </div>
    </section>}
  </div>;
}
