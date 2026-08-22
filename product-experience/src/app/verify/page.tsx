"use client";

import { useEffect, useState } from "react";

export default function VerifyPage() {
  const [message, setMessage] = useState("Verifying your request…");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    fetch("/api/onboarding/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) { setMessage("This verification link is invalid or expired."); return; }
      if (typeof body.requestId === "string") {
        const checkout = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: body.requestId, email: body.email }) }).then((value) => value.json()).catch(() => null);
        if (typeof checkout?.checkoutUrl === "string") { window.location.assign(checkout.checkoutUrl); return; }
        setMessage(`Email verified. Your request is ${String(body.requestId).slice(0, 8)}…. Payment and activation remain pending review.`);
      } else setMessage("Email verified. Payment and activation remain pending review.");
    }).catch(() => setMessage("Could not verify this request. Please contact support."));
  }, []);
  return <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-5 text-[var(--g5)]"><section className="max-w-lg rounded-2xl border border-[var(--g5)]/14 bg-white/45 p-8 text-center"><p className="font-display italic text-[var(--g5)]/60">Veloce AgenticOS</p><h1 className="font-heading mt-2 text-3xl font-bold">Email verification</h1><p className="mt-5 text-sm leading-relaxed text-[var(--g5)]/68">{message}</p><a href="/support" className="mt-6 inline-block text-sm font-semibold underline">Contact support</a></section></main>;
}
