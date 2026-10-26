"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Plug, RefreshCw, ShieldAlert } from "lucide-react";
import { formatMicrosUsd, type AdapterCard } from "@/lib/adapterOverview";
import type { ActivityGroup } from "@/lib/adapterActivity";
import type { SpendGroup } from "@/lib/adapterSpendReconcile";
import { describeSyncSwitch, type SyncSwitchStatus } from "@/lib/adapterSyncSwitch";

type SwitchData = { canChange: boolean; adapters: Array<{ adapterId: string; enabled: boolean; status: SyncSwitchStatus }> };

type LoadState = "loading" | "ready" | "disabled" | "signed-out" | "unavailable";

const TONE: Record<AdapterCard["capStatus"], string> = { "no-cap": "var(--cream-mute)", ok: "#5ab896", warning: "#fbbf24", exhausted: "#fda4af" };
const PERIOD_WORD = { day: "today", month: "this month", total: "in total" } as const;

export default function AdaptersView() {
  const [cards, setCards] = useState<AdapterCard[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  // null means the activity counts could not be read; the adapter cards above do not depend on them.
  const [activity, setActivity] = useState<{ windowDays: number; groups: ActivityGroup[] } | null>(null);
  // Same for the spend check: null means it could not be read, and the panel says so instead of showing nothing.
  const [spend, setSpend] = useState<{ windowDays: number; groups: SpendGroup[] } | null>(null);
  // Same for the sync switch: null means it could not be read, and the panel says so instead of hiding the control.
  const [syncSwitch, setSyncSwitch] = useState<SwitchData | null>(null);

  const loadSwitch = useCallback(async () => {
    const response = await fetch("/api/client-runtime/adapter-sync-switch", { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setSyncSwitch(response?.ok && json?.ok && Array.isArray(json.adapters) ? { canChange: json.canChange === true, adapters: json.adapters as SwitchData["adapters"] } : null);
  }, []);

  const load = useCallback(async () => {
    setState("loading");
    const [response, activityResponse, spendResponse] = await Promise.all([
      fetch("/api/client-runtime/adapters", { cache: "no-store" }).catch(() => null),
      fetch("/api/client-runtime/adapter-activity", { cache: "no-store" }).catch(() => null),
      fetch("/api/client-runtime/adapter-spend", { cache: "no-store" }).catch(() => null),
      loadSwitch(),
    ]);
    const data = await response?.json().catch(() => null);
    const activityData = await activityResponse?.json().catch(() => null);
    const spendData = await spendResponse?.json().catch(() => null);
    setSpend(spendResponse?.ok && spendData?.ok && Array.isArray(spendData.groups) ? { windowDays: Number(spendData.windowDays), groups: spendData.groups as SpendGroup[] } : null);
    setActivity(activityResponse?.ok && activityData?.ok && Array.isArray(activityData.groups) ? { windowDays: Number(activityData.windowDays), groups: activityData.groups as ActivityGroup[] } : null);
    if (response?.ok && data?.ok && Array.isArray(data.adapters)) {
      setCards(data.adapters as AdapterCard[]);
      setState("ready");
    } else if (response?.status === 401) setState("signed-out");
    else if (data?.error === "adapter_host_disabled") setState("disabled");
    else setState("unavailable");
  }, [loadSwitch]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return <div className="mx-auto max-w-5xl">
    <Link href="/" className="inline-flex items-center gap-1 text-[11px] text-sky-300 underline"><ArrowLeft size={12} />Back to home</Link>
    <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow">Adapter host</p>
        <h1 className="mt-1 text-3xl font-semibold" style={{ color: "var(--cream)" }}>Adapters</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          Products plugged into Veloce. Each one keeps its own private memory. It can only propose shared memory or a publish action, and a second person has to approve it.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/adapters/approvals" className="text-[11px] text-sky-300 underline">Approvals</Link>
        <Link href="/adapters/promotions" className="text-[11px] text-sky-300 underline">Shared memory review</Link>
        <button type="button" onClick={() => void load()} disabled={state === "loading"} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>
          <RefreshCw size={13} className={state === "loading" ? "animate-spin" : ""} />Refresh
        </button>
      </div>
    </div>

    {state === "loading" && <p className="panel mt-6 p-4 text-[12px]" style={{ color: "var(--cream-mute)" }}>Loading adapters...</p>}
    {state === "disabled" && <Notice title="The adapter host is not switched on" body="Nothing is wrong. Adapters stay off until the host flag is set for this workspace." />}
    {state === "signed-out" && <Notice title="Sign in to see adapters" body="This page shows data for your workspace only, so it needs a signed-in member." />}
    {state === "unavailable" && <Notice warn title="Adapter status unavailable" body="The adapter list could not be read, so no state or spend is shown. Nothing here is a guess." />}
    {state === "ready" && cards.length === 0 && <Notice title="No adapters registered yet" body="Every adapter starts disabled once it is registered. None has been registered for this workspace." />}

    {state === "ready" && cards.length > 0 && <SyncSwitchPanel data={syncSwitch} onChanged={loadSwitch} />}

    {state === "ready" && cards.length > 0 && <ul className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Registered adapters">
      {cards.map((card) => <li key={card.adapterId}><Card card={card} /></li>)}
    </ul>}

    {state === "ready" && <SpendPanel spend={spend} />}
    {state === "ready" && <ActivityPanel activity={activity} />}
  </div>;
}

const SWITCH_DURATIONS = [["1h", "1 hour"], ["4h", "4 hours"], ["24h", "24 hours"]] as const;
const SWITCH_ERRORS: Record<string, string> = {
  not_found: "Only an owner or admin can change this.",
  not_allowed: "Only an owner or admin can change this.",
  always_not_allowed: "Always on is not allowed for this workspace.",
  adapter_not_active: "Enable the adapter first.",
  invalid_input: "That choice was not accepted. Nothing was changed.",
  runtime_rate_limited: "Too many changes just now. Wait a moment.",
};
const SWITCH_UNAVAILABLE = "The host could not be reached. Nothing was changed.";

/** The visible control that keeps the sync from keeping a paid adapter service running (ADR-019). */
function SyncSwitchPanel({ data, onChanged }: { data: SwitchData | null; onChanged: () => Promise<void> }) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ adapterId: string; ok: boolean; text: string } | null>(null);
  if (!data) return <Notice warn title="Sync switch unavailable" body="The sync switch could not be read, so its state is not shown. Nothing here is a guess." />;
  if (data.adapters.length === 0) return null;

  async function send(adapterId: string, body: Record<string, unknown>, done: string) {
    setBusy(adapterId);
    setMessage(null);
    const response = await fetch("/api/client-runtime/adapter-sync-switch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adapterId, ...body }) }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setBusy(null);
    if (response?.ok && json?.ok) {
      setMessage({ adapterId, ok: true, text: done });
      await onChanged();
    } else setMessage({ adapterId, ok: false, text: SWITCH_ERRORS[String(json?.error)] ?? SWITCH_UNAVAILABLE });
  }

  return <section className="panel mt-6 p-4" aria-label="Sync switch">
    <h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Sync switch</h2>
    <p className="mt-1 max-w-2xl text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
      Keeping an adapter in sync keeps its service running, and that is what costs money. Leave it off and turn it on only when you need it. It switches itself off when the time is up. Deletions are always delivered, and Sync now runs one sync without turning anything on.
    </p>
    <ul className="mt-3 grid gap-3">
      {data.adapters.map(({ adapterId, enabled, status }) => {
        const words = describeSyncSwitch(status);
        const isOn = status.mode !== "off";
        const picked = choice[adapterId] ?? "1h";
        const locked = !data.canChange || !enabled || busy !== null;
        return <li key={adapterId} className="rounded-md border p-3" style={{ borderColor: "var(--line-soft)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px]" style={{ color: "var(--cream-mute)" }}>{adapterId}</p>
              <p className="mt-0.5 text-[13px] font-semibold" style={{ color: isOn ? "#fbbf24" : "#5ab896" }}>{words.headline}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" role="switch" aria-checked={isOn} aria-label={`Sync for ${adapterId}`} disabled={locked}
                onClick={() => void send(adapterId, { action: "set", mode: isOn ? "off" : picked }, isOn ? "Sync is off." : "Sync is on.")}
                className="relative h-6 w-11 rounded-full border transition-colors disabled:opacity-50" style={{ borderColor: "var(--line-soft)", background: isOn ? "#fbbf24" : "rgba(255,255,255,0.08)" }}>
                <span className="absolute top-0.5 rounded-full bg-white transition-all" style={{ left: isOn ? "1.35rem" : "0.15rem", height: "1.1rem", width: "1.1rem" }} />
              </button>
              {!isOn && <label className="text-[11px]" style={{ color: "var(--cream-dim)" }}>for{" "}
                <select value={picked} disabled={locked} onChange={(event) => setChoice({ ...choice, [adapterId]: event.target.value })} className="rounded-md border bg-transparent px-2 py-1 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream)" }}>
                  {SWITCH_DURATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  {status.alwaysAllowed && <option value="always">Always</option>}
                </select>
              </label>}
              <button type="button" disabled={locked || status.syncNowPending} onClick={() => void send(adapterId, { action: "sync_now" }, "One sync is queued. It runs within about 5 minutes.")}
                className="rounded-md border px-3 py-1.5 text-[11px] disabled:opacity-50" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>
                {status.syncNowPending ? "Sync queued" : "Sync now"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{words.detail}</p>
          {!data.canChange && <p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>Only an owner or admin can change this.</p>}
          {!enabled && <p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>This adapter is not enabled, so there is nothing to sync.</p>}
          {message?.adapterId === adapterId && <p className="mt-1 text-[11px]" role="status" style={{ color: message.ok ? "#5ab896" : "#fda4af" }}>{message.text}</p>}
        </li>;
      })}
    </ul>
  </section>;
}

function SpendPanel({ spend }: { spend: { windowDays: number; groups: SpendGroup[] } | null }) {
  if (!spend) return <Notice warn title="Spend check unavailable" body="The comparison with the budget ledger could not be read. Nothing is shown rather than a guess." />;
  const flagged = spend.groups.reduce((sum, group) => sum + group.flagged, 0);
  return <section className="panel mt-6 p-4" aria-label="Spend check">
    <h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Spend check <span style={{ color: "var(--cream-mute)" }}>(last {spend.windowDays} days)</span></h2>
    <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
      Compares what each adapter says a finished task cost with the budget ledger. It only flags a difference; it never blocks or changes anything.
    </p>
    {spend.groups.length === 0
      ? <p className="mt-2 text-[12px]" style={{ color: "var(--cream-mute)" }}>No finished tasks have reported their spend yet.</p>
      : <>
        {flagged > 0 && <p className="mt-2 flex items-center gap-1.5 text-[12px]" style={{ color: "#fbbf24" }} role="status"><AlertTriangle size={13} aria-hidden="true" />{flagged} {flagged === 1 ? "task" : "tasks"} where the reported spend and the ledger do not agree.</p>}
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {spend.groups.map((group) => <li key={group.adapterId}>
            <p className="font-mono text-[10px]" style={{ color: "var(--cream-mute)" }}>{group.adapterId}</p>
            <dl className="mt-1 grid gap-0.5 text-[11px]" style={{ color: "var(--cream-dim)" }}>
              {group.lines.map((line) => <div key={line.status} className="flex justify-between gap-3"><dt>{line.label}</dt><dd className="tabular-nums" style={{ color: line.status === "matched" || line.status === "open" ? "var(--cream)" : "#fbbf24" }}>{line.count}</dd></div>)}
            </dl>
          </li>)}
        </ul>
      </>}
  </section>;
}

function ActivityPanel({ activity }: { activity: { windowDays: number; groups: ActivityGroup[] } | null }) {
  if (!activity) return <Notice warn title="Recent activity unavailable" body="The event counts could not be read. Nothing is shown rather than a guess." />;
  return <section className="panel mt-6 p-4" aria-label="Recent activity">
    <h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Recent activity <span style={{ color: "var(--cream-mute)" }}>(last {activity.windowDays} days)</span></h2>
    {activity.groups.length === 0
      ? <p className="mt-2 text-[12px]" style={{ color: "var(--cream-mute)" }}>No approvals, memory changes or budget events yet.</p>
      : <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {activity.groups.map((group) => <li key={group.adapterId ?? "workspace"}>
          <p className="font-mono text-[10px]" style={{ color: "var(--cream-mute)" }}>{group.adapterId ?? "workspace"}</p>
          <dl className="mt-1 grid gap-0.5 text-[11px]" style={{ color: "var(--cream-dim)" }}>
            {group.lines.map((line) => <div key={line.eventType} className="flex justify-between gap-3"><dt>{line.label}</dt><dd className="tabular-nums" style={{ color: "var(--cream)" }}>{line.count}</dd></div>)}
          </dl>
        </li>)}
      </ul>}
  </section>;
}

function Card({ card }: { card: AdapterCard }) {
  const percent = card.usedFraction === null ? 0 : Math.min(100, Math.round(card.usedFraction * 100));
  const tone = TONE[card.capStatus];
  const outside = card.deletionGuarantee === "none";
  return <article className="panel h-full p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "var(--cream)" }}><Plug size={14} aria-hidden="true" />{card.displayName}</h2>
        <p className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--cream-mute)" }}>{card.adapterId}</p>
      </div>
      <span className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: "var(--line-soft)", color: card.state === "enabled" ? "#5ab896" : "var(--cream-dim)" }}>{card.stateLabel}</span>
    </div>

    <dl className="mt-3 grid gap-1.5 text-[11px]" style={{ color: "var(--cream-dim)" }}>
      <div><dt className="inline" style={{ color: "var(--cream-mute)" }}>Capability: </dt><dd className="inline">{card.riskLabel}</dd></div>
      <div className="flex items-start gap-1.5">
        {outside && <ShieldAlert size={13} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} aria-hidden="true" />}
        <div><dt className="inline" style={{ color: "var(--cream-mute)" }}>Deletion: </dt><dd className="inline" style={outside ? { color: "#fbbf24" } : undefined}>{card.deletionLabel}</dd></div>
      </div>
      <div><dt className="inline" style={{ color: "var(--cream-mute)" }}>Open reservations: </dt><dd className="inline">{card.openReservations}</dd></div>
    </dl>

    <div className="mt-3">
      {card.budgetCapMicros === null || card.budgetPeriod === null
        ? <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}>No cap of its own. Only the workspace monthly cap applies. Spent this month: {formatMicrosUsd(card.spentMonthMicros)}</p>
        : <>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span style={{ color: "var(--cream)" }}>{formatMicrosUsd(card.spentPeriodMicros)} <span style={{ color: "var(--cream-mute)" }}>of {formatMicrosUsd(card.budgetCapMicros)} {PERIOD_WORD[card.budgetPeriod]}</span></span>
            <span className="font-semibold tabular-nums" style={{ color: tone }}>{percent}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${card.displayName} budget used`}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(percent, card.spentPeriodMicros > 0 ? 2 : 0)}%`, background: tone }} />
          </div>
          {card.capStatus === "exhausted" && <p className="mt-1.5 text-[10px]" style={{ color: "#fda4af" }}>Cap reached. New reservations for this adapter are refused until the period rolls over or the cap is raised.</p>}
          {card.capStatus === "warning" && <p className="mt-1.5 text-[10px]" style={{ color: "#fbbf24" }}>Close to the cap.</p>}
        </>}
    </div>
  </article>;
}

function Notice({ title, body, warn = false }: { title: string; body: string; warn?: boolean }) {
  return <section className="panel mt-6 flex items-start gap-3 p-4" role="status">
    {warn && <AlertTriangle size={16} style={{ color: "#fbbf24" }} aria-hidden="true" />}
    <div><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{title}</h2><p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{body}</p></div>
  </section>;
}
