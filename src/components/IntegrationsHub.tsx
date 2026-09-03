"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Loader2, PlugZap, RefreshCw, Save, Settings2 } from "lucide-react";
import type { ReviewedAddition } from "@/lib/reviewedAdditions";
import type { V96SkillManifest } from "@/lib/v96Contracts";

interface LocalItem { id: string; name: string; description: string; state: string; detail: string }
interface Field { key: string; label: string; secret: boolean; placeholder: string; set: boolean; value: string }
interface ExternalItem extends LocalItem { fields: Field[]; url: string }
interface GovernedIntegration { id: string; name: string; repository: string; state: string; placements: string[]; runtime: string; dataBoundary: string; activationEvidence: string[]; rollback: string }
interface Overview { local: LocalItem[]; external: ExternalItem[]; reviewed: (ReviewedAddition & { detected: boolean })[]; skillPack: readonly V96SkillManifest[]; governed: GovernedIntegration[]; configPath: string }

const COLOR: Record<string, string> = { working: "#5ab896", waiting: "#d4a574", unreachable: "#ef8f8f", missing: "#ef8f8f", "native-enabled": "#5ab896", disabled: "#d4a574" };

function Status({ state }: { state: string }) {
  const c = COLOR[state] ?? "var(--cream-mute)";
  return <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: c }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{state}</span>;
}

export default function IntegrationsHub() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setData(await (await fetch("/api/integrations", { cache: "no-store" })).json()); }
    catch { setNotice("Could not load integration status."); }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  function edit(id: string, key: string, value: string) {
    setForms((all) => ({ ...all, [id]: { ...(all[id] ?? {}), [key]: value } }));
  }

  async function save(id: string) {
    setSaving(id); setNotice("");
    try {
      const r = await fetch("/api/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, values: forms[id] ?? {} }) });
      const j = await r.json();
      setNotice(j.ok ? "Integration saved locally." : (j.error || "Could not save integration."));
      if (j.ok) { setForms((all) => ({ ...all, [id]: {} })); await refresh(); }
    } catch { setNotice("Could not reach the integration endpoint."); }
    setSaving(null);
  }

  const Row = ({ item, configurable = false }: { item: LocalItem | ExternalItem; configurable?: boolean }) => {
    const ext = item as ExternalItem;
    const expanded = open === item.id;
    return <div className="border-b last:border-b-0" style={{ borderColor: "var(--line-soft)" }}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.4fr)_110px_auto] gap-2 md:gap-3 items-center px-4 py-3">
        <div className="text-[12.5px] font-medium col-start-1 row-start-1 md:col-auto md:row-auto" style={{ color: "var(--cream)" }}>{item.name}</div>
        <div className="min-w-0 col-span-2 row-start-2 md:col-span-1 md:row-auto"><div className="text-[11px]" style={{ color: "var(--cream-dim)" }}>{item.description}</div><div className="text-[9.5px] mt-0.5 break-words" style={{ color: "var(--cream-mute)" }}>{item.detail}</div></div>
        <div className="col-start-1 row-start-3 md:col-auto md:row-auto"><Status state={item.state} /></div>
        <div className="flex justify-end gap-1 col-start-2 row-start-1 md:col-auto md:row-auto">
          {configurable && ext.url && <button onClick={() => window.open(ext.url, "_blank", "noopener")} title="Open service" className="p-1.5 rounded-md" style={{ color: "var(--cream-mute)" }}><ExternalLink size={13} /></button>}
          {configurable && <button onClick={() => setOpen(expanded ? null : item.id)} title="Configure" className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-[10.5px]" style={{ color: "var(--cream-dim)", border: "1px solid var(--line-soft)" }}><Settings2 size={12} />{expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</button>}
        </div>
      </div>
      {configurable && expanded && <div className="px-4 pb-3 grid md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
        {ext.fields.map((field) => <label key={field.key} className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{field.label}{field.secret && field.set ? " · stored" : ""}<input type={field.secret ? "password" : "text"} value={forms[item.id]?.[field.key] ?? ""} onChange={(e) => edit(item.id, field.key, e.target.value)} placeholder={field.value || field.placeholder} className="mt-1 block w-full rounded-md px-2.5 py-2 text-[11px] outline-none" style={{ background: "var(--bg-deep)", border: "1px solid var(--line-soft)", color: "var(--cream)" }} /></label>)}
        <button onClick={() => save(item.id)} disabled={saving === item.id} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold disabled:opacity-50" style={{ background: "#38bdf8", color: "#07131a" }}>{saving === item.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save</button>
      </div>}
    </div>;
  };

  const reviewedStatus: Record<string, { label: string; color: string }> = { recommended: { label: "Recommended", color: "#34d399" }, review: { label: "Review next", color: "#fbbf24" }, deferred: { label: "Deferred", color: "#94a3b8" } };

  return <div className="pb-6 space-y-4">
    <div className="flex items-start gap-3 flex-wrap"><div className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.35)", color: "#38bdf8" }}><PlugZap size={18} /></div><div><h2 className="text-[16px] font-semibold" style={{ color: "var(--cream)" }}>Integrations</h2><div className="text-[11.5px] mt-0.5" style={{ color: "var(--cream-mute)" }}>Local capabilities and optional business infrastructure</div></div><button onClick={refresh} disabled={loading} title="Refresh" className="ml-auto p-2 rounded-lg border" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button></div>
    <section className="panel overflow-hidden"><div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: "var(--line-soft)" }}><CheckCircle2 size={14} style={{ color: "#5ab896" }} /><span className="text-[12px] font-medium" style={{ color: "var(--cream)" }}>Local capabilities</span></div>{data?.local.map((item) => <Row key={item.id} item={item} />)}</section>
    <section className="panel overflow-hidden"><div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--line-soft)" }}><span className="text-[12px] font-medium" style={{ color: "var(--cream)" }}>Business adapters</span><span className="text-[10.5px] ml-2" style={{ color: "var(--cream-mute)" }}>credentials stay in {data?.configPath || "~/.agentic-os/integrations.json"}</span></div>{data?.external.map((item) => <Row key={item.id} item={item} configurable />)}</section>
    <section className="panel overflow-hidden"><div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--line-soft)" }}><span className="text-[12px] font-medium" style={{ color: "var(--cream)" }}>Governed integration control plane</span><span className="text-[10.5px] ml-2" style={{ color: "var(--cream-mute)" }}>pipeline · infrastructure · stack · backend state · no implicit activation</span></div><div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>{data?.governed.map((item) => <article key={item.id} className="px-4 py-3 grid md:grid-cols-[minmax(160px,0.7fr)_minmax(230px,1.4fr)_110px] gap-2 md:gap-3 items-start"><div><div className="text-[12.5px] font-medium" style={{ color: "var(--cream)" }}>{item.name}</div><div className="mt-1"><Status state={item.state} /></div></div><div className="text-[10.5px] leading-relaxed" style={{ color: "var(--cream-dim)" }}><p>{item.runtime}</p><p className="mt-1" style={{ color: "var(--cream-mute)" }}><b style={{ color: "var(--cream-dim)" }}>Boundary:</b> {item.dataBoundary}</p><p className="mt-1" style={{ color: "var(--cream-mute)" }}><b style={{ color: "var(--cream-dim)" }}>Activation:</b> {item.activationEvidence.join(" · ")}</p><p className="mt-1" style={{ color: "var(--cream-mute)" }}><b style={{ color: "var(--cream-dim)" }}>Rollback:</b> {item.rollback}</p></div><div className="flex flex-col gap-2 md:items-end"><span className="text-[9.5px] uppercase tracking-wider" style={{ color: "var(--cream-mute)" }}>{item.placements.join(" · ")}</span><a href={item.repository} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px]" style={{ color: "#38bdf8" }}>source <ExternalLink size={10} /></a></div></article>)}</div></section>
    <section className="panel overflow-hidden"><div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--line-soft)" }}><span className="text-[12px] font-medium" style={{ color: "var(--cream)" }}>Reviewed additions</span><span className="text-[10.5px] ml-2" style={{ color: "var(--cream-mute)" }}>ecosystem intelligence, not an auto-install list</span></div><div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>{data?.reviewed.map((item) => { const status = reviewedStatus[item.status]; return <article key={item.id} className="px-4 py-3 grid md:grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.4fr)_110px_auto] gap-2 md:gap-3 items-start"><div><div className="text-[12.5px] font-medium" style={{ color: "var(--cream)" }}>{item.name}</div><div className="text-[9px] uppercase tracking-wider mt-1" style={{ color: status.color }}>{status.label}{item.detected ? " · detected" : ""}</div></div><div className="text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{item.summary}<div className="text-[9.5px] mt-1" style={{ color: "var(--cream-mute)" }}><b style={{ color: "var(--cream-dim)" }}>Fit:</b> {item.fit}</div><div className="text-[9.5px] mt-1" style={{ color: "var(--cream-mute)" }}><b style={{ color: "var(--cream-dim)" }}>Decision:</b> {item.decision}</div></div><div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--cream-mute)" }}>{item.kind}</div><div className="flex gap-2 justify-end"><a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px]" style={{ color: "#38bdf8" }}>source <ExternalLink size={10} /></a>{item.docsUrl && <a href={item.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>docs <ExternalLink size={10} /></a>}</div><div className="md:col-span-4 text-[10px] leading-relaxed" style={{ color: "var(--cream-mute)" }}><b style={{ color: "var(--cream-dim)" }}>Boundary:</b> {item.boundary}</div></article>; })}</div></section>
    <section className="panel overflow-hidden"><div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--line-soft)" }}><span className="text-[12px] font-medium" style={{ color: "var(--cream)" }}>Curated specialist roles</span><span className="text-[10.5px] ml-2" style={{ color: "var(--cream-mute)" }}>v96 role contracts · no new tools</span></div><div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>{data?.skillPack.map((role) => <article key={role.id} className="px-4 py-2.5 grid md:grid-cols-[160px_1fr_150px] gap-2 items-start"><div><div className="text-[12px] font-medium" style={{ color: "var(--cream)" }}>{role.label}</div><div className="text-[9px] uppercase tracking-wider mt-1" style={{ color: "#34d399" }}>{role.approval}</div></div><div className="text-[10.5px]" style={{ color: "var(--cream-dim)" }}>{role.deliverable.kind} · {role.supportedSurfaces.join(", ")}</div><div className="text-[9.5px] text-right" style={{ color: "var(--cream-mute)" }}>{role.modelLane} · {role.budgetClass} · {role.sourceCommit}</div></article>)}</div></section>
    {notice && <div className="text-[11px]" style={{ color: "var(--cream-mute)" }}>{notice}</div>}
  </div>;
}
