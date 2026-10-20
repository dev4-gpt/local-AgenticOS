"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import {
  buildApprovalCards, decisionErrorMessage, parseApprovalsResponse, waitingCount,
  type ApprovalCard, type ParsedApprovals, type StatusTone,
} from "@/lib/adapterApprovalsView";

type LoadState = "loading" | "ready" | "disabled" | "signed-out" | "unavailable";
type Notice = { tone: "good" | "bad"; text: string } | null;

const TONE_COLOR: Record<StatusTone, string> = { waiting: "#fbbf24", good: "#5ab896", bad: "#fda4af", muted: "var(--cream-mute)" };
const CLOCK_TICK_MS = 30_000;

export default function ApprovalsView() {
  const [parsed, setParsed] = useState<ParsedApprovals | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    const response = await fetch("/api/client-runtime/adapter-approvals", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setNow(Date.now());
    if (response?.ok) {
      const result = parseApprovalsResponse(data);
      if (result) { setParsed(result); setState("ready"); return; }
    } else if (response?.status === 401) { setState("signed-out"); return; }
    else if (data?.error === "adapter_host_disabled") { setState("disabled"); return; }
    setState("unavailable");
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => { void load(); }, 0);
    const tick = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => { window.clearTimeout(first); window.clearInterval(tick); };
  }, [load]);

  const cards = useMemo(() => (parsed ? buildApprovalCards(parsed, now) : []), [parsed, now]);
  const waiting = waitingCount(cards);

  async function decide(card: ApprovalCard, decision: "approve" | "reject") {
    setBusyId(card.id);
    setNotice(null);
    const response = await fetch(`/api/client-runtime/adapter-approvals/${card.id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Approving repeats the exact fingerprint that was shown, so the database can refuse it if anything changed.
      body: JSON.stringify(decision === "approve" ? { decision, expectedActionHash: card.actionHash } : { decision }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusyId(null);
    setConfirmingId(null);
    if (response?.ok && data?.ok) {
      setNotice({ tone: "good", text: decision === "approve" ? "Approved. The host will run it next." : "Rejected. Nothing will run." });
    } else {
      setNotice({ tone: "bad", text: decisionErrorMessage(data?.error) });
    }
    await load();
  }

  return <div className="mx-auto max-w-4xl">
    <Link href="/adapters" className="inline-flex items-center gap-1 text-[11px] text-sky-300 underline"><ArrowLeft size={12} />Back to adapters</Link>
    <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow">Adapter host</p>
        <h1 className="mt-1 text-3xl font-semibold" style={{ color: "var(--cream)" }}>Approvals</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          Anything an adapter wants to publish, share or switch on needs a second person. You see exactly the content the request covers, and your approval is tied to its fingerprint: if anything changes, it no longer counts.
        </p>
      </div>
      <button type="button" onClick={() => void load()} disabled={state === "loading"} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>
        <RefreshCw size={13} className={state === "loading" ? "animate-spin" : ""} />Refresh
      </button>
    </div>

    {notice && <p role="status" className="panel mt-4 flex items-center gap-2 p-3 text-[12px]" style={{ color: notice.tone === "good" ? "#5ab896" : "#fda4af" }}>
      {notice.tone === "good" ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}{notice.text}
    </p>}

    {state === "loading" && <p className="panel mt-6 p-4 text-[12px]" style={{ color: "var(--cream-mute)" }}>Loading approvals...</p>}
    {state === "disabled" && <Message title="The adapter host is not switched on" body="Nothing is wrong. Approvals appear here once adapters are switched on for this workspace." />}
    {state === "signed-out" && <Message title="Sign in to see approvals" body="This page shows requests for your workspace only, so it needs a signed-in member." />}
    {state === "unavailable" && <Message warn title="Approvals unavailable" body="The list could not be read, so no request is shown and nothing can be decided. Nothing here is a guess." />}
    {state === "ready" && cards.length === 0 && <Message title="No approval requests" body="When an adapter asks to publish, share or switch something on, the request will appear here." />}

    {state === "ready" && cards.length > 0 && <>
      <p className="mt-6 text-[12px]" style={{ color: "var(--cream-dim)" }} aria-live="polite">
        {waiting === 0 ? "Nothing is waiting for you." : `${waiting} ${waiting === 1 ? "request is" : "requests are"} waiting for a second person.`}
      </p>
      <ul className="mt-3 grid gap-4" aria-label="Approval requests">
        {cards.map((card) => <li key={card.id}>
          <Card card={card} busy={busyId === card.id} anyBusy={busyId !== null} confirming={confirmingId === card.id}
            onAskApprove={() => setConfirmingId(card.id)} onCancel={() => setConfirmingId(null)} onDecide={(decision) => void decide(card, decision)} />
        </li>)}
      </ul>
    </>}
  </div>;
}

function Card({ card, busy, anyBusy, confirming, onAskApprove, onCancel, onDecide }: {
  card: ApprovalCard; busy: boolean; anyBusy: boolean; confirming: boolean;
  onAskApprove: () => void; onCancel: () => void; onDecide: (decision: "approve" | "reject") => void;
}) {
  const color = TONE_COLOR[card.tone];
  const open = card.effectiveStatus === "pending";
  return <article className="panel p-4" aria-labelledby={`approval-${card.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={`approval-${card.id}`} className="text-[15px] font-semibold" style={{ color: "var(--cream)" }}>{card.kindLabel}</h2>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--cream-mute)" }}>
          <span className="font-mono">{card.adapterId}</span> · requested by {card.requestedByLabel}{card.decidedByLabel ? ` · decided by ${card.decidedByLabel}` : ""}
        </p>
      </div>
      <div className="text-right">
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: "var(--line-soft)", color }}>
          {card.tone === "good" ? <CheckCircle2 size={11} aria-hidden="true" /> : card.tone === "bad" ? <XCircle size={11} aria-hidden="true" /> : <Clock size={11} aria-hidden="true" />}
          {card.statusLabel}
        </span>
        {card.timeLeftLabel && <p className="mt-1 text-[10px]" style={{ color: "var(--cream-mute)" }}>{card.timeLeftLabel}</p>}
      </div>
    </div>

    <dl className="mt-3 grid gap-1.5 text-[11px]" style={{ color: "var(--cream-dim)" }}>
      <div><dt className="inline" style={{ color: "var(--cream-mute)" }}>Destination: </dt><dd className="inline break-all">{card.destination}</dd></div>
      <div><dt className="inline" style={{ color: "var(--cream-mute)" }}>Policy version: </dt><dd className="inline">{card.policyVersion}</dd></div>
      <div><dt className="inline" style={{ color: "var(--cream-mute)" }}>Fingerprint: </dt><dd className="inline font-mono" title={card.actionHash}>{card.shortHash}…</dd></div>
    </dl>

    <div className="mt-3">
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Content this approval covers</p>
      {card.content
        ? <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 font-mono text-[11px] leading-relaxed" style={{ borderColor: "var(--line-soft)", color: "var(--cream)" }} tabIndex={0} aria-label="Content that will be acted on">{card.content.payloadText}</pre>
        : <p className="mt-1 flex items-start gap-1.5 text-[11px]" style={{ color: "#fbbf24" }}><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />{card.contentProblem}</p>}
    </div>

    {open && card.blockedReason && <p className="mt-3 text-[11px]" style={{ color: "var(--cream-dim)" }}><ShieldCheck size={12} className="mr-1 inline" aria-hidden="true" />{card.blockedReason}</p>}

    {open && (card.canApprove || card.canReject) && !confirming && <div className="mt-3 flex flex-wrap gap-2">
      {card.canApprove && <button type="button" disabled={anyBusy} onClick={onAskApprove} className="rounded-md border px-3 py-1.5 text-[11px] font-semibold" style={{ borderColor: "#5ab896", color: "#5ab896" }}>Approve</button>}
      {card.canReject && <button type="button" disabled={anyBusy} onClick={() => onDecide("reject")} className="rounded-md border px-3 py-1.5 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>{busy ? "Working..." : "Reject"}</button>}
    </div>}

    {open && card.canApprove && confirming && <div className="mt-3 rounded-md border p-3" style={{ borderColor: "#5ab896" }} role="group" aria-label="Confirm approval">
      <p className="text-[12px]" style={{ color: "var(--cream)" }}>Approve exactly the content above? Your approval is tied to fingerprint <span className="font-mono">{card.shortHash}…</span>. If the content changes, it will not count.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={anyBusy} onClick={() => onDecide("approve")} className="rounded-md border px-3 py-1.5 text-[11px] font-semibold" style={{ borderColor: "#5ab896", color: "#5ab896" }}>{busy ? "Approving..." : "Yes, approve this"}</button>
        <button type="button" disabled={anyBusy} onClick={onCancel} className="rounded-md border px-3 py-1.5 text-[11px]" style={{ borderColor: "var(--line-soft)", color: "var(--cream-dim)" }}>Cancel</button>
      </div>
    </div>}
  </article>;
}

function Message({ title, body, warn = false }: { title: string; body: string; warn?: boolean }) {
  return <section className="panel mt-6 flex items-start gap-3 p-4" role="status">
    {warn && <AlertTriangle size={16} style={{ color: "#fbbf24" }} aria-hidden="true" />}
    <div><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{title}</h2><p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{body}</p></div>
  </section>;
}
