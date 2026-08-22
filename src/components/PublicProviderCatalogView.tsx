"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, ExternalLink, Filter, KeyRound, ShieldCheck, Wallet } from "lucide-react";
import {
  PUBLIC_PROVIDER_CATALOG,
  publicCatalogStatusLabel,
  type PublicCatalogStatus,
  type PublicProviderCatalogEntry,
} from "@/lib/publicProviderCatalog";

const STATUS_ORDER: PublicCatalogStatus[] = ["available-now", "client-key", "review-required", "isolated-worker", "operator-only", "reference-only"];
const STATUS_COLOR: Record<PublicCatalogStatus, string> = {
  "available-now": "#34d399",
  "client-key": "#60a5fa",
  "review-required": "#fbbf24",
  "isolated-worker": "#c4b5fd",
  "operator-only": "#fda4af",
  "reference-only": "#94a3b8",
};

function CatalogRow({ entry }: { entry: PublicProviderCatalogEntry }) {
  const color = STATUS_COLOR[entry.status];
  return <article className="rounded-xl border p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.025)" }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--cream)" }}>{entry.name}</h2>
          <span className="rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.11em]" style={{ color, borderColor: `${color}55`, background: `${color}12` }}>{publicCatalogStatusLabel(entry.status)}</span>
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-[0.13em]" style={{ color: "var(--cream-mute)" }}>{entry.category} · {entry.kind} · {entry.pipelineStage}</p>
      </div>
      {entry.credentialKey && entry.status === "client-key" && <Link href={`/credentials?provider=${encodeURIComponent(entry.credentialKey)}`} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-semibold" style={{ color: "#07111e", background: "#93c5fd" }}><KeyRound size={11} /> Configure BYOK <ArrowRight size={11} /></Link>}
    </div>
    <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{entry.customerOutcome}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Detail label="Tool" value={entry.customerTool} />
      <Detail label="Data and permissions" value={`${entry.dataScope} ${entry.permissions}`} />
      <Detail label="Cost basis" value={`${entry.pricingBasis} ${entry.creditEstimate}`} />
      <Detail label="Credentials and approval" value={`${entry.credentialMode === "byok" ? "Client-owned key" : entry.credentialMode === "none" ? "No provider key" : entry.credentialMode === "reviewed" ? "Reviewed activation" : "Veloce-managed"}. ${entry.approval}`} />
    </div>
    {entry.modelOptions?.length ? <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--line-soft)", background: "rgba(0,0,0,0.12)" }}><p className="text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--cream-mute)" }}>Pricing snapshot {entry.pricingVersion || ""} · {entry.pricingVerifiedAt || "verification pending"}</p><div className="mt-2 grid gap-2 md:grid-cols-2">{entry.modelOptions.map((option) => <div key={option.id} className="rounded-md border p-2" style={{ borderColor: "var(--line-soft)" }}><p className="text-[10px] font-semibold" style={{ color: "var(--cream)" }}>{option.label}{option.recommended ? " · recommended" : ""}</p><p className="mt-1 text-[9px]" style={{ color: "var(--cream-mute)" }}>{option.units.map((unit) => unit.display).join(" · ")}</p></div>)}</div>{entry.pricingSourceUrl && <a href={entry.pricingSourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[9px]" style={{ color: "#93c5fd" }}>Verify current provider pricing</a>}</div> : null}
    {(entry.sourceUrl || entry.sourceNote) && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>
      {entry.sourceUrl && <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: "#93c5fd" }}>Source <ExternalLink size={10} /></a>}
      {entry.sourceCommit && <span className="font-mono">{entry.sourceCommit.slice(0, 12)}</span>}
      {entry.license && <span>{entry.license}</span>}
      {entry.sourceNote && <span>{entry.sourceNote}</span>}
    </div>}
  </article>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div>
    <p className="text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--cream-mute)" }}>{label}</p>
    <p className="mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{value}</p>
  </div>;
}

export default function PublicProviderCatalogView() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PublicCatalogStatus | "all">("all");
  const [kind, setKind] = useState<PublicProviderCatalogEntry["kind"] | "all">("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PUBLIC_PROVIDER_CATALOG.filter((entry) => {
      if (status !== "all" && entry.status !== status) return false;
      if (kind !== "all" && entry.kind !== kind) return false;
      if (!needle) return true;
      return [entry.name, entry.category, entry.customerTool, entry.customerOutcome, entry.pipelineStage, entry.status, entry.sourceNote].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [kind, query, status]);

  const available = PUBLIC_PROVIDER_CATALOG.filter((entry) => entry.status === "available-now").length;
  const clientKey = PUBLIC_PROVIDER_CATALOG.filter((entry) => entry.status === "client-key").length;
  const gated = PUBLIC_PROVIDER_CATALOG.filter((entry) => ["review-required", "isolated-worker", "operator-only"].includes(entry.status)).length;

  return <main className="min-h-screen px-5 py-8 md:px-10 md:py-12" style={{ background: "var(--bg-deep)", color: "var(--cream)" }}>
    <div className="mx-auto max-w-[1450px]">
      <header className="rounded-2xl border p-6 md:p-9" style={{ borderColor: "rgba(147,197,253,0.25)", background: "linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.75))" }}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-4xl">
            <p className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#93c5fd" }}>Veloce AgenticOS · public catalog</p>
            <h1 className="mt-3 text-3xl font-semibold md:text-5xl" style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}>See what powers the pipeline.</h1>
            <p className="mt-4 max-w-3xl text-[13px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>A transparent map of the tools, provider adapters, and repository-derived contracts that can support research, memory, planning, creation, quality review, approval, and delivery.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="https://veloceos.cloud/start" className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3.5 py-2 text-[11px] font-semibold text-slate-200">Start onboarding <ArrowRight size={13} /></Link>
            <Link href="/credits" className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3.5 py-2 text-[11px] font-semibold text-slate-200">Credits policy <Wallet size={13} /></Link>
            <Link href="/login?next=%2Fcapabilities" className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[11px] font-semibold" style={{ color: "#07111e", background: "#93c5fd" }}>Open client runtime <ArrowRight size={13} /></Link>
          </div>
        </div>
        <div className="mt-7 grid gap-2 sm:grid-cols-3">
          <Stat icon={<ShieldCheck size={14} />} value={available} label="Available now" color="#34d399" />
          <Stat icon={<KeyRound size={14} />} value={clientKey} label="Available with client key" color="#60a5fa" />
          <Stat icon={<Wallet size={14} />} value={gated} label="Gated or isolated" color="#fbbf24" />
        </div>
      </header>

      <section className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex flex-wrap items-center gap-2"><Filter size={14} style={{ color: "#93c5fd" }} /><p className="text-[11px] font-semibold">Filter the governed catalog</p><span className="text-[10px]" style={{ color: "var(--cream-mute)" }}>{filtered.length} of {PUBLIC_PROVIDER_CATALOG.length} entries</span></div>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_220px_180px]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools, providers, outcomes, or pipeline stages" className="rounded-md border px-3 py-2 text-[11px] outline-none" style={{ color: "var(--cream)", background: "rgba(0,0,0,0.18)", borderColor: "var(--line-soft)" }} />
          <select value={status} onChange={(event) => setStatus(event.target.value as PublicCatalogStatus | "all")} className="rounded-md border px-3 py-2 text-[11px] outline-none" style={{ color: "var(--cream)", background: "#111827", borderColor: "var(--line-soft)" }}><option value="all">All activation states</option>{STATUS_ORDER.map((value) => <option key={value} value={value}>{publicCatalogStatusLabel(value)}</option>)}</select>
          <select value={kind} onChange={(event) => setKind(event.target.value as PublicProviderCatalogEntry["kind"] | "all")} className="rounded-md border px-3 py-2 text-[11px] outline-none" style={{ color: "var(--cream)", background: "#111827", borderColor: "var(--line-soft)" }}><option value="all">All source types</option><option value="native">Veloce native</option><option value="provider">Provider adapter</option><option value="repository">Repository reference</option></select>
        </div>
        <p className="mt-3 text-[10px] leading-relaxed" style={{ color: "var(--cream-mute)" }}>Credits are a transparent usage estimate over the existing USD-micros ledger. BYOK clients pay their provider directly; Veloce-managed credits are a separate future billing mode. A catalog entry never grants access by itself.</p>
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-3">
        <PolicyCard title="Default: BYOK + platform fee" body="Bring an approved provider key. Veloce charges a minimum platform/setup fee for the governed runtime, tenant isolation, policy, support, and evidence surface." />
        <PolicyCard title="Managed credits later" body="A separate managed-credit plan may supply provider credentials. Jobs will reserve, settle, or refund normalized credits while Veloce carries provider, infrastructure, and support costs." />
        <PolicyCard title="Activation is reviewed" body="Approved catalog entries can be requested through the secure server flow. New or high-risk providers still require manifest review, smoke evidence, and rollback proof." />
      </section>

      <section className="mt-5 space-y-3">{filtered.map((entry) => <CatalogRow key={entry.id} entry={entry} />)}</section>
      {!filtered.length && <div className="mt-5 rounded-xl border p-8 text-center text-[12px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>No catalog entries match those filters.</div>}

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>
        <span>Provider keys stay server-side. External side effects remain approval-gated.</span>
        <div className="flex flex-wrap gap-3">
          <Link href="/credits" className="inline-flex items-center gap-1" style={{ color: "#93c5fd" }}>Credits policy <ArrowRight size={11} /></Link>
          <Link href="/capabilities" className="inline-flex items-center gap-1" style={{ color: "#93c5fd" }}>Review capability boundaries <ArrowRight size={11} /></Link>
        </div>
      </footer>
    </div>
  </main>;
}

function Stat({ icon, value, label, color }: { icon: ReactNode; value: number; label: string; color: string }) {
  return <div className="rounded-lg border p-3" style={{ borderColor: `${color}40`, background: `${color}0b` }}><div className="flex items-center gap-2" style={{ color }}><span>{icon}</span><strong className="text-lg">{value}</strong></div><p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>{label}</p></div>;
}

function PolicyCard({ title, body }: { title: string; body: string }) {
  return <div className="rounded-xl border p-4" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.02)" }}><p className="text-[11px] font-semibold" style={{ color: "var(--cream)" }}>{title}</p><p className="mt-2 text-[10.5px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{body}</p></div>;
}
