"use client";

import { useState } from "react";

export default function SetupPage() {
  const [message, setMessage] = useState("Confirm to continue your secure account setup.");
  const [submitting, setSubmitting] = useState(false);

  async function continueSetup() {
    if (submitting) return;
    setSubmitting(true);
    setMessage("Preparing your secure sign-in…");
    const token = new URLSearchParams(window.location.search).get("token");
    try {
      const response = await fetch("/api/onboarding/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const body = await response.json().catch(() => null);
      if (response.ok && typeof body?.actionLink === "string") { window.location.assign(body.actionLink); return; }
      const code = typeof body?.error === "string" && /^[a-z_]{3,80}$/.test(body.error) ? ` (${body.error})` : "";
      setMessage(`This setup link could not be completed${code}. Contact support if it persists.`);
    } catch {
      setMessage("Could not open the setup link. Contact support.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-5 text-[var(--g5)]"><section className="max-w-lg rounded-2xl border border-[var(--g5)]/14 bg-white/45 p-8 text-center"><p className="font-display italic text-[var(--g5)]/60">Veloce AgenticOS</p><h1 className="font-heading mt-2 text-3xl font-bold">Secure account setup</h1><p className="mt-5 text-sm leading-relaxed text-[var(--g5)]/68">{message}</p><button type="button" onClick={continueSetup} disabled={submitting} className="mt-6 rounded-full bg-[var(--g5)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{submitting ? "Continuing…" : "Continue securely"}</button><a href="/support" className="mt-5 inline-block text-sm font-semibold underline">Contact support</a></section></main>;
}
