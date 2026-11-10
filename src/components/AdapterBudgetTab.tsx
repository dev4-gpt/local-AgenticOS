"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { buildBudgetBreakdown, formatMicrosUsd, type AdapterCard, type BudgetBreakdown } from "@/lib/adapterOverview";

type LoadState = "loading" | "ready" | "disabled" | "unavailable";
const COLORS = ["#60a5fa", "#a78bfa", "#34d399", "#f472b6", "#fbbf24", "#22d3ee"];
const OTHER_COLOR = "#64748b";

export default function AdapterBudgetTab() {
  const [breakdown, setBreakdown] = useState<BudgetBreakdown | null>(null);
  const [cards, setCards] = useState<AdapterCard[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setState("loading");
    const [adaptersResponse, budgetResponse] = await Promise.all([
      fetch("/api/client-runtime/adapters", { cache: "no-store" }).catch(() => null),
      fetch("/api/client-runtime/budget", { cache: "no-store" }).catch(() => null),
    ]);
    const [adapters, budget] = await Promise.all([adaptersResponse?.json().catch(() => null), budgetResponse?.json().catch(() => null)]);
    if (adapters?.error === "adapter_host_disabled") { setState("disabled"); return; }
    if (adaptersResponse?.ok && adapters?.ok && Array.isArray(adapters.adapters) && budgetResponse?.ok && budget?.ok) {
      const result = buildBudgetBreakdown(adapters.adapters as AdapterCard[], { capMicros: budget.capMicros, spentMicros: budget.spentMicros });
      if (result) {
        setCards(adapters.adapters as AdapterCard[]);
        setBreakdown(result);
        setState("ready");
        return;
      }
    }
    setState("unavailable");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="eyebrow">All adapters</p>
        <h2 className="mt-1 text-[21px]" style={{ color: "var(--cream)", fontFamily: "'Bricolage Grotesque', sans-serif" }}>Budget</h2>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/adapters" className="text-[11px] text-sky-300 underline">Adapter details</Link>
        <button type="button" onClick={() => void load()} disabled={state === "loading"} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>
          <RefreshCw size={13} className={state === "loading" ? "animate-spin" : ""} />Refresh
        </button>
      </div>
    </div>

    {state === "loading" && <p className="panel p-4 text-[12px]" style={{ color: "var(--cream-mute)" }}>Checking budget...</p>}
    {state === "disabled" && <p className="panel p-4 text-[12px]" style={{ color: "var(--cream-dim)" }} role="status">The adapter host is not switched on, so there is no per-adapter spend to show.</p>}
    {state === "unavailable" && <p className="panel flex items-start gap-2 p-4 text-[12px]" style={{ color: "#fbbf24" }} role="status"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />Budget status unavailable. Spend by adapter cannot be confirmed, so none is shown.</p>}

    {state === "ready" && breakdown && <>
      <section className="panel p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>
            {formatMicrosUsd(breakdown.tenantSpentMicros)}
            <span className="font-normal" style={{ color: "var(--cream-mute)" }}> {breakdown.tenantCapMicros > 0 ? `of ${formatMicrosUsd(breakdown.tenantCapMicros)} this month` : "this month (no workspace cap set)"}</span>
          </p>
          {breakdown.tenantCapMicros > 0 && <span className="text-[12px] tabular-nums" style={{ color: "var(--cream-dim)" }}>{Math.round((breakdown.tenantSpentMicros / breakdown.tenantCapMicros) * 100)}%</span>}
        </div>
        <Stack breakdown={breakdown} />
        {!breakdown.reconciles && <p className="mt-2 text-[10px]" style={{ color: "#fbbf24" }}>Adapter spend is larger than the workspace total. The two readings disagree, so treat these figures with care.</p>}
      </section>

      <section className="panel overflow-hidden">
        <table className="w-full text-left text-[11px]">
          <caption className="sr-only">Spend by adapter this month</caption>
          <thead><tr style={{ color: "var(--cream-mute)" }}><th className="px-4 py-2 font-medium">Adapter</th><th className="px-4 py-2 font-medium">This month</th><th className="px-4 py-2 font-medium">Share</th><th className="px-4 py-2 font-medium">Own cap</th></tr></thead>
          <tbody>
            {breakdown.adapters.map((row, index) => {
              const card = cards.find((c) => c.adapterId === row.adapterId);
              return <tr key={row.adapterId} className="border-t" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>
                <td className="px-4 py-2"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: COLORS[index % COLORS.length] }} aria-hidden="true" />{row.displayName}</td>
                <td className="px-4 py-2 tabular-nums">{formatMicrosUsd(row.spentMonthMicros)}</td>
                <td className="px-4 py-2 tabular-nums">{Math.round(row.shareOfTenantSpend * 100)}%</td>
                <td className="px-4 py-2">{card?.budgetCapMicros == null ? "none" : `${formatMicrosUsd(card.spentPeriodMicros)} / ${formatMicrosUsd(card.budgetCapMicros)}`}{card?.capStatus === "exhausted" ? " (reached)" : card?.capStatus === "warning" ? " (close)" : ""}</td>
              </tr>;
            })}
            <tr className="border-t" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>
              <td className="px-4 py-2"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: OTHER_COLOR }} aria-hidden="true" />Other spending (not from an adapter)</td>
              <td className="px-4 py-2 tabular-nums">{formatMicrosUsd(breakdown.otherMicros)}</td>
              <td className="px-4 py-2 tabular-nums">{breakdown.tenantSpentMicros > 0 ? Math.round((breakdown.otherMicros / breakdown.tenantSpentMicros) * 100) : 0}%</td>
              <td className="px-4 py-2">-</td>
            </tr>
          </tbody>
        </table>
        {breakdown.adapters.length === 0 && <p className="border-t px-4 py-3 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-mute)" }}>No adapter has spent anything this month.</p>}
      </section>
      <p className="text-[10px]" style={{ color: "var(--cream-mute)" }}>One ledger: these figures come from the same ledger as the workspace meter. Costs a provider did not report are not shown separately yet.</p>
    </>}
  </div>;
}

function Stack({ breakdown }: { breakdown: BudgetBreakdown }) {
  const total = Math.max(breakdown.tenantSpentMicros, 1);
  const parts = [
    ...breakdown.adapters.map((row, index) => ({ key: row.adapterId, label: row.displayName, micros: row.spentMonthMicros, color: COLORS[index % COLORS.length] })),
    { key: "other", label: "Other spending", micros: breakdown.otherMicros, color: OTHER_COLOR },
  ].filter((part) => part.micros > 0);
  const scale = breakdown.tenantCapMicros > 0 ? Math.max(breakdown.tenantCapMicros, breakdown.tenantSpentMicros) : total;
  return <div className="mt-3 flex h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} role="img"
    aria-label={`Spend by source: ${parts.map((p) => `${p.label} ${formatMicrosUsd(p.micros)}`).join(", ") || "nothing spent"}`}>
    {parts.map((part) => <div key={part.key} title={`${part.label}: ${formatMicrosUsd(part.micros)}`} style={{ width: `${(part.micros / scale) * 100}%`, background: part.color }} />)}
  </div>;
}
