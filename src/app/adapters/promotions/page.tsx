import Link from "next/link";
import PromotionsView from "@/components/PromotionsView";

export const metadata = {
  title: "Shared memory review · Veloce AgenticOS",
  description: "Notes waiting to be shared with every adapter: the note, the scan, where it came from, and a way to withdraw shared notes.",
};

export const dynamic = "force-dynamic";

// The flag is read on the server so a switched-off host shows one plain message and no data request is made.
export default function PromotionsPage() {
  const enabled = process.env.ADAPTER_HOST_ENABLED === "true";
  return <main className="min-h-screen px-5 py-10 md:px-10" style={{ background: "var(--bg-deep)", color: "var(--cream)" }}>
    {enabled
      ? <PromotionsView />
      : <div className="mx-auto max-w-3xl">
        <Link href="/adapters" className="text-[11px] text-sky-300 underline">Back to adapters</Link>
        <p className="eyebrow mt-6">Adapter host</p>
        <h1 className="mt-1 text-3xl font-semibold">Shared memory review is not switched on</h1>
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          This workspace has not enabled the adapter host, so there is nothing to review. Adapters start disabled and are turned on one at a time.
        </p>
      </div>}
  </main>;
}
