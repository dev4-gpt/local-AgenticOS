"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, LockKeyhole, LogOut, RefreshCw, Send, ShieldCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { CLIENT_CREDENTIAL_OPTIONS, type ClientCredentialOption } from "@/lib/clientCredentialCatalog";
import { publicCatalogEntryForCredential } from "@/lib/publicProviderCatalog";

interface Credential {
  key: string;
  label: string;
  connected: boolean;
  secret: boolean;
}

interface Status {
  mode: {
    clientEdition: boolean;
    localCliDisabled: boolean;
    localFilesDisabled: boolean;
    approvalsRequired: boolean;
  };
  credentials: Credential[];
  credentialOptions?: ClientCredentialOption[];
  client: {
    slug: string | null;
    name: string | null;
  };
}

const fieldClass = "w-full rounded-lg border border-[var(--panel-border)] bg-black/20 px-3 py-2.5 text-[12px] text-[var(--fg)] outline-none transition focus:border-sky-300/70";

export default function CredentialsView() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [providerKey, setProviderKey] = useState("OPENAI_API_KEY");
  const [secretValue, setSecretValue] = useState("");
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState("");
  const [formNotice, setFormNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const credentialOptions = useMemo(
    () => (status?.credentialOptions?.length ? status.credentialOptions : CLIENT_CREDENTIAL_OPTIONS).filter((option) => option.submitAllowed),
    [status?.credentialOptions],
  );

  async function load() {
    try {
      const [credentialResponse, sessionResponse] = await Promise.all([
        fetch("/api/client-runtime/credentials", { cache: "no-store" }),
        fetch("/api/client-auth/session", { cache: "no-store" }),
      ]);
      const credentialData = await credentialResponse.json().catch(() => null);
      if (!credentialResponse.ok || !credentialData?.ok) {
        setStatus(null);
        setNotice(credentialResponse.status === 401 ? "Sign in to view runtime credentials." : "Could not load runtime status.");
      } else {
        setStatus(credentialData);
        setNotice("");
      }
      const session = await sessionResponse.json();
      setEmail(session.user?.email ?? null);
    } catch {
      setStatus(null);
      setNotice("Could not load runtime status.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get("provider")?.trim().toUpperCase();
      if (requested && CLIENT_CREDENTIAL_OPTIONS.some((option) => option.submitAllowed && option.key === requested)) setProviderKey(requested);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function logout() {
    await fetch("/api/client-auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  async function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormNotice("");
    if (!secretValue.trim()) {
      setFormNotice("Enter a value before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/client-runtime/credential-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerKey, catalogId: publicCatalogEntryForCredential(providerKey)?.id, secretValue, notes }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setFormNotice("Could not submit this credential. Ask Veloce to check the client vault inbox.");
        return;
      }
      const label = data.provider?.label ?? providerKey;
      setSecretValue("");
      setNotes("");
      const activation = data.activation?.status === "submitted-for-review" ? " Activation is submitted for tenant-manifest review; it is not enabled by the upload alone." : "";
      setFormNotice(`${label} submitted to the client vault inbox.${activation}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pb-8 space-y-5">
      <section className="panel p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}>
            <KeyRound size={19} />
          </div>
          <div>
            <div className="eyebrow">Runtime access and provider status</div>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--fg)]">Credentials</h1>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--fg-dim)]">
              Submit a provider key through the reviewed BYOK flow. The key is written to a server-side vault inbox, never returned to the browser, and does not activate a provider until Veloce approves the tenant manifest.
            </p>
          </div>
          <button onClick={() => void load()} title="Refresh" className="ml-auto rounded-lg border border-[var(--panel-border)] p-2 text-[var(--fg-dim)]">
            <RefreshCw size={14} />
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--fg)]">
            <ShieldCheck size={15} color="#34d399" /> Runtime identity
          </div>
          <div className="mt-4 space-y-2 text-[11px] text-[var(--fg-dim)]">
            <div>Login: <strong className="text-[var(--fg)]">{email || "Not signed in"}</strong></div>
            <div>Edition: <strong className="text-[var(--fg)]">{status?.client?.name || status?.client?.slug || "Owner runtime"}</strong></div>
            <div>Approvals: <strong className="text-[var(--fg)]">{status?.mode?.approvalsRequired ? "Required" : "Not configured"}</strong></div>
          </div>
          <button onClick={logout} className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-[var(--panel-border)] px-3 py-2 text-[11px] text-[var(--fg-dim)]">
            <LogOut size={13} /> Sign out
          </button>
        </div>

        <form onSubmit={submitCredential} className="panel p-5">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--fg)]">
            <LockKeyhole size={15} color="#60a5fa" /> Add environment variable
          </div>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-[10px] uppercase tracking-wider text-[var(--fg-dimmer)]">
              Provider
              <select value={providerKey} onChange={(event) => setProviderKey(event.target.value)} className={`${fieldClass} runtime-request-select`}>
                {credentialOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label} · {option.key}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-[10px] uppercase tracking-wider text-[var(--fg-dimmer)]">
              Value
              <input
                value={secretValue}
                onChange={(event) => setSecretValue(event.target.value)}
                type="password"
                autoComplete="off"
                placeholder="Paste the key or URL"
                className={fieldClass}
              />
            </label>
            <label className="grid gap-1.5 text-[10px] uppercase tracking-wider text-[var(--fg-dimmer)]">
              Context
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional account, project, or usage note"
                className={`${fieldClass} min-h-20 resize-y`}
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-sky-300 px-3 py-2 text-[11px] font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={13} /> {submitting ? "Submitting" : "Submit"}
            </button>
            {formNotice && <p className="text-[11px] text-sky-200">{formNotice}</p>}
            <p className="text-[10px] leading-relaxed text-[var(--fg-dim)]">Need to compare options first? <a href="/provider-catalog" className="text-sky-300 underline">View the public provider catalog</a>.</p>
          </div>
        </form>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-[var(--panel-border)] px-5 py-3 text-[12px] font-semibold text-[var(--fg)]">Provider connections</div>
        {status?.credentials?.map((credential) => (
          <div key={credential.key} className="flex items-center justify-between gap-3 border-b border-[var(--panel-border)] px-5 py-3 last:border-b-0">
            <div>
              <div className="text-[12px] text-[var(--fg)]">{credential.label}</div>
              <div className="text-[10px] text-[var(--fg-dimmer)]">{credential.secret ? "Secret-backed" : "Runtime configuration"}</div>
            </div>
            <div className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider ${credential.connected ? "text-emerald-300" : "text-[var(--fg-dimmer)]"}`}>
              {credential.connected ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              {credential.connected ? "Connected" : "Not connected"}
            </div>
          </div>
        ))}
      </section>

      {notice && <p className="text-[11px] text-rose-300">{notice}</p>}
    </div>
  );
}
