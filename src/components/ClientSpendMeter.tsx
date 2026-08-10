"use client";

// Shown on every surface that spends a provider key.
//
// The keys belong to the client, so this is their bill rather than an abstract
// quota. Two readings sit together because neither is sufficient alone: the
// money answers "what has this cost me", the bar answers "how close am I to
// being cut off". A percentage without a figure hides the amount; a figure
// without the ceiling cannot be judged.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Wallet } from "lucide-react";

type Budget = {
  capMicros: number;
  spentMicros: number;
  remainingMicros: number;
  usedFraction: number;
  warning: boolean;
  exhausted: boolean;
  byProvider: Record<string, number>;
};

/** Micros are millionths of a dollar. Small spends round to a visible figure
 *  rather than to $0.00, because "free" is the wrong impression to leave. */
export function formatMicros(micros: number) {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0.00";
  if (dollars < 0.01) return `<$0.01`;
  return `$${dollars.toFixed(2)}`;
}

export default function ClientSpendMeter({ compact = false }: { compact?: boolean }) {
  const [budget, setBudget] = useState<Budget | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/client-runtime/budget", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok && data?.ok) setBudget(data as Budget);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // No cap configured means no ceiling to report, and inventing one would be
  // worse than showing nothing.
  if (!budget || budget.capMicros <= 0) return null;

  const percent = Math.round(budget.usedFraction * 100);
  const tone = budget.exhausted ? "#fda4af" : budget.warning ? "#fbbf24" : "#5ab896";
  const providers = Object.entries(budget.byProvider).filter(([, micros]) => micros > 0).sort((left, right) => right[1] - left[1]);

  return <section className="panel p-3.5">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        {budget.exhausted || budget.warning
          ? <AlertTriangle size={14} style={{ color: tone }} />
          : <Wallet size={14} style={{ color: tone }} />}
        <span className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>
          {formatMicros(budget.spentMicros)}
        </span>
        <span className="text-[11px]" style={{ color: "var(--cream-mute)" }}>
          of {formatMicros(budget.capMicros)} this month
        </span>
      </div>

      <div className="min-w-[140px] flex-1">
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(percent, budget.spentMicros > 0 ? 2 : 0)}%`, background: tone }} />
        </div>
      </div>

      <span className="text-[12px] font-semibold tabular-nums" style={{ color: tone }}>{percent}%</span>
    </div>

    {!compact && providers.length > 0 && <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
      {providers.map(([provider, micros]) => <span key={provider} className="text-[10px]" style={{ color: "var(--cream-mute)" }}>
        {provider} <span style={{ color: "var(--cream-dim)" }}>{formatMicros(micros)}</span>
      </span>)}
    </div>}

    {budget.exhausted
      ? <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#fda4af" }}>
          The monthly cap is reached, so further provider calls are refused with <span className="font-mono">budget_exceeded</span> until it is raised or the month rolls over. This limit is Veloce&apos;s own ledger, not a limit set at the provider.
        </p>
      : budget.warning
        ? <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#fbbf24" }}>
            Past the warning threshold. Remaining this month: {formatMicros(budget.remainingMicros)}.
          </p>
        : null}
  </section>;
}
