import Link from "next/link";

export const metadata = { title: "Terms of Service · Veloce AgenticOS" };

export default function TermsPage() {
  return <LegalPage title="Terms of Service" intro="These terms govern use of Veloce AgenticOS, including public onboarding, isolated runtimes, provider connections, credits, and support.">
    <h2>Governed service</h2><p>Veloce provides a managed software service. A public request creates a pending account only; execution, provider activation, external delivery, and high-risk actions remain subject to verification, payment, manifest approval, quotas, and human approval.</p>
    <h2>Your responsibility</h2><p>You are responsible for the accuracy of your request, lawful use of connected providers and data, your BYOK provider terms, and reviewing outputs before external use. Do not submit secrets in public forms or ask the system to perform unlawful, abusive, or unsafe actions.</p>
    <h2>Billing and availability</h2><p>Setup fees, subscriptions, and prepaid managed credits are charged according to the selected Stripe price and current pricing snapshot. Failed or cancelled work may be refunded according to the ledger and plan. Veloce may suspend unsafe, unpaid, abusive, or technically unhealthy tenants.</p>
    <h2>AI outputs</h2><p>Outputs are untrusted drafts and recommendations. Veloce does not guarantee accuracy, completeness, fitness for a particular purpose, or third-party availability. Approval gates do not replace your professional judgment.</p>
    <h2>Contact</h2><p>Questions about these terms can be sent through the <Link href="/support" className="underline">support page</Link>.</p>
  </LegalPage>;
}

function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-[var(--paper)] text-[var(--g5)]"><header className="border-b border-[var(--g5)]/12"><nav className="mx-auto flex max-w-[1040px] items-center justify-between px-5 py-5 lg:px-8"><Link href="/" className="font-heading text-lg font-bold no-underline">Veloce AgenticOS</Link><Link href="/start" className="text-sm font-semibold underline">Start onboarding</Link></nav></header><article className="mx-auto max-w-[840px] px-5 py-14 lg:px-8"><p className="font-display text-base italic text-[var(--g5)]/62">Public service policy</p><h1 className="font-heading mt-3 text-5xl font-bold leading-tight">{title}</h1><p className="mt-5 text-base leading-relaxed text-[var(--g5)]/68">{intro}</p><div className="prose mt-10 max-w-none text-sm leading-relaxed text-[var(--g5)]/72">{children}</div><p className="mt-12 text-xs text-[var(--g5)]/50">Effective date: 2026-08-21 · Version 1.0</p></article></main>;
}
