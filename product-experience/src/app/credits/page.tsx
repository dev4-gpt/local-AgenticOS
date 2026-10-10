import Link from "next/link";

export const metadata = {
  title: "Pricing and managed credits · Veloce AgenticOS",
  description: "Platform setup, subscriptions, BYOK, managed credits, estimates, settlements, and refunds.",
};

export default function CreditsPage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--g5)]">
      <header className="border-b border-[var(--g5)]/12">
        <nav className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <Link href="/" className="font-heading text-lg font-bold no-underline">Veloce AgenticOS</Link>
          <Link href="/start" className="text-sm font-semibold underline">Start onboarding</Link>
        </nav>
      </header>
      <section className="mx-auto max-w-[1040px] px-5 py-10 lg:px-8 lg:py-14">
        <p className="font-display text-base italic text-[var(--g5)]/62">Transparent public pricing model</p>
        <h1 className="font-heading mt-3 max-w-3xl text-3xl font-bold leading-tight md:text-4xl">Platform fees and provider usage</h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--g5)]/68">
          Every tenant starts with the same governed workspace. Implementation complexity, capability add-ons, and human managed services are quoted separately. Provider usage is not included in the base fee.
        </p>

        <section aria-labelledby="base-cost-heading" className="mt-9 border-y border-[var(--g5)]/20 py-6">
          <h2 id="base-cost-heading" className="font-heading text-xl font-bold">Base platform cost</h2>
          <dl className="mt-4 max-w-2xl divide-y divide-[var(--g5)]/12 text-sm">
            <div className="flex items-baseline justify-between gap-4 py-3"><dt>One-time setup</dt><dd className="shrink-0 font-semibold">$2,500</dd></div>
            <div className="flex items-baseline justify-between gap-4 py-3"><dt>Platform subscription</dt><dd className="shrink-0 font-semibold">$1,250/month</dd></div>
            <div className="flex items-baseline justify-between gap-4 py-3 font-semibold"><dt>Illustrative first month</dt><dd className="shrink-0">$3,750</dd></div>
          </dl>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--g5)]/68">
            The $3,750 example is setup plus one month of platform subscription only. It excludes taxes, provider usage, and any approved scope-based quote. With BYOK, you pay your provider directly; when managed credits are offered, you fund a separate prepaid wallet. Your complete spend is the platform fee plus those separate charges.
          </p>
        </section>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Policy title="One platform" body="The approved tenant manifest controls capabilities, providers, budgets, integrations, storage, retention, and approval rules." />
          <Policy title="BYOK or managed" body="With BYOK, you pay the provider directly. When managed credits are offered, Veloce supplies approved credentials from a separate prepaid wallet and pays the provider for you." />
          <Policy title="Scope-based quote" body="Seats, brands, workflows, integrations, media, migrations, support, and Veloce-led execution determine the quote. They do not create arbitrary software tiers." />
        </div>
        <section className="mt-8 border-t border-[var(--g5)]/20 pt-6">
          <h2 className="font-heading text-xl font-bold">What a client can verify</h2>
          <ul className="mt-4 grid list-disc gap-3 pl-5 text-sm leading-relaxed text-[var(--g5)]/70">
            <li>The approved commercial scope and quote before payment.</li>
            <li>Which capabilities are enabled, gated, or awaiting provider approval.</li>
            <li>Estimated provider credits before a paid provider stage begins.</li>
            <li>BYOK or Veloce-managed credential ownership.</li>
            <li>Settled credits, budget status, pricing snapshot, and ledger evidence.</li>
            <li>Refund or failure disposition when a queued action cannot complete.</li>
          </ul>
        </section>
        <p className="mt-8 text-xs leading-relaxed text-[var(--g5)]/55">Final amounts, taxes, provider terms, retention, and service scope are shown at checkout and in the customer agreement. Public signup does not grant unrestricted compute or provider access.</p>
      </section>
    </main>
  );
}

function Policy({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-md border border-[var(--g5)]/14 bg-white/45 p-5">
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--g5)]/65">{body}</p>
    </article>
  );
}
