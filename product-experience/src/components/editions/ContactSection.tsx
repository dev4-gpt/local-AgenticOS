"use client";

import { useState } from "react";

// Fallback contact route used only if the lead store isn't reachable.
const CONTACT_URL = "https://github.com/dev4-gpt/local-AgenticOS";

/**
 * Chapter XII white-area contact section. Mirrors the ChapterSection padding
 * so it drops in after the Developer painting hero without disturbing the
 * scroll choreography. Submits to /api/lead, which stores the signup in
 * Supabase server-side; if the store isn't configured yet, it falls back to
 * copying a brief and opening the contact route so nothing is lost.
 */
export function ContactSection() {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      company: String(data.get("company") ?? ""),
      message: String(data.get("challenge") ?? ""),
    };

    setBusy(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        form.reset();
        setNotice("Thanks — your note reached Veloce. We'll be in touch shortly.");
        return;
      }
      // Not configured / store failed → don't lose the lead: copy + hand off.
      const brief = `Veloce discovery brief\n\nName: ${payload.name}\nEmail: ${payload.email}\nCompany: ${payload.company}\n\nThe handoff to make repeatable:\n${payload.message}`;
      await navigator.clipboard.writeText(brief).catch(() => {});
      window.open(CONTACT_URL, "_blank", "noopener,noreferrer");
      setNotice("Your brief was copied and the contact page is open — send it there and we'll pick it up.");
    } catch {
      setNotice("Couldn't reach the server just now. Please email us instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-24 lg:pl-[220px]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-5 lg:grid-cols-2 lg:px-8">
        <div className="flex flex-col justify-center">
          <p className="font-display text-sm italic text-[var(--g5)]/60">Start with the real work</p>
          <h3 className="font-heading mt-3 text-4xl font-bold leading-[1.05] text-[var(--g5)] lg:text-5xl">
            Where does valuable context disappear between strategy, build, and growth?
          </h3>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-[var(--g5)]/70">
            Tell us the handoff that costs your team the most. We&apos;ll determine whether a
            Veloce engagement is the right answer — a focused, human-governed 90-day build around
            the work you already sell.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-xs font-medium text-[var(--g5)]">
            Full name
            <input
              name="name"
              required
              autoComplete="name"
              className="rounded-lg border border-[var(--g5)]/20 bg-[var(--g1)] px-4 py-3 text-sm text-[var(--g5)] outline-none focus:border-[var(--g5)]/50"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium text-[var(--g5)]">
            Work email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-lg border border-[var(--g5)]/20 bg-[var(--g1)] px-4 py-3 text-sm text-[var(--g5)] outline-none focus:border-[var(--g5)]/50"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium text-[var(--g5)]">
            Company
            <input
              name="company"
              required
              autoComplete="organization"
              className="rounded-lg border border-[var(--g5)]/20 bg-[var(--g1)] px-4 py-3 text-sm text-[var(--g5)] outline-none focus:border-[var(--g5)]/50"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium text-[var(--g5)]">
            The handoff you want to make repeatable
            <textarea
              name="challenge"
              required
              rows={4}
              placeholder="For example: turning a strong strategy process into a faster website and content delivery system."
              className="resize-none rounded-lg border border-[var(--g5)]/20 bg-[var(--g1)] px-4 py-3 text-sm text-[var(--g5)] outline-none focus:border-[var(--g5)]/50"
            />
          </label>
          <div className="mt-1 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--g5)] px-6 py-3 text-sm font-medium text-[var(--g1)] no-underline transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Sending..." : "Start the conversation"} <span aria-hidden>→</span>
            </button>
            <a
              href="/start"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--g5)]/20 px-6 py-3 text-sm font-medium text-[var(--g5)] no-underline hover:bg-[var(--g5)]/5"
            >
              Request gated runtime <span aria-hidden>→</span>
            </a>
          </div>
          <p aria-live="polite" className="text-xs text-[var(--g5)]/50">
            {notice || "We'll only use this to reply about a Veloce engagement. Don't include confidential information."}
          </p>
        </form>
      </div>
    </div>
  );
}
