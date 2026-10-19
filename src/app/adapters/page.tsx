import AdaptersView from "@/components/AdaptersView";

export const metadata = {
  title: "Adapters · Veloce AgenticOS",
  description: "Products plugged into Veloce, their state, what they may do, and their spend against their caps.",
};

export const dynamic = "force-dynamic";

// The flag is read on the server so a switched-off host shows one plain message and no data request is made.
export default function AdaptersPage() {
  const enabled = process.env.ADAPTER_HOST_ENABLED === "true";
  return <main className="min-h-screen px-5 py-10 md:px-10" style={{ background: "var(--bg-deep)", color: "var(--cream)" }}>
    {enabled
      ? <AdaptersView />
      : <div className="mx-auto max-w-3xl">
        <p className="eyebrow">Adapter host</p>
        <h1 className="mt-1 text-3xl font-semibold">Adapters are not switched on</h1>
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--cream-dim)" }}>
          This workspace has not enabled the adapter host, so there is nothing to show. Adapters start disabled and are turned on one at a time.
        </p>
      </div>}
  </main>;
}
