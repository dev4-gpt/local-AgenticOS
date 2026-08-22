"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, LockKeyhole, LogOut, RefreshCw, Send, ShieldCheck, XCircle, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ClientCredentialOption } from "@/lib/clientCredentialCatalog";
import { publicCatalogCredentialOptions, publicCatalogEntryForCredential } from "@/lib/publicProviderCatalog";

interface Credential {
  key: string;
  label: string;
  connected: boolean;
  secret: boolean;
  connectionStatus?: string | null;
  credentialMode?: string;
  lastValidatedAt?: string | null;
}

interface Status {
  mode: {
    clientEdition: boolean;
    localCliDisabled: boolean;
    localFilesDisabled: boolean;
    approvalsRequired: boolean;
  };
  credentials: Credential[];
  catalog?: Array<{ id: string; name: string; customerTool: string; pipelineStage: string; pricingBasis: string; creditEstimate: string; status: string; credentialMode: string; approval: string; pricingVerifiedAt?: string | null; freeTier?: string | null; modelOptions?: Array<{ model: string; units?: Array<{ display: string }> }> }>;
  credentialOptions?: ClientCredentialOption[];
  client: {
    slug: string | null;
    name: string | null;
  };
}

interface CreditStatus {
  balanceMicros: number;
  reservedMicros: number;
  warningThresholdMicros: number;
  status: string;
  checkoutConfigured?: boolean;
  creditBudgets?: Array<{ catalog_id: string; provider_key: string; available_micros: number; status: string }>;
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
  const [credits, setCredits] = useState<CreditStatus | null>(null);
  const [creditQuantity, setCreditQuantity] = useState(1);
  const [creditNotice, setCreditNotice] = useState("");

  const credentialOptions = useMemo(
    () => (status?.credentialOptions?.length ? status.credentialOptions : publicCatalogCredentialOptions()).filter((option) => option.submitAllowed),
    [status?.credentialOptions],
  );

  async function load() {
    try {
      const [credentialResponse, sessionResponse, creditResponse] = await Promise.all([
        fetch("/api/client-runtime/credentials", { cache: "no-store" }),
        fetch("/api/client-auth/session", { cache: "no-store" }),
        fetch("/api/client-runtime/credits", { cache: "no-store" }),
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
      const creditData = await creditResponse.json().catch(() => null);
      if (creditData?.ok && creditData.account) {
        setCredits({ ...creditData.account, creditBudgets: Array.isArray(creditData.creditBudgets) ? creditData.creditBudgets : [], checkoutConfigured: creditData.checkoutConfigured === true });
      }
    } catch {
      setStatus(null);
      setNotice("Could not load runtime status.");
    }
  }

  async function buyManagedCredits() {
    if (credits && credits.checkoutConfigured === false) {
      setCreditNotice("Managed credits are not enabled for this tenant yet. BYOK provider keys are available now.");
      return;
    }
    setCreditNotice("Opening secure checkout…");
    const response = await fetch("/api/client-runtime/credits/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: creditQuantity }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok && typeof data?.checkoutUrl === "string") { window.location.assign(data.checkoutUrl); return; }
    setCreditNotice(data?.error === "managed_credits_not_configured" ? "Managed credits are not configured for this tenant yet." : data?.error === "invalid_credit_quantity" ? "Choose at least 1 credit pack." : "Could not open managed-credit checkout.");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get("provider")?.trim().toUpperCase();
      if (requested && publicCatalogCredentialOptions().some((option) => option.key === requested)) setProviderKey(requested);
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

  const managedCreditsConfigured = credits?.checkoutConfigured === true;

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
              Submit a provider key through the reviewed BYOK flow, or ask Veloce to enable managed credits for an approved provider. Keys are written to server-side tenant storage, never returned to the browser, and do not activate a provider until the tenant manifest and smoke test succeed.
            </p>
          </div>
          <button onClick={() => void load()} title="Refresh" className="ml-auto rounded-lg border border-[var(--panel-border)] p-2 text-[var(--fg-dim)]">
            <RefreshCw size={14} />
          </button>
        </div>
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div><div className="text-[13px] font-semibold text-[var(--fg)]">Choose tools before adding keys</div><p className="mt-1 text-[11px] text-[var(--fg-dim)]">Compare cost, free-tier limits, runtime placement, and activation requirements in the provider matrix.</p></div>
        <button type="button" onClick={() => router.push("/provider-matrix")} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--panel-border)] px-3 py-2 text-[11px] text-[var(--fg-dim)]">Open provider matrix <ArrowRight size={13} /></button>
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
              {credential.connectionStatus === "submitted" ? "Pending review" : credential.connected ? "Connected" : "Not connected"}
            </div>
          </div>
        ))}
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <div className="eyebrow">Managed credit wallet</div>
          <div className="mt-1 text-lg font-semibold text-[var(--fg)]">{credits && managedCreditsConfigured ? `${(credits.balanceMicros / 1_000_000).toFixed(2)} credits available` : "Not enabled for this tenant"}</div>
          <p className="mt-1 max-w-2xl text-[10px] text-[var(--fg-dim)]">Managed provider jobs reserve, settle, or refund credits. BYOK provider charges remain with the client. {managedCreditsConfigured ? "Checkout is available." : "A Veloce administrator must configure the managed-credit checkout before purchase is available."}</p>
          {creditNotice && <p className="mt-2 text-[10px] text-sky-200">{creditNotice}</p>}
          {credits?.creditBudgets && credits.creditBudgets.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{credits.creditBudgets.map((budget) => <div key={budget.catalog_id} className="rounded-lg border border-[var(--panel-border)] px-3 py-2"><div className="text-[11px] text-[var(--fg)]">{budget.provider_key}</div><div className="mt-1 text-[10px] text-[var(--fg-dim)]">${(budget.available_micros / 1_000_000).toFixed(2)} available · {budget.status}</div></div>)}</div>}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {managedCreditsConfigured && <label className="grid gap-1 text-[10px] uppercase tracking-wider text-[var(--fg-dimmer)]">
            Credit packs
            <input type="number" min={1} step={1} value={creditQuantity} onChange={(event) => setCreditQuantity(Math.max(1, Number(event.target.value) || 1))} className="w-24 rounded-lg border border-[var(--panel-border)] bg-black/20 px-3 py-2 text-[12px] text-[var(--fg)] outline-none focus:border-sky-300/70" aria-label="Credit pack quantity" />
          </label>}
          <button type="button" onClick={() => void buyManagedCredits()} disabled={!managedCreditsConfigured} className="rounded-lg border border-sky-300/40 px-3 py-2 text-[11px] font-semibold text-sky-200 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500">{managedCreditsConfigured ? "Buy managed credits" : "Checkout not configured"}</button>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-[var(--panel-border)] px-5 py-3 text-[12px] font-semibold text-[var(--fg)]">Approved provider matrix</div>
        <div className="hidden grid-cols-[1.1fr_1.3fr_1fr_1fr] gap-3 border-b border-[var(--panel-border)] px-5 py-2 text-[9px] uppercase tracking-wider text-[var(--fg-dimmer)] md:grid"><span>Tool</span><span>Use</span><span>Stage / mode</span><span>Pricing</span></div>
        {status?.catalog?.map((entry) => <div key={entry.id} className="grid gap-1 border-b border-[var(--panel-border)] px-5 py-3 text-[10px] last:border-b-0 md:grid-cols-[1.1fr_1.3fr_1fr_1fr] md:gap-3"><div className="text-[12px] text-[var(--fg)]">{entry.name}<div className="text-[9px] text-[var(--fg-dimmer)]">{entry.status} · {entry.credentialMode}</div></div><div className="text-[var(--fg-dim)]">{entry.customerTool}</div><div className="text-[var(--fg-dim)]">{entry.pipelineStage}<div className="text-[9px] text-amber-200">{entry.approval}</div></div><div className="text-[var(--fg-dim)]">{entry.pricingBasis}<div className="text-[9px] text-sky-200">{entry.creditEstimate}</div></div></div>)}
      </section>

      {notice && <p className="text-[11px] text-rose-300">{notice}</p>}
    </div>
  );
}
