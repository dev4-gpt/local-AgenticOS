"use client";

import { AlertTriangle, CheckCircle2, Clock3, Info } from "lucide-react";
import { clientRuntimeNotice, type ClientRuntimeNoticeTone } from "@/lib/clientRuntimeMessages";

const TONE_STYLES: Record<ClientRuntimeNoticeTone, { color: string; background: string; border: string; icon: typeof Info }> = {
  info: { color: "#1d4ed8", background: "rgba(96,165,250,0.12)", border: "rgba(29,78,216,0.28)", icon: Info },
  success: { color: "#047857", background: "rgba(16,185,129,0.12)", border: "rgba(4,120,87,0.28)", icon: CheckCircle2 },
  warning: { color: "#92400e", background: "rgba(251,191,36,0.16)", border: "rgba(146,64,14,0.3)", icon: Clock3 },
  danger: { color: "#991b1b", background: "rgba(248,113,113,0.14)", border: "rgba(153,27,27,0.32)", icon: AlertTriangle },
};

export default function ClientRuntimeNotice({ code, fallback }: { code: string; fallback?: string }) {
  const notice = clientRuntimeNotice(code, fallback);
  const style = TONE_STYLES[notice.tone];
  const Icon = style.icon;
  return (
    <div
      role={notice.tone === "danger" ? "alert" : "status"}
      aria-live="polite"
      className="mt-4 rounded-lg border p-3 text-[12px] leading-relaxed"
      style={{ borderColor: style.border, background: style.background, color: style.color }}
    >
      <div className="flex items-start gap-2">
        <Icon size={15} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{notice.title}</p>
          <p className="mt-1">{notice.body}</p>
          {notice.next && <p className="mt-2 text-[11px] opacity-90">{notice.next}</p>}
          {code && <p className="mt-2 font-mono text-[10px] opacity-75">code: {code}</p>}
        </div>
      </div>
    </div>
  );
}
