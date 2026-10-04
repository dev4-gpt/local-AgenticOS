"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Mail } from "lucide-react";
import Link from "next/link";

export default function ClientLoginForm({ enabled }: { enabled: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/client-login/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Please wait before requesting another link." : "Sign-in is unavailable right now. Please contact support.");
        return;
      }
      setSent(true);
    } catch {
      setError("Sign-in is unavailable right now. Please contact support.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-5 py-12 text-[var(--g5)]">
      <section className="w-full max-w-md rounded-lg border border-[var(--g5)]/15 bg-white p-7 shadow-sm sm:p-9">
        <Link href="/" className="font-display text-lg italic text-[var(--g5)] no-underline">Veloce AgenticOS</Link>
        <h1 className="font-heading mt-6 text-2xl font-bold">Client sign-in</h1>
        {!enabled ? (
          <p role="status" className="mt-6 text-sm leading-relaxed text-[var(--g5)]/75">
            Client sign-in is not available yet. Contact support for access to your workspace.
          </p>
        ) : sent ? (
          <div role="status" className="mt-6 text-sm leading-relaxed text-[var(--g5)]/75">
            If this email has an active workspace, a sign-in link is on its way. Check your inbox.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6">
            <label htmlFor="client-email" className="block text-sm font-medium">Email</label>
            <div className="mt-2 flex items-center gap-2 rounded-md border border-[var(--g5)]/20 px-3 focus-within:border-[var(--g5)]/70">
              <Mail size={17} aria-hidden="true" className="shrink-0 text-[var(--g5)]/50" />
              <input id="client-email" type="email" autoComplete="email" required maxLength={320} value={email}
                onChange={(event) => setEmail(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" />
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--g5)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-55">
              {busy ? <LoaderCircle size={17} aria-hidden="true" className="animate-spin" /> : <ArrowRight size={17} aria-hidden="true" />}
              {busy ? "Sending…" : "Email sign-in link"}
            </button>
          </form>
        )}
        <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--g5)]/10 pt-5 text-sm">
          <Link href="/start" className="underline underline-offset-2">Request a workspace</Link>
          <Link href="/support" className="underline underline-offset-2">Contact support</Link>
        </div>
      </section>
    </main>
  );
}
