"use client";

import { AlertTriangle, CheckCircle2, Clock3, Info } from "lucide-react";
import { clientRuntimeNotice, type ClientRuntimeNoticeTone } from "@/lib/clientRuntimeMessages";

const TONE_STYLES: Record<ClientRuntimeNoticeTone, { color: string; background: string; border: string; icon: typeof Info }> = {
  info: { color: "#1e3a8a", background: "rgba(219,234,254,0.96)", border: "rgba(37,99,235,0.42)", icon: Info },
  success: { color: "#065f46", background: "rgba(209,250,229,0.96)", border: "rgba(5,150,105,0.42)", icon: CheckCircle2 },
  warning: { color: "#78350f", background: "rgba(254,243,199,0.98)", border: "rgba(217,119,6,0.46)", icon: Clock3 },
  danger: { color: "#7f1d1d", background: "rgba(254,226,226,0.98)", border: "rgba(220,38,38,0.48)", icon: AlertTriangle },
};

export default function ClientRuntimeNotice({ code, fallback }: { code: string; fallback?: string }) {
  const notice = clientRuntimeNotice(code, fallback);
  const style = TONE_STYLES[notice.tone];
  const Icon = style.icon;
  return (
    <div
      role={notice.tone === "danger" ? "alert" : "status"}
      aria-live="polite"
      className="mt-4 rounded-lg border p-4 text-[13px] leading-relaxed shadow-sm"
      style={{ borderColor: style.border, background: style.background, color: style.color }}
    >
      <div className="flex items-start gap-2">
        <Icon size={17} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{notice.title}</p>
          <p className="mt-1">{notice.body}</p>
          {notice.next && <p className="mt-2 text-[12px] opacity-90">{notice.next}</p>}
          {code && <p className="mt-3 inline-flex rounded-md border px-2 py-1 font-mono text-[11px]" style={{ borderColor: style.border }}>code: {code}</p>}
        </div>
      </div>
    </div>
  );
}
