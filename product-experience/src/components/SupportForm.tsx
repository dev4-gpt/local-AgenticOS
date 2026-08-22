"use client";

import { useState } from "react";

export function SupportForm() {
  const [notice, setNotice] = useState("We will return a request ID after the message is recorded.");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(data.entries())) }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setBusy(false);
    if (response?.ok && body?.requestId) { event.currentTarget.reset(); setNotice(`Support request ${String(body.requestId).slice(0, 8)}… received. Check your email for acknowledgement.`); return; }
    setNotice(body?.error === "secret_like_content" ? "Remove credentials or tokens from the message." : "Support is temporarily unavailable. Please try again shortly.");
  }
  return <form onSubmit={submit} className="grid gap-4"><input name="email" required type="email" placeholder="you@company.com" className="rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 text-sm" /><input name="subject" required placeholder="Subject" className="rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 text-sm" /><input name="requestId" placeholder="Request or tenant ID (optional)" className="rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 text-sm" /><textarea name="message" required rows={7} placeholder="Describe the issue without secrets..." className="rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 text-sm" /><div className="flex items-center justify-between gap-4"><p aria-live="polite" className="text-xs leading-relaxed text-[var(--g5)]/62">{notice}</p><button disabled={busy} className="rounded-full bg-[var(--g5)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Sending…" : "Contact support"}</button></div></form>;
}
