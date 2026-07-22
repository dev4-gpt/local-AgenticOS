"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Blocks, BrainCircuit, ExternalLink, KeyRound, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { CAPABILITIES, type Capability } from "@/lib/capabilities";

type Filter = "all" | "built-in" | "operator";

const statusStyle = {
  active: { label: "Active", color: "#34d399" },
  reviewed: { label: "Reviewed", color: "#fbbf24" },
  planned: { label: "Planned", color: "#94a3b8" },
} as const;

export default function CapabilitiesView() {
  // The registry is a reviewed, client-safe product contract. Render it
  // immediately; the route remains available for other internal consumers.
  const [capabilities, setCapabilities] = useState<Capability[]>(CAPABILITIES);
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/capabilities")
      .then((response) => response.json())
      .then((data) => { if (data.ok) setCapabilities(data.capabilities); else setNotice("The capability registry could not be loaded."); })
      .catch(() => setNotice("The capability registry could not be reached."));
  }, []);

  const shown = useMemo(() => capabilities.filter((capability) => filter === "all" || capability.audience === filter), [capabilities, filter]);

  return <div className="pb-8 space-y-5">
    <section className="panel p-5 overflow-visible">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-lg grid place-items-center" style={{ background: "rgba(52,211,153,0.11)", border: "1px solid rgba(52,211,153,0.26)", color: "#34d399" }}><Blocks size={19} /></div>
        <div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.17em]" style={{ color: "var(--cream-mute)" }}>Veloce capability registry</p><h1 className="text-[24px] mt-1" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Better models need better boundaries.</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>Clients benefit from curated skills and connectors through chat. Veloce controls the source, scope, cost, approval policy, and test status so capability improves results without turning a project workspace into an unrestricted tool console.</p></div>
        <div className="ml-auto flex gap-2 flex-wrap">{(["all", "built-in", "operator"] as Filter[]).map((item) => <button key={item} onClick={() => setFilter(item)} className="px-3 py-1.5 rounded-md text-[10.5px] font-semibold capitalize" style={{ color: filter === item ? "#111827" : "var(--cream-dim)", background: filter === item ? "#fbbf24" : "rgba(255,255,255,0.04)", border: "1px solid var(--line-soft)" }}>{item === "all" ? "All" : item === "built-in" ? "Client-ready" : "Operator"}</button>)}</div>
      </div>
    </section>

    <section className="grid xl:grid-cols-[1fr_310px] gap-4">
      <div className="grid md:grid-cols-2 gap-3">
        {!capabilities.length && !notice && <div className="panel p-5 text-[12px]" style={{ color: "var(--cream-mute)" }}><Loader2 size={14} className="inline mr-2 animate-spin" />Loading reviewed capabilities.</div>}
        {shown.map((capability) => {
          const status = statusStyle[capability.status];
          return <article key={capability.id} className="panel p-4 flex flex-col min-h-[235px]">
            <div className="flex items-start gap-2"><div className="w-7 h-7 rounded-md grid place-items-center" style={{ background: capability.kind === "connector" ? "rgba(96,165,250,0.12)" : "rgba(52,211,153,0.1)", color: capability.kind === "connector" ? "#60a5fa" : "#34d399" }}>{capability.kind === "connector" ? <KeyRound size={14} /> : capability.kind === "policy" ? <ShieldCheck size={14} /> : <BrainCircuit size={14} />}</div><div className="min-w-0"><div className="flex gap-2 items-center flex-wrap"><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{capability.name}</h2><span className="text-[9px] uppercase tracking-[0.12em]" style={{ color: status.color }}>{status.label}</span></div><p className="text-[9.5px] uppercase tracking-[0.13em] mt-0.5" style={{ color: "var(--cream-mute)" }}>{capability.audience === "built-in" ? "Client-ready capability" : "Operator-managed capability"} · {capability.kind}</p></div></div>
            <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{capability.description}</p>
            <div className="mt-auto pt-4 space-y-2 text-[10px] leading-relaxed" style={{ color: "var(--cream-mute)" }}><p><b style={{ color: "var(--cream-dim)" }}>Data:</b> {capability.dataScope}</p><p><b style={{ color: "var(--cream-dim)" }}>Boundary:</b> {capability.actionBoundary}</p>{capability.destination && <Link href={capability.destination} className="inline-flex items-center gap-1 pt-1 font-semibold" style={{ color: "#fbbf24" }}>Open capability <ExternalLink size={11} /></Link>}</div>
          </article>;
        })}
      </div>
      <aside className="panel p-4 h-fit"><div className="flex items-center gap-2"><Sparkles size={14} color="#fbbf24" /><h2 className="text-[12.5px] font-semibold" style={{ color: "var(--cream)" }}>How chat uses this</h2></div><ol className="mt-4 space-y-3 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}><li><span style={{ color: "#fbbf24" }}>01</span> Identify the request: research, website, asset, knowledge, or delivery.</li><li><span style={{ color: "#fbbf24" }}>02</span> Load only the relevant approved skill guidance and project-scoped context.</li><li><span style={{ color: "#fbbf24" }}>03</span> Use only allowed tools at the selected client scope.</li><li><span style={{ color: "#fbbf24" }}>04</span> Require human approval before publishing, outreach, deployment, or spend overage.</li></ol><div className="mt-5 p-3 rounded-md text-[10.5px] leading-relaxed" style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.18)", color: "var(--cream-dim)" }}>Admin additions need source review, a private smoke test, a cost rule, a scope declaration, and an emergency disable path before they become client-ready.</div></aside>
    </section>
    {notice && <p className="text-[11px]" style={{ color: "#fda4af" }}>{notice}</p>}
  </div>;
}
