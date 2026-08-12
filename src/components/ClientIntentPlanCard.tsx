"use client";

export type ClientIntentPlan = {
  planId: string;
  status: string;
  intent?: string | null;
  capabilityId?: string | null;
  playbookId?: string | null;
  confidence?: number | null;
  riskClass?: string | null;
  approval?: string | null;
  reason?: string | null;
  clarificationQuestion?: string | null;
  output?: string | null;
  errorCode?: string | null;
};

export default function ClientIntentPlanCard({ plan }: { plan: ClientIntentPlan }) {
  const waiting = plan.status === "queued" || plan.status === "running";
  const color = plan.status === "blocked" ? "#fda4af" : plan.status === "needs_clarification" ? "#fbbf24" : "#60a5fa";
  return <section className="mt-3 rounded-md border p-3" style={{ borderColor: `${color}55`, background: `${color}0b` }}>
    <p className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>Veloce plan · {waiting ? "preparing" : plan.status.replaceAll("_", " ")}</p>
    {plan.intent && <p className="mt-1.5 text-[12px] font-semibold" style={{ color: "var(--cream)" }}>Veloce will use {plan.intent}</p>}
    {plan.reason && <p className="mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{plan.reason}</p>}
    {plan.capabilityId && <p className="mt-2 text-[9.5px]" style={{ color: "var(--cream-mute)" }}>{plan.capabilityId}{plan.playbookId ? ` · ${plan.playbookId}` : ""}{plan.riskClass ? ` · ${plan.riskClass} risk` : ""}{typeof plan.confidence === "number" ? ` · ${Math.round(plan.confidence * 100)}% confidence` : ""}</p>}
    {plan.approval && <p className="mt-1 text-[9.5px]" style={{ color: "var(--cream-mute)" }}>Approval: {plan.approval === "none" ? "not required" : plan.approval}</p>}
    {plan.clarificationQuestion && <p className="mt-2 text-[11px] font-medium" style={{ color: "#fbbf24" }}>{plan.clarificationQuestion}</p>}
    {plan.output && <p className="mt-3 whitespace-pre-wrap text-[11.5px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>{plan.output}</p>}
    {plan.errorCode && <p className="mt-2 text-[10px]" style={{ color: "#fda4af" }}>{plan.errorCode}</p>}
  </section>;
}
