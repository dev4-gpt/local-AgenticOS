import Link from "next/link";
import ApprovalsView from "@/components/ApprovalsView";

export const metadata = {
  title: "Approvals · Veloce AgenticOS",
  description: "Requests from adapters that need a second person: what they cover, who asked, and how long is left.",
};

export const dynamic = "force-dynamic";

// The flag is read on the server so a switched-off host shows one plain message and no data request is made.
export default function ApprovalsPage() {
  const enabled = process.env.ADAPTER_HOST_ENABLED === "true";
  return <main className="min-h-screen px-5 py-10 md:px-10" style={{ background: "var(--bg-deep)", color: "var(--cream)" }}>
    {enabled
      ? <ApprovalsView />
      : <div className="mx-auto max-w-3xl">
        <Link href="/adapters" className="text-[11px] text-sky-300 underline">Back to adapters</Link>
        <p className="eyebrow mt-6">Adapter host</p>
        <h1 className="mt-1 text-3xl font-semibold">Approvals are not switched on</h1>
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          This workspace has not enabled the adapter host, so there is nothing to approve. Adapters start disabled and are turned on one at a time.
        </p>
      </div>}
  </main>;
}
