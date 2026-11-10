"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatMicrosUsd } from "@/lib/adapterOverview";

// Start an adapter task from the Adapters page and follow it (ADR-020; ProofMint rounds first). What can be started, and its
// budget, come from the host's settings; only an owner or admin may start one. A start that did not get an answer can be sent
// again with the same request id, so it never starts twice. The page polls the task until it finishes and shows a short summary;
// the proposal itself is reviewed and approved in the adapter.

type Option = { adapterId: string; task: string; budgetMaxMicros: number; field?: string; choices?: string[] };
type Recent = { adapterId: string; task: string; taskId: string; at: string };
type Overview = { canStart: boolean; options: Option[]; recent: Recent[] | null };
type Counts = { candidate: number; total: number };
type Summary = { taskId: string; state: string; error?: string; spentMicros?: number; resultUnavailable?: boolean;
  result?: { verdict?: string; needsApproval?: boolean; candidateSha?: string; costMicros?: number; visible?: Counts; heldout?: Counts } };
type Watched = { adapterId: string; taskId: string };

const POLL_MS = 5_000;
const MAX_POLLS = 72; // six minutes: longer than any round may run
const FINAL = new Set(["succeeded", "failed", "cancelled"]);
const START_ERRORS: Record<string, string> = {
  not_permitted: "Only an owner or admin can start a round.",
  task_not_allowed: "This task is not offered for this workspace.",
  tasks_not_configured: "No tasks are set up for this workspace.",
  host_not_configured: "The host is not fully set up for this. Nothing was started.",
  adapter_not_ready: "Enable the adapter first.",
  budget_exceeded: "The budget for this adapter or workspace is used up. Nothing was started.",
  adapter_refused: "The adapter refused the round. Nothing was charged.",
  adapter_unavailable: "The adapter did not answer. You can try again; it will not start twice.",
  idempotency_conflict: "That round was already started differently. Start a new one.",
  runtime_rate_limited: "Too many starts just now. Wait a moment.",
  invalid_input: "That choice was not accepted. Nothing was started.",
};
const STATE_WORDS: Record<string, string> = { queued: "Waiting to start", running: "Running", succeeded: "Finished", failed: "Failed", cancelled: "Cancelled" };

const newRequestId = () => crypto.randomUUID();
const optionKey = (o: Option) => `${o.adapterId}|${o.task}`;

export default function AdapterTasksPanel() {
  const [overview, setOverview] = useState<Overview | null | "off">(null);
  const [picked, setPicked] = useState<string>("");
  const [choice, setChoice] = useState<string>("");
  const [pending, setPending] = useState<{ key: string; choice: string; requestId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [watched, setWatched] = useState<Watched | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const polls = useRef(0);

  const load = useCallback(async () => {
    const response = await fetch("/api/client-runtime/adapter-tasks", { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => null);
    if (response?.status === 403 && json?.error === "model_calls_disabled") return setOverview("off");
    if (!response?.ok || !json?.ok || !Array.isArray(json.options)) return setOverview(null);
    setOverview({ canStart: json.canStart === true, options: json.options as Option[], recent: Array.isArray(json.recent) ? (json.recent as Recent[]) : null });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Follow the watched task until it finishes or the time is up.
  useEffect(() => {
    if (!watched) return;
    let stopped = false;
    let timer: number | undefined;
    polls.current = 0;
    const check = async () => {
      polls.current += 1;
      const query = new URLSearchParams({ adapterId: watched.adapterId, taskId: watched.taskId });
      const response = await fetch(`/api/client-runtime/adapter-tasks?${query}`, { cache: "no-store" }).catch(() => null);
      const json = await response?.json().catch(() => null);
      if (stopped) return;
      if (response?.ok && json?.ok) setSummary(json as Summary);
      const done = Boolean(response?.ok && json?.ok && FINAL.has(String(json.state)));
      if (done) void load();
      else if (polls.current < MAX_POLLS) timer = window.setTimeout(() => void check(), POLL_MS);
    };
    timer = window.setTimeout(() => void check(), 0);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [watched, load]);

  if (overview === "off") return null;
  if (overview === null) return <section className="panel mt-6 p-4" role="status"><p className="text-[12px]" style={{ color: "var(--cream-mute)" }}>Adapter tasks could not be read.</p></section>;
  if (overview.options.length === 0) return null;

  const option = overview.options.find((o) => optionKey(o) === picked) ?? overview.options[0];
  const chosen = option.choices ? (option.choices.includes(choice) ? choice : option.choices[0]) : "";

  async function start() {
    const key = optionKey(option);
    // the same request id is reused only for the same task and choice, so a retry is the same round
    const requestId = pending && pending.key === key && pending.choice === chosen ? pending.requestId : newRequestId();
    setPending({ key, choice: chosen, requestId });
    setBusy(true);
    setMessage(null);
    const input = option.field ? { [option.field]: chosen } : {};
    const response = await fetch("/api/client-runtime/adapter-tasks", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adapterId: option.adapterId, task: option.task, input, requestId }),
    }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setBusy(false);
    if (response?.ok && json?.ok && typeof json.taskId === "string") {
      setPending(null);
      setSummary(null);
      setWatched({ adapterId: option.adapterId, taskId: json.taskId });
      setMessage({ ok: true, text: json.replay ? "That round was already started; showing it." : "Round started." });
      return;
    }
    const error = String(json?.error ?? "");
    // a clear refusal will not change on a retry, so the next start gets a new request id
    if (response && error !== "adapter_unavailable") setPending(null);
    setMessage({ ok: false, text: START_ERRORS[error] ?? "The host could not be reached. You can try again; it will not start twice." });
  }

  const locked = !overview.canStart || busy;
  return <section className="panel mt-6 p-4" aria-label="Adapter tasks">
    <h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>Start a round</h2>
    <p className="mt-1 max-w-2xl text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
      Runs one task on an adapter. Its budget is set aside before it starts and settled when it ends. A proposal it makes is reviewed and approved in the adapter itself.
    </p>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-[11px]" style={{ color: "var(--cream-dim)" }}>Task{" "}
        <select value={optionKey(option)} disabled={locked} onChange={(e) => setPicked(e.target.value)} className="rounded-md border bg-transparent px-2 py-1 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream)" }}>
          {overview.options.map((o) => <option key={optionKey(o)} value={optionKey(o)}>{o.adapterId} · {o.task}</option>)}
        </select>
      </label>
      {option.choices && <label className="text-[11px]" style={{ color: "var(--cream-dim)" }}>{option.field}{" "}
        <select value={chosen} disabled={locked} onChange={(e) => setChoice(e.target.value)} className="rounded-md border bg-transparent px-2 py-1 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream)" }}>
          {option.choices.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>}
      <span className="text-[11px]" style={{ color: "var(--cream-mute)" }}>Budget {formatMicrosUsd(option.budgetMaxMicros)}</span>
      <button type="button" disabled={locked} onClick={() => void start()} className="rounded-md border px-3 py-1.5 text-[11px] disabled:opacity-50" style={{ borderColor: "var(--line-soft)", color: "var(--cream)" }}>
        {busy ? "Starting..." : pending ? "Try again" : "Start"}
      </button>
    </div>
    {!overview.canStart && <p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>Only an owner or admin can start a round.</p>}
    {message && <p className="mt-2 text-[11px]" role="status" style={{ color: message.ok ? "#5ab896" : "#fda4af" }}>{message.text}</p>}
    {watched && <TaskSummary watched={watched} summary={summary} />}
    {overview.recent && overview.recent.length > 0 && <div className="mt-4">
      <h3 className="text-[11px] font-semibold" style={{ color: "var(--cream-dim)" }}>Recent rounds</h3>
      <ul className="mt-1 grid gap-1">
        {overview.recent.map((r) => <li key={`${r.adapterId}|${r.taskId}|${r.at}`} className="flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ color: "var(--cream-dim)" }}>
          <span className="font-mono text-[10px]">{r.adapterId} · {r.task} · {new Date(r.at).toLocaleString()}</span>
          <button type="button" onClick={() => { setSummary(null); setWatched({ adapterId: r.adapterId, taskId: r.taskId }); }} className="text-sky-300 underline">Check</button>
        </li>)}
      </ul>
    </div>}
  </section>;
}

function TaskSummary({ watched, summary }: { watched: Watched; summary: Summary | null }) {
  if (!summary || summary.taskId !== watched.taskId) return <p className="mt-3 text-[11px]" role="status" style={{ color: "var(--cream-mute)" }}>Checking the round...</p>;
  const r = summary.result;
  const tone = summary.state === "succeeded" ? "#5ab896" : summary.state === "failed" ? "#fda4af" : "#fbbf24";
  return <div className="mt-3 rounded-md border p-3" style={{ borderColor: "var(--line-soft)" }} role="status">
    <p className="font-mono text-[10px]" style={{ color: "var(--cream-mute)" }}>{watched.adapterId} · {summary.taskId}</p>
    <p className="mt-0.5 text-[13px] font-semibold" style={{ color: tone }}>{STATE_WORDS[summary.state] ?? summary.state}{summary.error ? ` (${summary.error})` : ""}</p>
    <dl className="mt-1 grid gap-0.5 text-[11px]" style={{ color: "var(--cream-dim)" }}>
      {summary.spentMicros !== undefined && <div><dt className="inline" style={{ color: "var(--cream-mute)" }}>Charged by the adapter: </dt><dd className="inline">{formatMicrosUsd(summary.spentMicros)}</dd></div>}
      {r?.verdict && <div><dt className="inline" style={{ color: "var(--cream-mute)" }}>Verdict: </dt><dd className="inline">{r.verdict}</dd></div>}
      {r?.heldout && <div><dt className="inline" style={{ color: "var(--cream-mute)" }}>Hidden tests passed: </dt><dd className="inline">{r.heldout.candidate} of {r.heldout.total}</dd></div>}
      {r?.visible && <div><dt className="inline" style={{ color: "var(--cream-mute)" }}>Visible tests passed: </dt><dd className="inline">{r.visible.candidate} of {r.visible.total}</dd></div>}
      {r?.candidateSha && <div><dt className="inline" style={{ color: "var(--cream-mute)" }}>Proposal fingerprint: </dt><dd className="inline font-mono text-[10px]">{r.candidateSha.slice(0, 12)}…</dd></div>}
    </dl>
    {r?.needsApproval && <p className="mt-1 text-[11px]" style={{ color: "#fbbf24" }}>Needs a person to approve it in the adapter before it is used.</p>}
    {summary.resultUnavailable && <p className="mt-1 text-[11px]" style={{ color: "var(--cream-mute)" }}>The round finished, but its result could not be read just now.</p>}
  </div>;
}
