"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  buildPromotionCards, buildSharedNoteCards, canSubmitApproval, minNoteChars, parsePromotionsResponse, promotionErrorMessage,
  revokeReasonIsEnough, waitingPromotionCount, LABEL_CHOICES, REVOKE_REASON_MAX_CHARS,
  type ApprovableLabel, type ParsedPromotions, type PromotionCard, type SharedNoteCard, type Tone,
} from "@/lib/adapterPromotionsView";

type LoadState = "loading" | "ready" | "disabled" | "signed-out" | "unavailable";
type Notice = { tone: "good" | "bad"; text: string } | null;

const TONE_COLOR: Record<Tone, string> = { waiting: "#fbbf24", good: "#5ab896", bad: "#fda4af", muted: "var(--cream-mute)" };
const VERDICT_COLOR = { clean: "#5ab896", flagged: "#fbbf24", blocked: "#fda4af" } as const;
const GOOD = "#5ab896";
const lineBorder = { borderColor: "var(--line-soft)" } as const;

export default function PromotionsView() {
  const [parsed, setParsed] = useState<ParsedPromotions | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [labels, setLabels] = useState<Record<string, ApprovableLabel | undefined>>({});
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    const response = await fetch("/api/client-runtime/adapter-promotions", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok) {
      const result = parsePromotionsResponse(data);
      if (result) { setParsed(result); setState("ready"); return; }
    } else if (response?.status === 401) { setState("signed-out"); return; }
    else if (data?.error === "adapter_host_disabled") { setState("disabled"); return; }
    setState("unavailable");
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(first);
  }, [load]);

  const cards = useMemo(() => (parsed ? buildPromotionCards(parsed) : []), [parsed]);
  const sharedCards = useMemo(() => (parsed ? buildSharedNoteCards(parsed) : []), [parsed]);
  const waiting = waitingPromotionCount(cards);

  async function send(url: string, body: Record<string, unknown>, success: string, id: string) {
    setBusyId(id);
    setNotice(null);
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusyId(null);
    setConfirmingId(null);
    setRevokingId(null);
    setNotice(response?.ok && data?.ok ? { tone: "good", text: data.changed === false ? "It had already been withdrawn. Nothing more was done." : success } : { tone: "bad", text: promotionErrorMessage(data?.error) });
    await load();
  }

  const decide = (card: PromotionCard, decision: "approve" | "reject") => {
    const note = (notes[card.id] ?? "").trim();
    // Approving repeats the content fingerprint that was shown, so the database can refuse it if the note changed.
    // It also carries the label the reviewer chose; a rejection carries none.
    return send(`/api/client-runtime/adapter-promotions/${card.id}/decision`,
      decision === "approve" ? { decision, expectedContentSha256: card.contentHash, note, sensitivity: labels[card.id] } : { decision, note },
      decision === "approve" ? "Approved. The host can now share this note." : "Rejected. Nothing will be shared.", card.id);
  };
  const revoke = (note: SharedNoteCard) => send(`/api/client-runtime/adapter-memory/${note.id}/revoke`, { reason: (reasons[note.id] ?? "").trim() }, "Withdrawn. The text is erased and adapters are told to drop it.", note.id);

  const open = cards.filter((c) => c.open);
  const decided = cards.filter((c) => !c.open);

  return <div className="mx-auto max-w-4xl">
    <Link href="/adapters" className="inline-flex items-center gap-1 text-[11px] text-sky-300 underline"><ArrowLeft size={12} />Back to adapters</Link>
    <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow">Adapter host</p>
        <h1 className="mt-1 text-3xl font-semibold" style={{ color: "var(--cream)" }}>Shared memory review</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          Every adapter can read shared memory, so a note only gets in after a second person has read it. Read the note itself, check where it came from, and read the scan. A scan is a tripwire, not a guarantee.
        </p>
      </div>
      <button type="button" onClick={() => void load()} disabled={state === "loading"} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[11px]" style={{ ...lineBorder, color: "var(--cream-dim)" }}>
        <RefreshCw size={13} className={state === "loading" ? "animate-spin" : ""} />Refresh
      </button>
    </div>

    {notice && <p role="status" className="panel mt-4 flex items-center gap-2 p-3 text-[12px]" style={{ color: notice.tone === "good" ? GOOD : "#fda4af" }}>
      {notice.tone === "good" ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}{notice.text}
    </p>}

    {state === "loading" && <p className="panel mt-6 p-4 text-[12px]" style={{ color: "var(--cream-mute)" }}>Loading...</p>}
    {state === "disabled" && <Message title="The adapter host is not switched on" body="Nothing is wrong. Shared-memory review appears here once adapters are switched on for this workspace." />}
    {state === "signed-out" && <Message title="Sign in to review shared memory" body="This page shows your workspace only, so it needs a signed-in member." />}
    {state === "unavailable" && <Message warn title="Review unavailable" body="The list could not be read, so no note is shown and nothing can be decided. Nothing here is a guess." />}

    {state === "ready" && <>
      <p className="mt-6 text-[12px]" style={{ color: "var(--cream-dim)" }} aria-live="polite">
        {waiting === 0 ? "Nothing is waiting for review." : `${waiting} ${waiting === 1 ? "note is" : "notes are"} waiting for review.`}
      </p>
      <ul className="mt-3 grid gap-4" aria-label="Notes waiting for review">
        {open.map((card) => <li key={card.id}><Waiting card={card} note={notes[card.id] ?? ""} label={labels[card.id] ?? null} onLabel={(value) => setLabels((m) => ({ ...m, [card.id]: value }))} busy={busyId === card.id} anyBusy={busyId !== null} confirming={confirmingId === card.id}
          onNote={(text) => setNotes((m) => ({ ...m, [card.id]: text }))} onAskApprove={() => setConfirmingId(card.id)} onCancel={() => setConfirmingId(null)} onDecide={(d) => void decide(card, d)} /></li>)}
      </ul>

      {decided.length > 0 && <section className="mt-8" aria-labelledby="decided-heading">
        <h2 id="decided-heading" className="text-[15px] font-semibold" style={{ color: "var(--cream)" }}>Already decided</h2>
        <ul className="mt-2 grid gap-2">
          {decided.map((card) => <li key={card.id} className="panel p-3 text-[11px]" style={{ color: "var(--cream-dim)" }}>
            <span className="font-semibold" style={{ color: TONE_COLOR[card.tone] }}>{card.statusLabel}</span>{card.labelTitle ? <span> · labelled {card.labelTitle.toLowerCase()}</span> : null} · <span className="font-mono">{card.adapterId}</span> · requested by {card.requestedByLabel}{card.reviewedByLabel ? ` · decided by ${card.reviewedByLabel}` : ""}
            {card.decisionNote ? <span> · “{card.decisionNote}”</span> : null}
            {card.content ? <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]" style={{ color: "var(--cream-mute)" }}>{card.content}</pre> : null}
          </li>)}
        </ul>
      </section>}

      <section className="mt-10" aria-labelledby="shared-heading">
        <h2 id="shared-heading" className="text-[15px] font-semibold" style={{ color: "var(--cream)" }}>Shared notes</h2>
        <p className="mt-1 text-[11px]" style={{ color: "var(--cream-mute)" }}>What every adapter can read now. If one is wrong or unsafe, withdraw it: the text is erased for good and adapters are told to drop their copies. A copy an adapter already keeps in its own store is outside this guarantee.</p>
        {sharedCards.length === 0 ? <p className="panel mt-3 p-3 text-[12px]" style={{ color: "var(--cream-mute)" }}>No notes are shared yet.</p> : <ul className="mt-3 grid gap-3" aria-label="Shared notes">
          {sharedCards.map((note) => <li key={note.id} className="panel p-3">
            <p className="text-[11px]" style={{ color: "var(--cream-mute)" }}><span className="font-mono">{note.adapterId}</span> · <span style={{ color: note.sensitivity === "ordinary" ? GOOD : "#fbbf24" }}>{note.sensitivityTitle}</span> · fingerprint <span className="font-mono">{note.shortHash}…</span></p>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]" style={{ color: "var(--cream)" }} tabIndex={0}>{note.content}</pre>
            {note.hiddenCharacterCount > 0 && <p className="mt-1 text-[10px]" style={{ color: "#fbbf24" }}><ShieldAlert size={11} className="mr-1 inline" aria-hidden="true" />{note.hiddenCharacterCount} invisible character(s) are shown in square brackets.</p>}
            {note.canRevoke && (revokingId === note.id
              ? <div className="mt-2 rounded-md border p-2" style={{ borderColor: "#fda4af" }} role="group" aria-label="Confirm withdrawal">
                <label className="block text-[11px]" style={{ color: "var(--cream)" }} htmlFor={`reason-${note.id}`}>Why is it being withdrawn? (5 to {REVOKE_REASON_MAX_CHARS} characters)</label>
                <textarea id={`reason-${note.id}`} value={reasons[note.id] ?? ""} onChange={(e) => setReasons((m) => ({ ...m, [note.id]: e.target.value }))} rows={2} maxLength={REVOKE_REASON_MAX_CHARS} className="mt-1 w-full rounded-md border bg-transparent p-2 text-[11px]" style={{ ...lineBorder, color: "var(--cream)" }} />
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={busyId !== null || !revokeReasonIsEnough(reasons[note.id] ?? "")} onClick={() => void revoke(note)} className="rounded-md border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50" style={{ borderColor: "#fda4af", color: "#fda4af" }}>{busyId === note.id ? "Withdrawing..." : "Withdraw for good"}</button>
                  <button type="button" disabled={busyId !== null} onClick={() => setRevokingId(null)} className="rounded-md border px-3 py-1.5 text-[11px]" style={{ ...lineBorder, color: "var(--cream-dim)" }}>Cancel</button>
                </div>
              </div>
              : <button type="button" disabled={busyId !== null} onClick={() => setRevokingId(note.id)} className="mt-2 rounded-md border px-3 py-1.5 text-[11px]" style={{ ...lineBorder, color: "var(--cream-dim)" }}>Withdraw</button>)}
          </li>)}
        </ul>}
      </section>
    </>}
  </div>;
}

function Waiting({ card, note, label, onLabel, busy, anyBusy, confirming, onNote, onAskApprove, onCancel, onDecide }: {
  card: PromotionCard; note: string; label: ApprovableLabel | null; onLabel: (value: ApprovableLabel) => void; busy: boolean; anyBusy: boolean; confirming: boolean;
  onNote: (text: string) => void; onAskApprove: () => void; onCancel: () => void; onDecide: (decision: "approve" | "reject") => void;
}) {
  const verdictColor = card.verdict ? VERDICT_COLOR[card.verdict] : "#fda4af";
  const enough = canSubmitApproval(card, note, label);
  const minChars = minNoteChars(card, label);
  return <article className="panel p-4" aria-labelledby={`promotion-${card.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id={`promotion-${card.id}`} className="text-[15px] font-semibold" style={{ color: "var(--cream)" }}>A note from <span className="font-mono">{card.adapterId}</span> wants to be shared</h2>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--cream-mute)" }}>Requested by {card.requestedByLabel} · fingerprint <span className="font-mono">{card.shortHash}…</span></p>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]" style={{ ...lineBorder, color: TONE_COLOR[card.tone] }}><Clock size={11} aria-hidden="true" />{card.statusLabel}</span>
    </div>

    <div className="mt-3 rounded-md border p-3" style={{ borderColor: verdictColor }}>
      <p className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: verdictColor }}>{card.verdict === "clean" ? <ShieldCheck size={14} aria-hidden="true" /> : <ShieldAlert size={14} aria-hidden="true" />}{card.verdictLabel}</p>
      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{card.verdictSummary}</p>
      {card.findings.length > 0 && <ul className="mt-2 grid gap-1" aria-label="What the scan found">
        {card.findings.map((f) => <li key={`${f.rule}-${f.severity}`} className="text-[11px]" style={{ color: "var(--cream-dim)" }}>
          <span className="font-semibold" style={{ color: f.severity === "high" ? "#fda4af" : "#fbbf24" }}>{f.severity === "high" ? "Serious" : "Look twice"}</span> · {f.label}{f.count > 1 ? ` (${f.count} times)` : ""}
          {f.sample ? <span className="ml-1 font-mono text-[10px]" style={{ color: "var(--cream-mute)" }}>{f.sample}</span> : null}
        </li>)}
      </ul>}
    </div>

    {card.alreadyShared && <p className="mt-3 text-[11px]" style={{ color: "#fbbf24" }}><AlertTriangle size={12} className="mr-1 inline" aria-hidden="true" />This exact fact is already shared.</p>}

    <div className="mt-3">
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>The note</p>
      {card.content !== null
        ? <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 font-mono text-[11px] leading-relaxed" style={{ ...lineBorder, color: "var(--cream)" }} tabIndex={0} aria-label="The note that would be shared">{card.content}</pre>
        : <p className="mt-1 text-[11px]" style={{ color: "#fbbf24" }}>{card.contentUnavailable}</p>}
      {card.hiddenCharacterCount > 0 && <p className="mt-1 text-[10px]" style={{ color: "#fbbf24" }}><ShieldAlert size={11} className="mr-1 inline" aria-hidden="true" />{card.hiddenCharacterCount} invisible character(s) are shown in square brackets, for example [U+200B].</p>}
    </div>

    <div className="mt-3">
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--cream-mute)" }}>Where it came from</p>
      {card.provenanceLines.length > 0
        ? <ul className="mt-1 grid gap-1">{card.provenanceLines.map((line) => <li key={line} className="break-words text-[11px]" style={{ color: "var(--cream-dim)" }}>{line}</li>)}</ul>
        : <p className="mt-1 text-[11px]" style={{ color: "var(--cream-mute)" }}>No source record is visible to you.</p>}
    </div>

    {card.blockedReason && <p className="mt-3 text-[11px]" style={{ color: "var(--cream-dim)" }}><ShieldCheck size={12} className="mr-1 inline" aria-hidden="true" />{card.blockedReason}</p>}

    {card.canApprove && <fieldset className="mt-3 rounded-md border p-3" style={lineBorder}>
      <legend className="px-1 text-[11px] font-semibold" style={{ color: "var(--cream)" }}>How sensitive is this note? (required to approve)</legend>
      <div className="grid gap-2">
        {LABEL_CHOICES.map((choice) => <label key={choice.value} className="flex items-start gap-2 text-[11px]" style={{ color: "var(--cream-dim)" }}>
          <input type="radio" name={`label-${card.id}`} value={choice.value} checked={label === choice.value} onChange={() => onLabel(choice.value)} className="mt-0.5" />
          <span><span className="font-semibold" style={{ color: "var(--cream)" }}>{choice.title}</span> · {choice.help}</span>
        </label>)}
      </div>
      <p className="mt-2 text-[10px]" style={{ color: "var(--cream-mute)" }}>If this note must never be shared with other adapters, do not label it: reject it.</p>
    </fieldset>}

    {(card.canApprove || card.canReject) && <div className="mt-3">
      <label className="block text-[11px]" style={{ color: "var(--cream)" }} htmlFor={`note-${card.id}`}>
        {minChars > 0 ? `Your reason (required to approve, at least ${minChars} characters)` : "Your reason (optional)"}
      </label>
      <textarea id={`note-${card.id}`} value={note} onChange={(e) => onNote(e.target.value)} rows={2} maxLength={2000} className="mt-1 w-full rounded-md border bg-transparent p-2 text-[11px]" style={{ ...lineBorder, color: "var(--cream)" }} />
      {!confirming && <div className="mt-2 flex flex-wrap gap-2">
        {card.canApprove && <button type="button" disabled={anyBusy || !enough} onClick={onAskApprove} className="rounded-md border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50" style={{ borderColor: GOOD, color: GOOD }}>Approve</button>}
        {card.canReject && <button type="button" disabled={anyBusy} onClick={() => onDecide("reject")} className="rounded-md border px-3 py-1.5 text-[11px]" style={{ ...lineBorder, color: "var(--cream-dim)" }}>{busy ? "Working..." : "Reject"}</button>}
      </div>}
      {card.canApprove && confirming && <div className="mt-2 rounded-md border p-3" style={{ borderColor: GOOD }} role="group" aria-label="Confirm approval">
        <p className="text-[12px]" style={{ color: "var(--cream)" }}>Share exactly the note above with every adapter? Your approval is tied to fingerprint <span className="font-mono">{card.shortHash}…</span>. If the note changes, it will not count.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={anyBusy || !enough} onClick={() => onDecide("approve")} className="rounded-md border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50" style={{ borderColor: GOOD, color: GOOD }}>{busy ? "Approving..." : "Yes, share this note"}</button>
          <button type="button" disabled={anyBusy} onClick={onCancel} className="rounded-md border px-3 py-1.5 text-[11px]" style={{ ...lineBorder, color: "var(--cream-dim)" }}>Cancel</button>
        </div>
      </div>}
    </div>}
  </article>;
}

function Message({ title, body, warn = false }: { title: string; body: string; warn?: boolean }) {
  return <section className="panel mt-6 flex items-start gap-3 p-4" role="status">
    {warn && <AlertTriangle size={16} style={{ color: "#fbbf24" }} aria-hidden="true" />}
    <div><h2 className="text-[13px] font-semibold" style={{ color: "var(--cream)" }}>{title}</h2><p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{body}</p></div>
  </section>;
}
