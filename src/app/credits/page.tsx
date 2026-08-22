import Link from "next/link";

export const metadata = {
  title: "Credits and platform policy · Veloce AgenticOS",
  description: "How Veloce estimates provider usage, settles jobs, and separates BYOK from future managed credits.",
};

export default function CreditsPage() {
  return <main className="min-h-screen px-5 py-10 md:px-10" style={{ background: "var(--bg-deep)", color: "var(--cream)" }}>
    <div className="mx-auto max-w-4xl">
      <Link href="/provider-catalog" className="text-[11px] text-sky-300 underline">← Back to provider catalog</Link>
      <p className="mt-8 text-[10px] uppercase tracking-[0.2em] text-sky-300">Transparent beta billing policy</p>
      <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Credits, fees, and settlement</h1>
      <p className="mt-5 max-w-3xl text-sm leading-relaxed text-slate-300">Veloce keeps exact provider and infrastructure amounts internally in USD micros, then presents normalized usage credits so estimates remain readable while vendor pricing changes. A job should show its estimate before work, its budget reservation, and its settled or refunded amount after work.</p>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <Policy title="Default: BYOK" body="You bring the approved provider key and pay that provider directly. Veloce applies a minimum platform/setup fee for the isolated runtime, policy, support, storage, and evidence surface." />
        <Policy title="Managed credits later" body="Managed credits are not active by default. When offered, Veloce supplies provider credentials and prices provider cost, compute, support, and risk into a separate credit plan." />
        <Policy title="No surprise execution" body="Provider calls remain manifest-controlled. Reservations can block work at the budget cap; settlement records the actual amount and failed or cancelled work can refund where the ledger permits." />
      </section>
      <section className="mt-8 rounded-xl border border-slate-700 bg-slate-900/60 p-5 text-sm leading-relaxed text-slate-300">
        <h2 className="text-lg font-semibold text-white">What customers can verify</h2>
        <ul className="mt-3 grid gap-2 pl-5">
          <li className="list-disc">Provider ownership: client BYOK, future Veloce-managed, or native platform stage.</li>
          <li className="list-disc">Estimated credits before a paid provider stage begins.</li>
          <li className="list-disc">Settled credits, budget status, and ledger evidence after completion.</li>
          <li className="list-disc">The versioned catalog and pricing snapshot used for the decision.</li>
        </ul>
      </section>
      <p className="mt-8 text-xs text-slate-400">This page is policy, not a purchase flow. Final setup fees, credit rates, taxes, provider terms, retention, and support scope are confirmed in the invite-only beta agreement.</p>
    </div>
  </main>;
}

function Policy({ title, body }: { title: string; body: string }) {
  return <article className="rounded-xl border border-slate-700 bg-white/[0.03] p-5"><h2 className="text-sm font-semibold text-white">{title}</h2><p className="mt-2 text-xs leading-relaxed text-slate-300">{body}</p></article>;
}
