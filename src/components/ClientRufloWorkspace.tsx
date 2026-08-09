"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Download, LoaderCircle, Network, RotateCw, Trash2, TriangleAlert, XCircle } from "lucide-react";
import ClientRuntimeNotice from "@/components/ClientRuntimeNotice";
import {
  RUFLO_DEFAULT_PRESET, rufloFormatMicros, rufloProgress, rufloStatusLabel, rufloTimeAgo,
  type RufloAgent, type RufloSwarm,
} from "@/lib/clientRufloAdapter";

const ACCENT = "#d4a574";
type Preset = { key: string; label: string; blurb: string; agents: number };

export default function ClientRufloWorkspace() {
  const [swarms, setSwarms] = useState<RufloSwarm[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [agents, setAgents] = useState<RufloAgent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [objective, setObjective] = useState("");
  const [preset, setPreset] = useState(RUFLO_DEFAULT_PRESET);

  const load = useCallback(async () => {
    const response = await fetch("/api/client-runtime/ruflo", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) { setError(typeof data?.error === "string" ? data.error : "ruflo_read_failed"); return; }
    setPresets(Array.isArray(data?.presets) ? data.presets as Preset[] : []);
    if (data?.configured === false) { setConfigured(false); setError("ruflo_schema_missing"); return; }
    setConfigured(true); setError("");
    const next = Array.isArray(data?.swarms) ? data.swarms as RufloSwarm[] : [];
    setSwarms(next);
    setSelectedId((current) => current && next.some((swarm) => swarm.id === current) ? current : (next[0]?.id ?? null));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const inFlight = swarms.some((swarm) => swarm.status === "queued" || swarm.status === "running");
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => window.clearInterval(timer);
  }, [inFlight, load]);

  const loadAgents = useCallback(async (swarmId: string) => {
    const response = await fetch(`/api/client-runtime/ruflo?swarmId=${encodeURIComponent(swarmId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setAgents(response?.ok && Array.isArray(data?.agents) ? data.agents as RufloAgent[] : []);
  }, []);

  useEffect(() => { if (selectedId) void loadAgents(selectedId); else setAgents([]); }, [selectedId, swarms, loadAgents]);

  async function launch() {
    if (!objective.trim() || busy) return;
    setBusy(true); setError("");
    const response = await fetch("/api/client-runtime/ruflo", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ objective: objective.trim(), preset }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) setError(typeof data?.error === "string" ? data.error : "ruflo_launch_failed");
    else { setObjective(""); await load(); if (typeof data?.swarmId === "string") setSelectedId(data.swarmId); }
    setBusy(false);
  }

  async function remove(id: string) {
    const response = await fetch(`/api/client-runtime/ruflo?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) { setError("ruflo_delete_failed"); return; }
    setSelectedId(null); await load();
  }

  async function openArtifact(artifactId: string) {
    const response = await fetch(`/api/client-runtime/artifacts?id=${encodeURIComponent(artifactId)}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || typeof data?.downloadUrl !== "string") { setError("artifact_download_failed"); return; }
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  const selected = swarms.find((swarm) => swarm.id === selectedId) ?? null;
  const activePreset = presets.find((entry) => entry.key === preset);

  if (!configured) return <div className="space-y-5 pb-8">
    <section className="panel p-6 text-center">
      <TriangleAlert size={24} className="mx-auto" style={{ color: "#fbbf24" }} />
      <h2 className="mt-3 text-[14px] font-semibold" style={{ color: "var(--cream)" }}>Ruflo tables are not in this tenant yet</h2>
      <p className="mx-auto mt-2 max-w-[520px] text-[11.5px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>
        Apply <span className="font-mono">product-experience/supabase-client-ruflo.sql</span> to this Supabase project, then reload.
      </p>
    </section>
    <ClientRuntimeNotice code="ruflo_schema_missing" />
  </div>;

  return <div className="space-y-5 pb-8">
    <section className="panel p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-10 w-10 place-items-center rounded-md border" style={{ color: ACCENT, borderColor: `${ACCENT}52`, background: `${ACCENT}1f` }}><Network size={18} /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">III. Orchestrate · Swarms</p>
          <h1 className="mt-2 text-[26px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Ruflo</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
            One objective, worked by a named roster of specialists each from their own angle, then synthesised into a single plan. Agents run on the approved provider lane; there is no CLI on this runtime.
          </p>
        </div>
        <div className="rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "rgba(90,184,150,0.28)", color: "#5ab896", background: "rgba(90,184,150,0.1)" }}>Roster bounded</div>
      </div>
    </section>

    <section className="panel p-4 md:p-5">
      <p className="text-[11px] font-semibold" style={{ color: ACCENT }}>Objective</p>
      <textarea value={objective} onChange={(event) => setObjective(event.target.value)}
        placeholder="What should the team work on? Every specialist sees this and covers their own angle."
        className="mt-2 min-h-[84px] w-full resize-y rounded-md border px-3 py-2.5 text-[12px] leading-relaxed"
        style={{ color: "var(--cream)", background: "rgba(255,255,255,0.035)", borderColor: "var(--line-soft)" }} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((entry) => <button key={entry.key} type="button" onClick={() => setPreset(entry.key)}
            className="rounded-md border px-2.5 py-1.5 text-[11px]"
            style={{ borderColor: preset === entry.key ? ACCENT : "var(--line-soft)", background: preset === entry.key ? `${ACCENT}1e` : "transparent", color: preset === entry.key ? ACCENT : "var(--cream-mute)" }}>
            {entry.label} · {entry.agents}
          </button>)}
        </div>
        <button type="button" disabled={!objective.trim() || busy} onClick={() => void launch()}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[11px] font-semibold disabled:opacity-40" style={{ background: ACCENT, color: "#1a1206" }}>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Network size={13} />}{busy ? "Launching" : "Launch swarm"}
        </button>
      </div>
      {activePreset && <p className="mt-2 text-[10.5px]" style={{ color: "var(--cream-mute)" }}>{activePreset.blurb}</p>}
    </section>

    <section className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
          <h2 className="text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Swarms</h2>
          <button type="button" onClick={() => void load()} title="Refresh swarms" className="p-1.5" style={{ color: "var(--cream-mute)" }}><RotateCw size={13} /></button>
        </div>
        <div className="max-h-[540px] space-y-2 overflow-y-auto p-3">
          {swarms.length === 0 && <p className="p-3 text-center text-[11px]" style={{ color: "var(--cream-mute)" }}>No swarms yet.</p>}
          {swarms.map((swarm) => <button key={swarm.id} type="button" onClick={() => setSelectedId(swarm.id)} className="w-full rounded-md border p-2.5 text-left"
            style={{ borderColor: swarm.id === selectedId ? `${ACCENT}80` : "var(--line-soft)", background: swarm.id === selectedId ? `${ACCENT}14` : "transparent" }}>
            <p className="line-clamp-2 text-[11.5px] font-medium" style={{ color: "var(--cream)" }}>{swarm.objective}</p>
            <p className="mt-1 text-[9.5px]" style={{ color: "var(--cream-mute)" }}>{swarm.preset} · {rufloStatusLabel(swarm)} · {rufloTimeAgo(swarm.createdAt)}</p>
            <div className="mt-1.5 h-1 w-full rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div className="h-full rounded-full" style={{ width: `${rufloProgress(swarm)}%`, background: swarm.failedCount > 0 ? "#fbbf24" : ACCENT }} />
            </div>
          </button>)}
        </div>
      </div>

      <div className="panel overflow-hidden">
        {selected ? <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{selected.objective}</p>
              <p className="mt-0.5 text-[10px]" style={{ color: "var(--cream-mute)" }}>
                {rufloStatusLabel(selected)} · {selected.topology} · {rufloFormatMicros(selected.costMicros)}{selected.model ? ` · ${selected.model}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => void remove(selected.id)} title="Delete swarm" className="rounded-md border p-1.5" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}><Trash2 size={12} /></button>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {agents.map((agent) => <motion.div key={agent.id} layout className="rounded-md border p-2.5"
                style={{ borderColor: agent.status === "done" ? "rgba(90,184,150,0.35)" : agent.status === "failed" ? "rgba(248,113,113,0.35)" : "var(--line-soft)", background: "rgba(255,255,255,0.018)" }}>
                <div className="flex items-center gap-1.5">
                  {agent.status === "done" ? <CheckCircle2 size={12} color="#5ab896" />
                    : agent.status === "failed" ? <XCircle size={12} color="#fca5a5" />
                    : agent.status === "running" ? <LoaderCircle size={12} className="animate-spin" color="#fbbf24" />
                    : <span className="h-2 w-2 rounded-full" style={{ background: "var(--cream-mute)" }} />}
                  <span className="text-[11px] font-medium" style={{ color: "var(--cream)" }}>{agent.name.replace(/-/g, " ")}</span>
                  <span className="ml-auto text-[9px] uppercase" style={{ color: "var(--cream-mute)" }}>{agent.agentType}</span>
                </div>
                {agent.output && <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-[10.5px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>{agent.output}</p>}
                {agent.errorCode && <p className="mt-1.5 text-[10px]" style={{ color: "#fca5a5" }}>{agent.errorCode}</p>}
              </motion.div>)}
              {agents.length === 0 && <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>Roster loading…</p>}
            </div>

            {selected.report && <div>
              <p className="mb-1.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Coordinator synthesis</p>
              <iframe title="Swarm report" sandbox="" referrerPolicy="no-referrer" srcDoc={sandboxed(selected.report)} className="h-[300px] w-full rounded-md border bg-white" style={{ borderColor: "var(--line-soft)" }} />
            </div>}
            {selected.reportArtifactId && <button type="button" onClick={() => openArtifact(selected.reportArtifactId!)} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10.5px]" style={{ borderColor: `${ACCENT}59`, color: ACCENT }}><Download size={11} />Signed report download</button>}
          </div>
        </> : <div className="grid min-h-[220px] place-items-center p-6 text-center">
          <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>Launch a swarm to see its roster work the objective.</p>
        </div>}
      </div>
    </section>

    {error && <ClientRuntimeNotice code={error} />}
  </div>;
}

function sandboxed(html: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;">`;
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<head([^>]*)>/i, `<head$1>${policy}`);
}
