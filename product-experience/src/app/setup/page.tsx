"use client";

import { useEffect, useState } from "react";

export default function SetupPage() {
  const [message, setMessage] = useState("Opening your secure setup link…");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    fetch("/api/onboarding/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).then(async (response) => {
      const body = await response.json().catch(() => null);
      if (response.ok && typeof body?.actionLink === "string") { window.location.assign(body.actionLink); return; }
      setMessage("This setup link is invalid, expired, or already used. Contact support for a new one.");
    }).catch(() => setMessage("Could not open the setup link. Contact support."));
  }, []);
  return <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-5 text-[var(--g5)]"><section className="max-w-lg rounded-2xl border border-[var(--g5)]/14 bg-white/45 p-8 text-center"><p className="font-display italic text-[var(--g5)]/60">Veloce AgenticOS</p><h1 className="font-heading mt-2 text-3xl font-bold">Secure account setup</h1><p className="mt-5 text-sm leading-relaxed text-[var(--g5)]/68">{message}</p><a href="/support" className="mt-6 inline-block text-sm font-semibold underline">Contact support</a></section></main>;
}
