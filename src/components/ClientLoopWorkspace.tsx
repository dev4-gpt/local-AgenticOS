"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Download, LoaderCircle, RefreshCw, Repeat, Trash2, TriangleAlert, XCircle } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import {
  LOOP_DEFAULT_ROUNDS, LOOP_MAX_ROUNDS, loopFormatMicros, loopStatusLabel, loopTimeAgo,
  type LoopRound, type LoopRun,
} from "@/lib/clientLoopAdapter";

const ACCENT = "#5eead4";

export default function ClientLoopWorkspace() {
  const [runs, setRuns] = useState<LoopRun[]>([]);
  const [rounds, setRounds] = useState<LoopRound[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [goal, setGoal] = useState("");
  const [maxRounds, setMaxRounds] = useState(LOOP_DEFAULT_ROUNDS);

  const load = useCallback(async () => {
    const response = await fetch("/api/client-runtime/loop", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) { setError(typeof data?.error === "string" ? data.error : "loop_read_failed"); return; }
    if (data?.configured === false) { setConfigured(false); setError("loop_schema_missing"); return; }
    setConfigured(true); setError("");
    const next = Array.isArray(data?.runs) ? data.runs as LoopRun[] : [];
    setRuns(next);
    setSelectedId((current) => current && next.some((run) => run.id === current) ? current : (next[0]?.id ?? null));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const inFlight = runs.some((run) => run.status === "queued" || run.status === "running");
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  const loadRounds = useCallback(async (runId: string) => {
    const response = await fetch(`/api/client-runtime/loop?runId=${encodeURIComponent(runId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setRounds(response?.ok && Array.isArray(data?.rounds) ? data.rounds as LoopRound[] : []);
  }, []);

  useEffect(() => { if (selectedId) void loadRounds(selectedId); else setRounds([]); }, [selectedId, runs, loadRounds]);

  async function start() {
    if (!goal.trim() || busy) return;
    setBusy(true); setError("");
    const response = await fetch("/api/client-runtime/loop", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: goal.trim(), maxRounds }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "loop_start_failed");
    else { setGoal(""); await load(); if (typeof data?.runId === "string") setSelectedId(data.runId); }
    setBusy(false);
  }

  async function remove(id: string) {
    const response = await fetch(`/api/client-runtime/loop?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) { setError("loop_delete_failed"); return; }
    setSelectedId(null); await load();
  }

  async function openArtifact(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { setError("artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  const selected = runs.find((run) => run.id === selectedId) ?? null;

  if (!configured) return <div className="space-y-5 pb-8">
    <section className="panel p-6 text-center">
      <TriangleAlert size={24} className="mx-auto" style={{ color: "#fbbf24" }} />
      <h2 className="mt-3 text-[14px] font-semibold" style={{ color: "var(--cream)" }}>Loop tables are not in this tenant yet</h2>
      <p className="mx-auto mt-2 max-w-[520px] text-[11.5px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>
        Apply <span className="font-mono">product-experience/supabase-client-loop.sql</span> to this Supabase project, then reload.
      </p>
    </section>
    <ClientRuntimeNotice code="loop_schema_missing" />
  </div>;

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: ACCENT, borderColor: `${ACCENT}52`, background: `${ACCENT}1f` }}><Repeat size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">III. Orchestrate · Iterations</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Loop Engineering</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
            Define what &ldquo;done&rdquo; looks like. A builder produces the work, an adversarial judge grades it, and the builder fixes exactly what the judge raised — until it passes or hits the round cap.
          </p>
        </div>
        <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "rgba(90,184,150,0.28)", color: "#5ab896", background: "rgba(90,184,150,0.1)" }}>Round cap enforced</div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: "var(--cream-dim)" }}>
        <span>Target</span><ArrowRight size={13} /><span>Build</span><ArrowRight size={13} /><span>Judge</span><ArrowRight size={13} /><span>Revise</span><ArrowRight size={13} /><span>Pass</span>
      </div>
    </section>

    <section className="panel p-4 md:p-5">
      <p className="text-[11px] font-semibold" style={{ color: ACCENT }}>Definition of done</p>
      <textarea value={goal} onChange={(event) => setGoal(event.target.value)}
        placeholder="What must be true for this to be finished? Be specific — the judge grades against exactly this."
        className="mt-2 min-h-[92px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed"
        style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--cream-mute)" }}>
          Round cap
          <select value={maxRounds} onChange={(event) => setMaxRounds(Number(event.target.value))} className="rounded-md border px-2 py-1.5 text-[11px]" style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }}>
            {Array.from({ length: LOOP_MAX_ROUNDS }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <span>· each round is a build plus a judge, so the cap bounds the spend</span>
        </label>
        <button type="button" disabled={!goal.trim() || busy} onClick={() => void start()}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40" style={{ background: ACCENT, color: "#06251f" }}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Repeat size={13} />}{busy ? "Queueing" : "Run loop"}
        </button>
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
          <h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Loops</h2>
          <button type="button" onClick={() => void load()} title="Refresh loops" className="p-1.5" style={{ color: "var(--cream-mute)" }}><RefreshCw size={13} /></button>
        </div>
        <div className="max-h-[520px] space-y-2 overflow-y-auto p-3">
          {runs.length === 0 && <p className="p-3 text-center text-[11px]" style={{ color: "var(--cream-mute)" }}>No loops yet.</p>}
          {runs.map((run) => <button key={run.id} type="button" onClick={() => setSelectedId(run.id)} className="w-full rounded-md border p-2.5 text-left"
            style={{ borderColor: run.id === selectedId ? `${ACCENT}80` : "var(--line-soft)", background: run.id === selectedId ? `${ACCENT}14` : "transparent" }}>
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-[11.5px] font-medium" style={{ color: "var(--cream)" }}>{run.title}</p>
              <StatusChip status={run.status} />
            </div>
            <p className="mt-1 text-[9.5px]" style={{ color: "var(--cream-mute)" }}>
              {run.roundsCompleted}/{run.maxRounds} rounds{run.bestScore !== null ? ` · best ${run.bestScore}` : ""} · {loopTimeAgo(run.createdAt)}
            </p>
          </button>)}
        </div>
      </div>

      <div className="panel overflow-hidden">
        {selected ? <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{selected.title}</p>
              <p className="mt-0.5 text-[10px]" style={{ color: "var(--cream-mute)" }}>
                {loopStatusLabel(selected)} · {loopFormatMicros(selected.costMicros)}
                {selected.builderModel ? ` · builder ${selected.builderModel}` : ""}
                {selected.judgeModel && selected.judgeModel !== selected.builderModel ? ` · judge ${selected.judgeModel}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => void remove(selected.id)} title="Delete loop" className="rounded-md border p-1.5" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><Trash2 size={12} /></button>
          </div>
          <div className="space-y-3 p-4">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Definition of done</p>
              <p className="whitespace-pre-wrap rounded-md border p-2.5 text-[11.5px] leading-relaxed" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.018)", color: "var(--cream-dim)" }}>{selected.goal}</p>
            </div>

            <div>
              <p className="mb-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Rounds</p>
              {rounds.length === 0 && <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>
                {selected.status === "queued" ? "Queued — the first round starts when the runner claims it." : "No rounds recorded yet."}
              </p>}
              <div className="space-y-2">{rounds.map((entry) => <motion.div key={entry.id} layout className="rounded-md border p-3"
                style={{ borderColor: entry.passed ? "rgba(90,184,150,0.4)" : "var(--line-soft)", background: entry.passed ? "rgba(90,184,150,0.07)" : "rgba(255,255,255,0.018)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  {entry.passed ? <CheckCircle2 size={13} color="#5ab896" /> : <XCircle size={13} color={entry.errorCode ? "#fca5a5" : "#fbbf24"} />}
                  <span className="text-[11.5px] font-medium" style={{ color: "var(--cream)" }}>Round {entry.round}</span>
                  {entry.score !== null && <span className="rounded px-1.5 py-0.5 text-[9.5px]" style={{ background: "rgba(255,255,255,0.06)", color: "var(--cream-dim)" }}>score {entry.score}</span>}
                  {entry.artifactChars > 0 && <span className="text-[9.5px]" style={{ color: "var(--cream-mute)" }}>{entry.artifactChars.toLocaleString()} chars</span>}
                  {entry.errorCode && <span className="text-[9.5px]" style={{ color: "#fca5a5" }}>{entry.errorCode}</span>}
                </div>
                {entry.summary && <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{entry.summary}</p>}
                {entry.issues.length > 0 && <ul className="mt-1.5 space-y-0.5">
                  {entry.issues.map((issue, index) => <li key={index} className="text-[10.5px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>— {issue}</li>)}
                </ul>}
              </motion.div>)}</div>
            </div>

            {selected.finalSummary && <p className="rounded-md border p-2.5 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>{selected.finalSummary}</p>}

            {selected.buildPreviewHtml && <div>
              <p className="mb-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Sandboxed result preview</p>
              <iframe title={`${selected.title} result`} sandbox="" referrerPolicy="no-referrer" srcDoc={sandboxed(selected.buildPreviewHtml)} className="h-[260px] w-full rounded-md border bg-white" style={{ borderColor: "var(--line-soft)" }} />
            </div>}
            {selected.buildArtifactId && <button type="button" onClick={() => openArtifact(selected.buildArtifactId!)} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10.5px]" style={{ borderColor: `${ACCENT}59`, color: ACCENT }}><Download size={11} />Signed artifact download</button>}
          </div>
        </> : <div className="grid min-h-[220px] place-items-center p-6 text-center">
          <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>Define what done looks like and run a loop.</p>
        </div>}
      </div>
    </section>

    {error && <ClientRuntimeNotice code={error} />}
  </div>;
}

function StatusChip({ status }: { status: LoopRun["status"] }) {
  const color = status === "passed" ? "#5ab896" : status === "failed" || status === "cancelled" ? "#fca5a5" : status === "exhausted" ? "#fbbf24" : "#5eead4";
  return <span className="shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em]" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>{status}</span>;
}

function sandboxed(html: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;">`;
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<head([^>]*)>/i, `<head$1>${policy}`);
}
