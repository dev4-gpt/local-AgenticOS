"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, KeyRound, LockKeyhole, Send, ShieldCheck } from "lucide-react";
import { PUBLIC_PROVIDER_CATALOG, publicCatalogStatusLabel, type PublicProviderCatalogEntry } from "@/lib/publicProviderCatalog";

const COLORS: Record<PublicProviderCatalogEntry["status"], string> = { "available-now": "#34d399", "client-key": "#60a5fa", "review-required": "#fbbf24", "isolated-worker": "#c4b5fd", "operator-only": "#fda4af", "reference-only": "#94a3b8" };

export default function ProviderMatrixView() {
  const [selected, setSelected] = useState<string[]>([]);
  const [modes, setModes] = useState<Record<string, string>>({});
  const [proposals, setProposals] = useState<Array<Record<string, unknown>>>([]);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  async function loadProposals() {
    const response = await fetch("/api/client-runtime/manifest-proposals", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok && Array.isArray(data?.proposals)) setProposals(data.proposals);
  }
  useEffect(() => { void loadProposals(); }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PUBLIC_PROVIDER_CATALOG.filter((entry) => !needle || [entry.name, entry.customerTool, entry.customerOutcome, entry.pipelineStage, entry.runtimePlacement].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [query]);

  function toggle(entry: PublicProviderCatalogEntry) {
    if (!entry.selectionAllowed) return;
    setSelected((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id]);
    setModes((current) => ({ ...current, [entry.id]: current[entry.id] || (entry.credentialKey ? "byok" : "none") }));
  }

  async function submit() {
    if (!selected.length) { setNotice("Select at least one approved or reviewable capability."); return; }
    setNotice("Submitting tenant manifest proposal…");
    const response = await fetch("/api/client-runtime/manifest-proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalogIds: selected, credentialModes: modes }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok || !data?.ok) { setNotice(data?.error === "catalog_selection_invalid" ? "One selected row is reference-only or operator-only." : "The proposal could not be submitted."); return; }
    setNotice(`Proposal ${String(data.proposalId).slice(0, 12)} submitted for review. No provider was activated.`);
    setSelected([]);
    await loadProposals();
  }

  return <div className="pb-8 space-y-5">
    <section className="panel p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}><ShieldCheck size={19} /></div>
        <div className="min-w-0 flex-1"><div className="eyebrow">Governed provider activation</div><h1 className="mt-1 text-2xl font-semibold text-[var(--fg)]">Provider matrix</h1><p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--fg-dim)]">Choose the tools your tenant needs. This creates a reviewed manifest proposal; it does not activate execution or expose credentials.</p></div>
        <Link href="/credentials" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--panel-border)] px-3 py-2 text-[11px] text-[var(--fg-dim)]"><KeyRound size={13} /> Manage credentials</Link>
      </div>
    </section>
    <section className="panel p-5"><div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--fg)]"><LockKeyhole size={15} color="#34d399" /> Managed credentials</div><p className="mt-2 text-[11px] leading-relaxed text-[var(--fg-dim)]">Veloce-managed credentials are optional and separately budgeted. Keys stay in tenant-scoped Secret Manager references, are validated server-side, and are never returned to this page. Rotation, suspension, and offboarding revoke the reference and record an audit event. Paid provider bills remain your responsibility in BYOK mode; managed mode adds provider, infrastructure, support, and risk allocation through credits.</p></section>
    <section className="panel p-4"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search providers, tools, stages, or repository contracts" className="w-full rounded-lg border border-[var(--panel-border)] bg-black/20 px-3 py-2.5 text-[12px] text-[var(--fg)] outline-none" /><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[1050px] border-collapse text-left text-[10px]"><thead><tr className="border-b border-[var(--panel-border)] text-[9px] uppercase tracking-[0.12em] text-[var(--fg-dim)]"><th className="p-2">Select</th><th className="p-2">Tool / use case</th><th className="p-2">Pipeline / runtime</th><th className="p-2">Credential mode</th><th className="p-2">Pricing / free tier</th><th className="p-2">Status / approval</th></tr></thead><tbody>{visible.map((entry) => { const color = COLORS[entry.status]; const active = selected.includes(entry.id); return <tr key={entry.id} className="border-b border-[var(--panel-border)] align-top"><td className="p-2"><button type="button" disabled={!entry.selectionAllowed} onClick={() => toggle(entry)} className="grid h-6 w-6 place-items-center rounded border disabled:opacity-30" style={{ borderColor: active ? color : "var(--panel-border)", background: active ? `${color}20` : "transparent", color }} aria-label={`Select ${entry.name}`}>{active && <Check size={13} />}</button></td><td className="p-2"><div className="font-semibold text-[var(--fg)]">{entry.name}</div><div className="mt-1 max-w-[270px] leading-relaxed text-[var(--fg-dim)]">{entry.customerTool}. {entry.customerOutcome}</div></td><td className="p-2"><div className="text-[var(--fg)]">{entry.pipelineStage}</div><div className="mt-1 text-[var(--fg-dim)]">{entry.runtimePlacement || "Tenant runtime"}</div></td><td className="p-2"><div className="text-[var(--fg)]">{entry.credentialKey ? "BYOK available" : "No customer key"}</div><div className="mt-1 text-[var(--fg-dim)]">{entry.managedCredentialAvailable ? "Veloce-managed available" : entry.credentialKey ? "Veloce-managed: not enabled" : "Native or worker boundary"}</div>{active && entry.credentialKey && <select value={modes[entry.id] || "byok"} onChange={(event) => setModes((current) => ({ ...current, [entry.id]: event.target.value }))} className="mt-2 rounded border border-[var(--panel-border)] bg-black/30 px-2 py-1 text-[10px] text-[var(--fg)]"><option value="byok">Client BYOK</option>{entry.managedCredentialAvailable && <option value="veloce-managed">Veloce-managed (review)</option>}</select>}</td><td className="p-2"><div className="max-w-[250px] text-[var(--fg)]">{entry.modelOptions?.slice(0, 3).map((option) => `${option.model}: ${option.units[0]?.display || "provider-defined"}`).join(" · ") || entry.pricingBasis}</div><div className="mt-1 text-[var(--fg-dim)]">{entry.freeTier || "No verified free tier in current snapshot."}{entry.pricingVerifiedAt ? ` · verified ${entry.pricingVerifiedAt}` : ""}</div></td><td className="p-2"><span className="rounded-full border px-2 py-1" style={{ color, borderColor: `${color}55` }}>{publicCatalogStatusLabel(entry.status)}</span><div className="mt-2 max-w-[230px] text-[var(--fg-dim)]">{entry.approval}</div></td></tr>; })}</tbody></table></div></section>
    <section className="flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-[var(--fg-dim)]">{selected.length} selected · proposals require manifest approval and smoke evidence.</p><button type="button" onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-lg bg-sky-300 px-4 py-2.5 text-[11px] font-semibold text-slate-950"><Send size={13} /> Submit proposal <ChevronRight size={13} /></button></section>
    {notice && <p className="text-[11px] text-[var(--fg-dim)]">{notice}</p>}
    {proposals.length > 0 && <section className="panel p-4"><div className="eyebrow">Tenant manifest history</div><div className="mt-3 space-y-2">{proposals.slice(0, 5).map((proposal, index) => <div key={String(proposal.id || index)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--panel-border)] px-3 py-2 text-[11px] text-[var(--fg-dim)]"><span>{String(proposal.id || "proposal").slice(0, 16)}</span><span>{String(proposal.status || "submitted")}</span><span>{Array.isArray(proposal.catalog_ids) ? `${proposal.catalog_ids.length} selections` : "Selections recorded"}</span></div>)}</div></section>}
  </div>;
}
