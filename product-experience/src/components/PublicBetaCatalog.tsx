"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Filter, KeyRound, ShieldCheck, Wallet } from "lucide-react";
import { PUBLIC_BETA_CATALOG, PUBLIC_BETA_STATUS_ORDER, type PublicBetaCatalogEntry, type PublicBetaKind, type PublicBetaStatus } from "@/data/publicBetaCatalog";

const statusColor: Record<PublicBetaStatus, string> = {
  "Available now": "#047857",
  "Available with client key": "#1d4ed8",
  "Review required": "#a16207",
  "Isolated worker": "#6d28d9",
  "Operator only": "#be123c",
  "Reference only": "#475569",
};

export function PublicBetaCatalog() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PublicBetaStatus | "all">("all");
  const [kind, setKind] = useState<PublicBetaKind | "all">("all");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PUBLIC_BETA_CATALOG.filter((entry) => {
      if (status !== "all" && entry.status !== status) return false;
      if (kind !== "all" && entry.kind !== kind) return false;
      return !needle || Object.values(entry).join(" ").toLowerCase().includes(needle);
    });
  }, [kind, query, status]);

  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--g5)]">
      <header className="border-b border-[var(--g5)]/12 bg-[var(--paper)]/95">
        <nav className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 lg:px-8">
          <a href="/" className="font-heading text-lg font-bold no-underline">Veloce AgenticOS</a>
          <div className="flex gap-3 text-sm font-semibold">
            <a href="/credits" className="rounded-full border border-[var(--g5)]/18 px-4 py-2 no-underline">Credits</a>
            <a href="/start" className="rounded-full bg-[var(--g5)] px-4 py-2 text-white no-underline">Request invite</a>
          </div>
        </nav>
      </header>
      <section className="mx-auto max-w-[1240px] px-5 py-12 lg:px-8 lg:py-16">
        <p className="font-display text-base italic text-[var(--g5)]/62">Public beta transparency</p>
        <h1 className="font-heading mt-3 max-w-4xl text-5xl font-bold leading-[0.98] lg:text-7xl">See what powers the pipeline.</h1>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-[var(--g5)]/68">A public map of Veloce-owned contracts, approved provider lanes, and repository provenance across research, memory, planning, creation, quality review, approval, and delivery.</p>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          <Summary icon={<ShieldCheck size={16} />} label="Available now" value={countStatus("Available now")} />
          <Summary icon={<KeyRound size={16} />} label="Client key" value={countStatus("Available with client key")} />
          <Summary icon={<Wallet size={16} />} label="Gated or isolated" value={PUBLIC_BETA_CATALOG.filter((entry) => ["Review required", "Isolated worker", "Operator only"].includes(entry.status)).length} />
        </div>
        <div className="mt-8 rounded-2xl border border-[var(--g5)]/14 bg-white/45 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><Filter size={15} /> Governed catalog <span className="font-normal text-[var(--g5)]/55">{filtered.length} of {PUBLIC_BETA_CATALOG.length} entries</span></div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_190px]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools, outcomes, or stages" className="rounded-lg border border-[var(--g5)]/15 bg-white/65 px-3 py-2 text-sm outline-none" />
            <select value={status} onChange={(event) => setStatus(event.target.value as PublicBetaStatus | "all")} className="rounded-lg border border-[var(--g5)]/15 bg-white/65 px-3 py-2 text-sm outline-none"><option value="all">All activation states</option>{PUBLIC_BETA_STATUS_ORDER.map((item) => <option key={item}>{item}</option>)}</select>
            <select value={kind} onChange={(event) => setKind(event.target.value as PublicBetaKind | "all")} className="rounded-lg border border-[var(--g5)]/15 bg-white/65 px-3 py-2 text-sm outline-none"><option value="all">All source types</option><option>Native contract</option><option>Provider</option><option>Repository provenance</option></select>
          </div>
        </div>
        <div className="mt-5 grid gap-4">{filtered.map((entry) => <CatalogCard key={entry.id} entry={entry} />)}</div>
        {!filtered.length && <p className="mt-6 rounded-xl border border-[var(--g5)]/14 p-8 text-center text-sm text-[var(--g5)]/58">No catalog entries match those filters.</p>}
        <p className="mt-8 text-xs leading-relaxed text-[var(--g5)]/58">A catalog entry is not an execution grant. Provider keys stay server-side. New or high-risk providers require a reviewed tenant manifest, evidence bundle, and rollback path.</p>
      </section>
    </main>
  );
}

function countStatus(status: PublicBetaStatus) {
  return PUBLIC_BETA_CATALOG.filter((entry) => entry.status === status).length;
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-xl border border-[var(--g5)]/14 bg-white/45 p-4"><div className="flex items-center gap-2 text-[var(--g5)]/68">{icon}<strong className="text-2xl text-[var(--g5)]">{value}</strong></div><p className="mt-1 text-xs text-[var(--g5)]/58">{label}</p></div>;
}

function CatalogCard({ entry }: { entry: PublicBetaCatalogEntry }) {
  const color = statusColor[entry.status];
  return <article className="rounded-2xl border border-[var(--g5)]/14 bg-white/45 p-5 shadow-sm lg:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-2xl font-bold">{entry.name}</h2><span className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>{entry.status}</span></div><p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--g5)]/48">{entry.kind} · {entry.stage}</p></div>
      {entry.source && <a href={entry.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 no-underline">Source <ExternalLink size={12} /></a>}
    </div>
    <p className="mt-4 max-w-4xl text-sm leading-relaxed text-[var(--g5)]/72">{entry.outcome}</p>
    <div className="mt-5 grid gap-4 text-xs md:grid-cols-2 lg:grid-cols-4"><Detail label="Customer tool" value={entry.customerTool} /><Detail label="Data and permissions" value={entry.data} /><Detail label="Cost basis" value={entry.cost} /><Detail label="Credentials and approval" value={`${entry.credentials} ${entry.approval}`} /></div>
  </article>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="font-semibold uppercase tracking-[0.08em] text-[var(--g5)]/45">{label}</p><p className="mt-1 leading-relaxed text-[var(--g5)]/65">{value}</p></div>;
}
