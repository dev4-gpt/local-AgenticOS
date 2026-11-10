"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LockKeyhole, LogIn, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { safeClientLoginNext } from "@/lib/clientLoginRedirect";

function accessMessage(error: string | null | undefined) {
  if (error === "tenant_membership_required" || error === "client_user_not_approved") return "This account does not have access to this workspace. Use your approved workspace account or contact its owner.";
  if (error === "tenant_membership_unavailable") return "Workspace access could not be checked. Please try again shortly.";
  if (error === "tenant_not_configured" || error === "auth_not_configured") return "Workspace sign-in is not configured yet. Contact its owner.";
  return "The email or password was not accepted.";
}

export default function ClientLogin() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/client-auth/session", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (data.authenticated && data.workspaceAuthorized === true) window.location.replace(safeClientLoginNext(params.get("next"), window.location.origin));
      else if (data.authenticated) setError(accessMessage(data.accessError));
    }).catch(() => undefined);
  }, [params]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/client-auth/login", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(accessMessage(data.error));
      const session = await fetch("/api/client-auth/session", { credentials: "same-origin", cache: "no-store" }).then((result) => result.json()).catch(() => null);
      if (!session?.authenticated) throw new Error("Sign-in succeeded but the session cookie was not accepted. Please try again.");
      if (session.workspaceAuthorized !== true) throw new Error(accessMessage(session.accessError));
      window.location.replace(safeClientLoginNext(params.get("next"), window.location.origin));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-[var(--bg-deep)] px-5 py-12">
      <section className="panel w-full max-w-md p-7 md:p-9">
        <div className="flex items-center gap-3 mb-6"><div className="grid place-items-center w-10 h-10 rounded-xl" style={{ background: "rgba(96,165,250,0.14)", color: "#60a5fa" }}><LockKeyhole size={19} /></div><div><div className="text-[10px] uppercase tracking-[0.2em] text-[var(--fg-dimmer)]">Veloce AgenticOS</div><h1 className="text-xl font-semibold text-[var(--fg)]">Sign in to your runtime</h1></div></div>
        <p className="text-[12px] leading-relaxed text-[var(--fg-dim)] mb-6">Use the individual email and password issued for your approved client workspace. Provider keys are never your login password and never appear in this form.</p>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-[11px] text-[var(--fg-dim)]">Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required className="mt-1.5 w-full rounded-lg border border-[var(--panel-border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none" /></label>
          <label className="block text-[11px] text-[var(--fg-dim)]">Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" minLength={8} required className="mt-1.5 w-full rounded-lg border border-[var(--panel-border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none" /></label>
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: "#60a5fa", color: "#06111d" }}>{busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}{busy ? "Signing in..." : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
