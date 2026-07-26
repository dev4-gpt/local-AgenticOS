"use client";

import { useState } from "react";

type FormState = "idle" | "sending" | "sent" | "fallback" | "blocked";

const fieldClass =
  "rounded-lg border border-[var(--g5)]/18 bg-white/70 px-4 py-3 text-sm text-[var(--g5)] outline-none transition focus:border-[var(--g5)]/55";
const labelClass = "flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--g5)]/65";

function asString(data: FormData, key: string) {
  return String(data.get(key) ?? "").trim();
}

export function StartIntakeForm() {
  const [state, setState] = useState<FormState>("idle");
  const [notice, setNotice] = useState(
    "No passwords, API keys, private documents, or client secrets belong in this form."
  );

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
      monthlyBudget: asString(data, "monthlyBudget"),
      approvalRule: asString(data, "approvalRule"),
      preferredSubdomain: asString(data, "preferredSubdomain"),
      timeline: asString(data, "timeline"),
      notes: asString(data, "notes"),
    };

    setState("sending");
    try {
      const res = await fetch("/api/deployment-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        form.reset();
        setState("sent");
        setNotice("Request received. Veloce will review it before any client runtime is opened.");
        return;
      }

      const body = await res.json().catch(() => ({}));
      if (body.error === "secret_like_content") {
        setState("blocked");
        setNotice("Remove anything that looks like a key, token, password, or secret before submitting.");
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

      <label className={labelClass}>
        Company website
        <input name="website" type="url" placeholder="https://example.com" className={fieldClass} />
      </label>

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
          Credential model
          <select name="credentialModel" defaultValue="client_owned" className={fieldClass}>
            <option value="client_owned">Client-owned provider keys</option>
            <option value="managed_allowance">Managed allowance with written cap</option>
            <option value="oauth">OAuth connection where supported</option>
          </select>
        </label>
        <label className={labelClass}>
          Monthly budget cap
          <input name="monthlyBudget" className={fieldClass} placeholder="$100, $500, $1,000..." />
        </label>
        <label className={labelClass}>
          Approval rule
          <select name="approvalRule" defaultValue="approve_external_actions" className={fieldClass}>
            <option value="approve_external_actions">Approve every external action</option>
            <option value="approve_publish_and_spend">Approve publishing and spend only</option>
            <option value="custom">Custom approval policy</option>
          </select>
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

      <div className="flex flex-col gap-4 border-t border-[var(--g5)]/12 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="max-w-xl text-sm leading-relaxed text-[var(--g5)]/62">
          {notice}
        </p>
        <button
          type="submit"
          disabled={state === "sending"}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--g5)] px-6 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {state === "sending" ? "Submitting..." : state === "sent" ? "Request sent" : "Request gated runtime"}
        </button>
      </div>
    </form>
  );
}

function makeBrief(payload: Record<string, string>) {
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
Monthly budget cap: ${payload.monthlyBudget}
Approval rule: ${payload.approvalRule}
Preferred subdomain: ${payload.preferredSubdomain}
Timeline: ${payload.timeline}

Notes:
${payload.notes}`;
}
