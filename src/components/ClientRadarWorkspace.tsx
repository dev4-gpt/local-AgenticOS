"use client";

// The hosted Radar, structured like the local one: signals on one side,
// published work on the other, the oracle between them. See
// clientRadarWorkspace.ts for what the live sweep needs and cannot have here.

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Info, LoaderCircle, Radar, Send } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import ClientSpendMeter from "@/components/ClientSpendMeter";
import {
  RADAR_FORMATS,
  RADAR_PUBLISH_NOTICE,
  RADAR_SIGNAL_PRESETS,
  RADAR_SWEEP_NOTICE,
  RADAR_TABS,
  radarDraftGoal,
  radarFormat,
  radarSignalTitle,
  type RadarFormat,
  type RadarTab,
} from "@/lib/clientRadarWorkspace";

// The orb is pure three.js against a static asset, so it carries into the
// tenant unchanged. ssr:false because it mounts a WebGL canvas.
const RadarOrb = dynamic(() => import("./RadarOrb"), { ssr: false });

type Execution = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  errorCode: string | null;
  createdAt: string | null;
  title: string | null;
  artifactId: string | null;
};

const ACCENT = "#f472b6";
const FIELD = { color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" } as const;

export default function ClientRadarWorkspace() {
  const [tab, setTab] = useState<RadarTab>("signals");
  const [headline, setHeadline] = useState("");
  const [whyNow, setWhyNow] = useState("");
  const [angle, setAngle] = useState("");
  const [format, setFormat] = useState<RadarFormat>("post");
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/client-runtime/executions?surface=radar", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) { setError(typeof data?.error === "string" ? data.error : "workspace_execution_read_failed"); return; }
    setError("");
    setExecutions(Array.isArray(data?.executions) ? data.executions as Execution[] : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // The orb sweeps while real work is in flight. It is a status indicator, not
  // an ornament: nothing animates when nothing is running.
  const sweeping = executions.some((item) => item.status === "queued" || item.status === "running");
  useEffect(() => {
    if (!sweeping) return;
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [sweeping, load]);

  const published = useMemo(() => executions.filter((item) => item.artifactId), [executions]);
  const inFlight = useMemo(() => executions.filter((item) => !item.artifactId), [executions]);

  async function draft() {
    if (busy || !headline.trim()) return;
    setBusy(true); setError("");
    const response = await fetch("/api/client-runtime/executions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        surface: "radar",
        title: radarSignalTitle({ headline, format }),
        goal: radarDraftGoal({ headline, whyNow, angle, format }),
        // The Radar produces the piece, not a plan for the piece.
        artifactIntent: "copy",
      }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "workspace_execution_queue_failed");
    else { setHeadline(""); setWhyNow(""); setAngle(""); await load(); }
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
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: ACCENT, borderColor: `${ACCENT}52`, background: `${ACCENT}1f` }}><Radar size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">VI. Deliver · Radar</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>The Radar</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
            Bring what you have noticed and turn it into something worth publishing — the story, your angle, and a ready hook. The oracle sweeps while a draft is being written.
          </p>
        </div>
        <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: sweeping ? `${ACCENT}70` : "rgba(90,184,150,0.28)", color: sweeping ? ACCENT : "#5ab896", background: sweeping ? `${ACCENT}1a` : "rgba(90,184,150,0.1)" }}>
          {sweeping ? "Sweeping" : "Idle"} · {published.length} published
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border" style={{ borderColor: "var(--line-soft)", background: "radial-gradient(circle at 50% 40%, rgba(244,114,182,0.10), rgba(0,0,0,0.35))" }}>
        <div className="h-[240px] w-full"><RadarOrb image="/radar/oracle-a.png" sweeping={sweeping} /></div>
      </div>

      <div className="mt-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--line-soft)" }}>
        {RADAR_TABS.map((item) => <button key={item.key} type="button" onClick={() => setTab(item.key)}
          className="border-b-2 px-3 py-2 text-[11px] font-medium"
          style={{ borderColor: tab === item.key ? ACCENT : "transparent", color: tab === item.key ? "var(--cream)" : "var(--cream-mute)" }}>
          {item.key === "published" ? `${item.label} · ${published.length}` : item.label}
        </button>)}
      </div>
    </section>

    <ClientSpendMeter />
    {error && <ClientRuntimeNotice code={error} />}

    {tab === "signals" && <>
      <section className="panel flex items-start gap-2.5 p-3.5">
        <Info size={14} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{RADAR_SWEEP_NOTICE}</p>
      </section>

      <section className="panel p-4 md:p-5">
        <div className="flex flex-wrap gap-2">
          {RADAR_SIGNAL_PRESETS.map((preset) => <button key={preset.label} type="button"
            onClick={() => { setHeadline(preset.headline); setWhyNow(preset.whyNow); setAngle(preset.angle); }}
            className="rounded-md border px-3 py-2 text-[11px]"
            style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)", background: "rgba(255,255,255,0.025)" }}>{preset.label}</button>)}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>The signal</span>
          <input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="What did you notice?"
            className="w-full rounded-md border px-3 py-2.5 text-[12px]" style={FIELD} />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Why now · optional</span>
          <input value={whyNow} onChange={(event) => setWhyNow(event.target.value)} placeholder="What makes this worth saying this week?"
            className="w-full rounded-md border px-3 py-2.5 text-[12px]" style={FIELD} />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Your angle · optional</span>
          <textarea value={angle} onChange={(event) => setAngle(event.target.value)} placeholder="The position you want to take on it."
            className="min-h-[72px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed" style={FIELD} />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          {RADAR_FORMATS.map((item) => <button key={item.key} type="button" onClick={() => setFormat(radarFormat(item.key))}
            className="rounded-md border px-3 py-1.5 text-[11px]"
            style={{ color: format === item.key ? "#07111d" : "var(--cream-dim)", background: format === item.key ? ACCENT : "rgba(255,255,255,0.03)", borderColor: format === item.key ? ACCENT : "var(--line-soft)" }}>{item.label}</button>)}
        </div>

        <button type="button" disabled={busy || !headline.trim()} onClick={() => void draft()}
          className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40"
          style={{ background: ACCENT, color: "#07111d" }}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />}{busy ? "Consulting" : "Consult the oracle"}
        </button>
      </section>

      {inFlight.length > 0 && <section className="space-y-2">
        {inFlight.map((execution) => <div key={execution.id} className="panel flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="min-w-0">
            <p className="truncate text-[12px]" style={{ color: "var(--cream)" }}>{execution.title || "Signal"}</p>
            <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{execution.status}{execution.errorCode ? ` · ${execution.errorCode}` : ""}</p>
          </div>
          <span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{execution.status === "failed" ? "no draft produced" : "sweeping"}</span>
        </div>)}
      </section>}
    </>}

    {tab === "published" && <>
      <section className="panel flex items-start gap-2.5 p-3.5">
        <Info size={14} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{RADAR_PUBLISH_NOTICE}</p>
      </section>
      <section className="space-y-2">
        {published.length === 0 && <div className="panel p-6 text-center text-[12px]" style={{ color: "var(--cream-mute)" }}>Nothing published yet. Consult the oracle on a signal and the draft lands here.</div>}
        {published.map((execution) => <div key={execution.id} className="panel flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="min-w-0">
            <p className="truncate text-[12px]" style={{ color: "var(--cream)" }}>{execution.title || "Draft"}</p>
            <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{execution.createdAt ? new Date(execution.createdAt).toLocaleString() : ""}</p>
          </div>
          <button type="button" onClick={() => void download(execution.artifactId!)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}><Download size={12} />Download</button>
        </div>)}
      </section>
    </>}
  </div>;
}
