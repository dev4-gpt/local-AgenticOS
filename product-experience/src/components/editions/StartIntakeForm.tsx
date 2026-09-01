"use client";

import { useState } from "react";
import Script from "next/script";

type FormState = "idle" | "sending" | "sent" | "fallback" | "blocked";

const fieldClass =
  "rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 text-sm text-[var(--g5)] outline-none transition focus:border-[var(--g5)]/55";
const labelClass = "flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--g5)]/65";

function asString(data: FormData, key: string) {
  return String(data.get(key) ?? "").trim();
}

export function StartIntakeForm() {
  const [state, setState] = useState<FormState>("idle");
  const [captchaToken, setCaptchaToken] = useState("");
  const [notice, setNotice] = useState(
    "No passwords, API keys, private documents, or client secrets belong in this form."
  );
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: asString(data, "name"),
      email: asString(data, "email"),
      company: asString(data, "company"),
      role: asString(data, "role"),
      website: asString(data, "website"),
      workflow: asString(data, "workflow"),
      currentTools: asString(data, "currentTools"),
      dataSources: asString(data, "dataSources"),
      integrations: asString(data, "integrations"),
      credentialModel: asString(data, "credentialModel"),
      providerUsagePreference: asString(data, "providerUsagePreference"),
      providerCreditBudgetUsd: asString(data, "providerCreditBudgetUsd"),
      approvalRule: asString(data, "approvalRule"),
      seatCount: asString(data, "seatCount"),
      brandCount: asString(data, "brandCount"),
      workflowCount: asString(data, "workflowCount"),
      capabilityAreas: Array.from(form.querySelectorAll<HTMLInputElement>('input[name="capabilityAreas"]:checked')).map((input) => input.value),
      mediaRequirement: asString(data, "mediaRequirement"),
      externalActions: data.get("externalActions") === "on",
      knowledgeMigration: data.get("knowledgeMigration") === "on",
      supportLevel: asString(data, "supportLevel"),
      managedServiceNeed: asString(data, "managedServiceNeed"),
      retentionDays: asString(data, "retentionDays"),
      preferredSubdomain: asString(data, "preferredSubdomain"),
      timeline: asString(data, "timeline"),
      notes: asString(data, "notes"),
      termsAccepted: data.get("termsAccepted") === "on",
      privacyAccepted: data.get("privacyAccepted") === "on",
      captchaToken,
    };

    if (turnstileSiteKey && !captchaToken) {
      setState("blocked");
      setNotice("Complete the security check before submitting your onboarding request.");
      return;
    }

    setState("sending");
    try {
      const res = await fetch("/api/deployment-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        form.reset();
        setCaptchaToken("");
        window.turnstile?.reset?.();
        setState("sent");
        const requestId = typeof body.requestId === "string" ? body.requestId : null;
        setNotice(requestId ? `Request received (${requestId.slice(0, 8)}…). Check your email to verify the request. Payment and activation happen only after review.` : "Request received. Check your email to verify the request.");
        return;
      }

      if (body.error === "secret_like_content") {
        setState("blocked");
        setNotice("Remove anything that looks like a key, token, password, or secret before submitting.");
        return;
      }

      if (body.error === "rate_limited") {
        setState("blocked");
        setNotice("Too many requests from this network. Please wait a few minutes before trying again.");
        return;
      }

      if (body.error === "invalid_email") {
        setState("blocked");
        setNotice("Enter a valid work email so Veloce can respond to your request.");
        return;
      }

      if (body.error === "consent_required") {
        setState("blocked");
        setNotice("Accept the Terms, Privacy Notice, and acceptable-use conditions to continue.");
        return;
      }

      const brief = makeBrief(payload);
      await navigator.clipboard.writeText(brief).catch(() => {});
      setState("fallback");
      setNotice("The deployment store is not connected yet. Your request brief was copied for manual approval.");
    } catch {
      const brief = makeBrief(payload);
      await navigator.clipboard.writeText(brief).catch(() => {});
      setState("fallback");
      setNotice("Could not reach the server. Your request brief was copied for manual approval.");
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Full name
          <input name="name" required autoComplete="name" className={fieldClass} />
        </label>
        <label className={labelClass}>
          Work email
          <input name="email" type="email" required autoComplete="email" className={fieldClass} />
        </label>
        <label className={labelClass}>
          Company
          <input name="company" required autoComplete="organization" className={fieldClass} />
        </label>
        <label className={labelClass}>
          Role
          <input name="role" autoComplete="organization-title" className={fieldClass} />
        </label>
      </div>

      <fieldset className="grid gap-3 rounded-lg border border-[var(--g5)]/12 bg-white/35 p-4">
        <legend className={labelClass}>Requested operating areas</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["growth", "SEO, lead generation, and growth workflows"],
            ["creative", "Content, design, and creative production"],
            ["automation", "Advanced loops and workflow automation"],
          ].map(([value, label]) => (
            <label key={value} className="flex items-center gap-3 text-sm text-[var(--g5)]/72">
              <input name="capabilityAreas" type="checkbox" value={value} />
              {label}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-3 text-sm text-[var(--g5)]/72">
          <input name="externalActions" type="checkbox" />
          Publishing, outreach, or paid actions
        </label>
        <label className="flex items-center gap-3 text-sm text-[var(--g5)]/72">
          <input name="knowledgeMigration" type="checkbox" />
          Migrate existing knowledge, documents, or operating processes
        </label>
      </fieldset>

      <label className={labelClass}>
        Company website
        <input name="website" type="url" placeholder="https://example.com" className={fieldClass} />
      </label>

      <div className="grid gap-3 rounded-lg border border-[var(--g5)]/12 bg-white/35 p-4 text-sm text-[var(--g5)]/70">
        <label className="flex items-start gap-3">
          <input name="termsAccepted" type="checkbox" required className="mt-1" />
          <span>I agree to the <a href="/terms" target="_blank" className="font-semibold underline">Terms of Service</a> and <a href="/acceptable-use" target="_blank" className="font-semibold underline">Acceptable Use Policy</a>.</span>
        </label>
        <label className="flex items-start gap-3">
          <input name="privacyAccepted" type="checkbox" required className="mt-1" />
          <span>I have read the <a href="/privacy" target="_blank" className="font-semibold underline">Privacy Notice</a> and consent to Veloce processing this intake to evaluate and provision the requested service.</span>
        </label>
      </div>

      <label className={labelClass}>
        The workflow you want your Veloce OS to run first
        <textarea
          name="workflow"
          required
          rows={5}
          className={`${fieldClass} resize-none`}
          placeholder="Example: turn strategy calls into approved briefs, build tasks, content drafts, and client-ready delivery updates."
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Current tools
          <textarea
            name="currentTools"
            rows={4}
            className={`${fieldClass} resize-none`}
            placeholder="Notion, Google Drive, Slack, HubSpot..."
          />
        </label>
        <label className={labelClass}>
          Data sources to connect
          <textarea
            name="dataSources"
            rows={4}
            className={`${fieldClass} resize-none`}
            placeholder="Docs, CRM records, call transcripts, asset folders..."
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Required integrations
          <input name="integrations" className={fieldClass} placeholder="OpenAI, Anthropic, Gmail, Drive..." />
        </label>
        <label className={labelClass}>
          Provider usage preference
          <select name="providerUsagePreference" aria-label="Provider usage preference" defaultValue="byok" className={fieldClass}>
            <option value="byok">BYOK — client pays providers directly</option>
            <option value="managed_credits">Veloce-managed prepaid credits</option>
            <option value="both">Both BYOK and managed credits</option>
          </select>
        </label>
        <label className={labelClass}>
          Credential model
          <select name="credentialModel" aria-label="Credential model" defaultValue="client_owned" className={fieldClass}>
            <option value="client_owned">Client-owned provider keys</option>
            <option value="managed_allowance">Managed allowance with written cap</option>
            <option value="oauth">OAuth connection where supported</option>
          </select>
        </label>
        <label className={labelClass}>
          Requested managed-provider wallet
          <input name="providerCreditBudgetUsd" className={fieldClass} placeholder="$100, $500, $1,000..." />
        </label>
        <label className={labelClass}>
          Approval rule
          <select name="approvalRule" aria-label="Approval rule" defaultValue="approve_external_actions" className={fieldClass}>
            <option value="approve_external_actions">Approve every external action</option>
            <option value="approve_publish_and_spend">Approve publishing and spend only</option>
            <option value="custom">Custom approval policy</option>
          </select>
        </label>
        <label className={labelClass}>
          Named seats
          <input name="seatCount" type="number" min="1" max="500" defaultValue="1" className={fieldClass} />
        </label>
        <label className={labelClass}>
          Brands or business units
          <input name="brandCount" type="number" min="1" max="100" defaultValue="1" className={fieldClass} />
        </label>
        <label className={labelClass}>
          Initial workflows
          <input name="workflowCount" type="number" min="1" max="500" defaultValue="1" className={fieldClass} />
        </label>
        <label className={labelClass}>
          Media requirement
          <select name="mediaRequirement" aria-label="Media requirement" defaultValue="none" className={fieldClass}>
            <option value="none">No media generation</option>
            <option value="image">Images and thumbnails</option>
            <option value="video">Video</option>
            <option value="music">Music or voice</option>
            <option value="full_media">Images, video, music, and voice</option>
          </select>
        </label>
        <label className={labelClass}>
          Support level
          <select name="supportLevel" aria-label="Support level" defaultValue="standard" className={fieldClass}>
            <option value="standard">Standard platform support</option>
            <option value="priority">Priority support</option>
            <option value="dedicated">Dedicated operating cadence</option>
          </select>
        </label>
        <label className={labelClass}>
          Managed service need
          <select name="managedServiceNeed" aria-label="Managed service need" defaultValue="self_directed" className={fieldClass}>
            <option value="self_directed">Self-directed platform use</option>
            <option value="strategy">Strategy support</option>
            <option value="content">Content production</option>
            <option value="growth">Growth and lead generation</option>
            <option value="full_operations">Veloce-led operations</option>
          </select>
        </label>
        <label className={labelClass}>
          Retention period
          <input name="retentionDays" type="number" min="1" max="3650" className={fieldClass} placeholder="30" />
        </label>
        <label className={labelClass}>
          Preferred subdomain
          <input name="preferredSubdomain" className={fieldClass} placeholder="client-name" />
        </label>
        <label className={labelClass}>
          Timeline
          <input name="timeline" className={fieldClass} placeholder="This month, Q3, urgent..." />
        </label>
      </div>

      <label className={labelClass}>
        Anything Veloce should know before approval
        <textarea
          name="notes"
          rows={4}
          className={`${fieldClass} resize-none`}
          placeholder="Constraints, must-have approvals, compliance concerns, stakeholders..."
        />
      </label>

      {turnstileSiteKey && (
        <div className="grid gap-2 rounded-lg border border-[var(--g5)]/12 bg-white/35 p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--g5)]/65">Security check</span>
          <TurnstileWidget siteKey={turnstileSiteKey} onToken={setCaptchaToken} />
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-[var(--g5)]/12 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="max-w-xl text-sm leading-relaxed text-[var(--g5)]/62">
          {notice}
        </p>
        <button
          type="submit"
          disabled={state === "sending"}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--g5)] px-6 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {state === "sending" ? "Submitting..." : state === "sent" ? "Request sent" : "Start public onboarding"}
        </button>
      </div>
    </form>
  );
}

function makeBrief(payload: Record<string, string | boolean | string[]>) {
  return `Veloce client runtime request

Name: ${payload.name}
Email: ${payload.email}
Company: ${payload.company}
Role: ${payload.role}
Website: ${payload.website}

Workflow:
${payload.workflow}

Current tools:
${payload.currentTools}

Data sources:
${payload.dataSources}

Required integrations:
${payload.integrations}

Credential model: ${payload.credentialModel}
Provider usage preference: ${payload.providerUsagePreference}
Requested managed-provider wallet: ${payload.providerCreditBudgetUsd}
Approval rule: ${payload.approvalRule}
Named seats: ${payload.seatCount}
Brands or business units: ${payload.brandCount}
Initial workflows: ${payload.workflowCount}
Capability areas: ${Array.isArray(payload.capabilityAreas) ? payload.capabilityAreas.join(", ") : payload.capabilityAreas}
Media requirement: ${payload.mediaRequirement}
External actions: ${payload.externalActions}
Knowledge migration: ${payload.knowledgeMigration}
Support level: ${payload.supportLevel}
Managed service need: ${payload.managedServiceNeed}
Retention days: ${payload.retentionDays}
Preferred subdomain: ${payload.preferredSubdomain}
Timeline: ${payload.timeline}

Notes:
${payload.notes}`;
}

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        "expired-callback": () => void;
        "error-callback": () => void;
      }) => string;
      reset?: (widgetId?: string) => void;
    };
  }
}

function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const containerId = "veloce-turnstile-widget";

  function renderWidget() {
    const container = document.getElementById(containerId);
    if (!container || !window.turnstile || container.dataset.rendered === "true") return;
    window.turnstile.render(container, {
      sitekey: siteKey,
      callback: onToken,
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });
    container.dataset.rendered = "true";
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <div id={containerId} aria-label="Cloudflare Turnstile security check" />
    </>
  );
}
