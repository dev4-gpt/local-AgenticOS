import Link from "next/link";

const capabilities = [
  {
    name: "Platform core",
    status: "Core scope",
    body: "Tenant memory, artifacts, orchestration, knowledge, delivery review, quality controls, and text-agent workflows are the universal platform foundation.",
    requirement: "Included in the base platform after tenant approval.",
  },
  {
    name: "Growth operations",
    status: "Scope add-on",
    body: "SEO research, lead-generation workflows, signal tracking, and growth reporting can be added to the same governed workspace.",
    requirement: "Approved scope, named destinations, provider evidence, and external-action approvals where applicable.",
  },
  {
    name: "Creative and media",
    status: "Scope add-on",
    body: "Web studio, design intelligence, image, video, music, and voice workflows remain visible even when they are not enabled for a tenant.",
    requirement: "Approved media providers, budgets, storage/retention, rights review, and publication gates.",
  },
  {
    name: "Integrations and external delivery",
    status: "Gated",
    body: "Connectors, publishing, outreach, paid actions, and other external delivery routes are deliberately available as governed capabilities rather than silent defaults.",
    requirement: "Operator-approved integration scope, credential ownership, destination allowlists, quotas, and human approval.",
  },
  {
    name: "Managed operations",
    status: "Separate service",
    body: "Strategy, content production, growth execution, training, and Veloce-led operating support are human-delivered services attached to the platform scope.",
    requirement: "A separate statement of work or retainer; it is not an application tier.",
  },
];

export const metadata = {
  title: "Capabilities and entitlements · Veloce AgenticOS",
  description: "See the universal Veloce platform, scope add-ons, and gated capabilities.",
};

export default function CapabilitiesPage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--g5)]">
      <header className="border-b border-[var(--g5)]/12 bg-[var(--paper)]/95">
        <nav className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 lg:px-8">
          <Link href="/" className="font-heading text-lg font-bold no-underline">Veloce AgenticOS</Link>
          <div className="flex gap-3 text-sm font-semibold">
            <Link href="/provider-catalog" className="rounded-full border border-[var(--g5)]/18 px-4 py-2 no-underline">Provider catalog</Link>
            <Link href="/start" className="rounded-full bg-[var(--g5)] px-4 py-2 text-white no-underline">Request a scope</Link>
          </div>
        </nav>
      </header>
      <section className="mx-auto max-w-[1240px] px-5 py-12 lg:px-8 lg:py-16">
        <p className="font-display text-base italic text-[var(--g5)]/62">One platform · governed entitlements</p>
        <h1 className="font-heading mt-3 max-w-4xl text-5xl font-bold leading-[0.98] lg:text-7xl">Everything is visible. Activation is scoped.</h1>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-[var(--g5)]/68">Every client uses the same Veloce AgenticOS foundation. The approved commercial scope and tenant manifest decide which capabilities, providers, budgets, integrations, storage, and approval routes are enabled. Gated capabilities show their requirements and can be requested without changing the product into arbitrary tiers.</p>
        <div className="mt-9 grid gap-4">
          {capabilities.map((capability) => (
            <article key={capability.name} className="rounded-2xl border border-[var(--g5)]/14 bg-white/45 p-5 shadow-sm lg:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="font-heading text-2xl font-bold">{capability.name}</h2>
                <span className="rounded-full border border-[var(--g5)]/18 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--g5)]/62">{capability.status}</span>
              </div>
              <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--g5)]/72">{capability.body}</p>
              <p className="mt-4 border-t border-[var(--g5)]/10 pt-4 text-xs leading-relaxed text-[var(--g5)]/58"><strong className="text-[var(--g5)]/72">Requirement:</strong> {capability.requirement}</p>
            </article>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/start" className="rounded-full bg-[var(--g5)] px-5 py-3 text-sm font-semibold text-white no-underline">Request capability scope</Link>
          <Link href="/support" className="rounded-full border border-[var(--g5)]/18 px-5 py-3 text-sm font-semibold no-underline">Ask for an upgrade</Link>
        </div>
      </section>
    </main>
  );
}
