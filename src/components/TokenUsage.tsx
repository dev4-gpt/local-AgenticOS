"use client";

import { useEffect, useState } from "react";
import { Coins, Pencil, Plus, RefreshCw, Save, X } from "lucide-react";

interface AgentUsage {
  agent: string; calls: number; promptTokens: number; completionTokens: number;
  totalTokens: number; costUsd: number; monthCostUsd: number; todayTokens: number; models: string[]; lastTs: number;
}
interface Summary {
  agents: AgentUsage[];
  grand: { calls: number; promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number; monthCostUsd: number; todayTokens: number };
  generatedAt: number;
}
type Currency = "INR" | "USD";
interface CostEntry { id: string; label: string; kind: "subscription" | "api-budget"; amount: number; currency: Currency; enabled: boolean; }
interface CostLedger { entries: CostEntry[]; updatedAt: number | null; }

// Per-agent accent (mirrors AgentAvatar). Anything unknown falls back to gold.
const COLOR: Record<string, string> = {
  claude: "#d97757", openclaw: "#f472b6", hermes: "#60a5fa", gemini: "#4285F4",
  antigravity: "#7c3aed", freeclaude: "#10b981", codex: "#22c55e", jarvis: "#e6c69a", n2: "#7c5cff",
};
const LABEL: Record<string, string> = {
  claude: "Claude", openclaw: "OpenClaw", hermes: "Hermes", gemini: "Gemini",
  antigravity: "Antigravity", freeclaude: "Free Claude · N2", codex: "Codex", jarvis: "Jarvis",
};
function col(a: string) { return COLOR[a] ?? "#d4a574"; }
function label(a: string) { return LABEL[a] ?? (a.charAt(0).toUpperCase() + a.slice(1)); }
function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
function cost(n: number): string {
  if (!n) return "free";
  if (n < 0.01) return "<$0.01";
  return "$" + n.toFixed(2);
}
function money(n: number, currency: Currency): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: currency === "INR" ? 0 : 2 }).format(n);
}
function monthlyTotal(entries: CostEntry[], kind: CostEntry["kind"], currency: Currency): number {
  return entries.filter((entry) => entry.enabled && entry.kind === kind && entry.currency === currency).reduce((sum, entry) => sum + entry.amount, 0);
}

export default function TokenUsage() {
  const [data, setData] = useState<Summary | null>(null);
  const [ledger, setLedger] = useState<CostLedger | null>(null);
  const [draft, setDraft] = useState<CostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = () => Promise.all([
    fetch("/api/tokens", { cache: "no-store" }).then((r) => r.json()),
    fetch("/api/costs", { cache: "no-store" }).then((r) => r.json()),
  ])
    .then(([usage, costs]) => { setData(usage); setLedger(costs); if (!editing) setDraft(costs.entries ?? []); setLoading(false); })
    .catch(() => setLoading(false));

  useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t); }, []);

  const agents = data?.agents ?? [];
  const max = Math.max(1, ...agents.map((a) => a.totalTokens));
  const g = data?.grand;
  const entries = ledger?.entries ?? [];
  const usdSubscriptions = monthlyTotal(entries, "subscription", "USD");
  const inrSubscriptions = monthlyTotal(entries, "subscription", "INR");
  const usdBudgets = monthlyTotal(entries, "api-budget", "USD");
  const inrBudgets = monthlyTotal(entries, "api-budget", "INR");

  function startEditing() {
    setDraft(entries.map((entry) => ({ ...entry })));
    setSaveError(null);
    setEditing(true);
  }
  function updateEntry(id: string, patch: Partial<CostEntry>) {
    setDraft((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }
  function addEntry() {
    setDraft((current) => [...current, { id: `custom-${Date.now()}`, label: "New service", kind: "subscription", amount: 0, currency: "INR", enabled: true }]);
  }
  async function saveLedger() {
    setSaving(true); setSaveError(null);
    try {
      const response = await fetch("/api/costs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: draft }) });
      const next = await response.json() as CostLedger & { error?: string };
      if (!response.ok) throw new Error(next.error || "Could not save costs.");
      setLedger(next); setDraft(next.entries); setEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save costs.");
    } finally { setSaving(false); }
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Coins size={16} style={{ color: "var(--gold)" }} />
          <h3 className="text-[15px] font-semibold text-[var(--cream)]">Costs &amp; Usage</h3>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--cream-mute)]">local ledger</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={editing ? () => { setEditing(false); setDraft(entries); setSaveError(null); } : startEditing} className="flex items-center gap-1 text-[10.5px] text-[var(--cream-mute)] hover:text-[var(--cream)]" title={editing ? "Cancel changes" : "Edit monthly costs"}>
            {editing ? <X size={13} /> : <Pencil size={12} />}{editing ? "Cancel" : "Edit"}
          </button>
          <button onClick={load} className="text-[var(--cream-mute)] hover:text-[var(--cream)]" title="Refresh">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* totals row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 my-3">
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--line-soft)" }}>
          <div className="text-[18px] font-semibold text-[var(--cream)] font-[var(--font-bricolage,inherit)]">{g ? fmt(g.totalTokens) : "—"}</div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">total tokens</div>
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--line-soft)" }}>
          <div className="text-[18px] font-semibold text-[var(--cream)]">{g ? fmt(g.todayTokens) : "—"}</div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">today</div>
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--line-soft)" }}>
          <div className="text-[18px] font-semibold" style={{ color: g && g.monthCostUsd > 0 ? "var(--gold)" : "var(--emerald)" }}>{g ? cost(g.monthCostUsd) : "—"}</div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">API this month</div>
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--line-soft)" }}>
          <div className="text-[18px] font-semibold" style={{ color: (inrSubscriptions || usdSubscriptions) ? "var(--gold)" : "var(--cream-dim)" }}>{inrSubscriptions ? money(inrSubscriptions, "INR") : usdSubscriptions ? money(usdSubscriptions, "USD") : "Set"}</div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--cream-mute)]">subscriptions / mo</div>
        </div>
      </div>

      <div className="rounded-lg border px-3 py-2.5 mb-4" style={{ borderColor: "var(--line-soft)", background: "rgba(255,255,255,0.018)" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-[var(--cream)]">Monthly commitments</div>
            <div className="text-[10.5px] text-[var(--cream-mute)] mt-0.5">Fixed plans are entered locally; provider keys never expose a trustworthy price.</div>
          </div>
          {!editing && <div className="text-right text-[11px] text-[var(--cream-soft)] shrink-0">
            {inrSubscriptions > 0 && <div>{money(inrSubscriptions, "INR")} plans</div>}
            {usdSubscriptions > 0 && <div>{money(usdSubscriptions, "USD")} plans</div>}
            {inrBudgets > 0 && <div className="text-[var(--cream-mute)]">{money(inrBudgets, "INR")} API budget</div>}
            {usdBudgets > 0 && <div className="text-[var(--cream-mute)]">{money(usdBudgets, "USD")} API budget</div>}
            {!inrSubscriptions && !usdSubscriptions && !inrBudgets && !usdBudgets && <div className="text-[var(--cream-mute)]">Add actual plan costs</div>}
          </div>}
        </div>

        {editing && <div className="space-y-2 mt-3">
          {draft.map((entry) => (
            <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_70px_76px_86px] gap-2 items-center">
              <input value={entry.label} onChange={(event) => updateEntry(entry.id, { label: event.target.value })} aria-label={`${entry.label} name`} className="min-w-0 rounded-md border bg-transparent px-2 py-1.5 text-[11px] text-[var(--cream)]" style={{ borderColor: "var(--line-soft)" }} />
              <select value={entry.kind} onChange={(event) => updateEntry(entry.id, { kind: event.target.value as CostEntry["kind"] })} aria-label={`${entry.label} type`} className="rounded-md border bg-[var(--ink)] px-1 py-1.5 text-[10px] text-[var(--cream-soft)]" style={{ borderColor: "var(--line-soft)" }}>
                <option value="subscription">Plan</option><option value="api-budget">API cap</option>
              </select>
              <input type="number" min="0" step="0.01" value={entry.amount || ""} onChange={(event) => updateEntry(entry.id, { amount: Number(event.target.value) || 0 })} aria-label={`${entry.label} monthly amount`} placeholder="Amount" className="min-w-0 rounded-md border bg-transparent px-2 py-1.5 text-[11px] text-[var(--cream)]" style={{ borderColor: "var(--line-soft)" }} />
              <div className="flex gap-1 items-center">
                <select value={entry.currency} onChange={(event) => updateEntry(entry.id, { currency: event.target.value as Currency })} aria-label={`${entry.label} currency`} className="w-[49px] rounded-md border bg-[var(--ink)] px-1 py-1.5 text-[10px] text-[var(--cream-soft)]" style={{ borderColor: "var(--line-soft)" }}><option value="INR">INR</option><option value="USD">USD</option></select>
                <button onClick={() => updateEntry(entry.id, { enabled: !entry.enabled })} title={entry.enabled ? "Exclude from total" : "Include in total"} className="text-[10px] text-[var(--cream-mute)] hover:text-[var(--cream)]">{entry.enabled ? "On" : "Off"}</button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <button onClick={addEntry} className="flex items-center gap-1 text-[10.5px] text-[var(--cream-mute)] hover:text-[var(--cream)]"><Plus size={12} />Add service</button>
            <button onClick={saveLedger} disabled={saving} className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10.5px] font-medium text-[#1a1418] disabled:opacity-50" style={{ background: "var(--gold)" }}><Save size={12} />{saving ? "Saving" : "Save costs"}</button>
          </div>
          {saveError && <div className="text-[10.5px] text-red-300">{saveError}</div>}
        </div>}
      </div>

      {/* per-agent bars */}
      <div className="space-y-2.5">
        {agents.length === 0 && (
          <div className="text-[12.5px] text-[var(--cream-mute)] py-3 text-center">
            No usage recorded yet. Chat with Claude, talk to Hermes, or build with N2 and it shows up here.
          </div>
        )}
        {agents.map((a) => (
          <div key={a.agent}>
            <div className="flex items-center justify-between text-[12px] mb-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: col(a.agent), boxShadow: `0 0 7px ${col(a.agent)}` }} />
                <span className="text-[var(--cream)] font-medium">{label(a.agent)}</span>
                <span className="text-[var(--cream-mute)] text-[10.5px]">· {a.calls} call{a.calls === 1 ? "" : "s"}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[11px]">
                <span className="text-[var(--cream-soft)] font-medium">{fmt(a.totalTokens)} tok</span>
                <span style={{ color: a.costUsd > 0 ? "var(--gold)" : "var(--emerald)" }}>{cost(a.costUsd)}</span>
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="h-full rounded-full" style={{ width: `${(a.totalTokens / max) * 100}%`, background: col(a.agent), opacity: 0.9 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="text-[10.5px] text-[var(--cream-mute)] mt-3 leading-relaxed">
        API usage is tracked only where a model reports it. Subscriptions and API caps are your private estimates, stored in <code>~/.agentic-os/cost-ledger.json</code>. OpenClaw, Antigravity and Hermes CLI usage stay untracked rather than guessed.
      </div>
    </div>
  );
}
