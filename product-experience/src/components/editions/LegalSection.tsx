export function LegalSection() {
  const panels = [
    {
      id: "privacy",
      title: "Privacy",
      body:
        "This public product experience does not expose local files, private vault data, provider credentials, agent execution, or client workspaces. Discovery messages are used only to respond about a Veloce engagement. Do not submit confidential, regulated, or client-identifying information through public forms.",
    },
    {
      id: "terms",
      title: "Terms",
      body:
        "The product experience is informational and for demonstration. Pricing, scope, deliverables, model allowance, confidentiality, payment, and case-study permission are agreed in a signed proposal before work begins. No external publishing or outreach happens without human approval.",
    },
    {
      id: "security",
      title: "Security",
      body:
        "Veloce AgenticOS separates public storytelling from private execution. Public pages may show sample workflows, but shell access, runtime controls, secrets, raw vaults, and client-specific data remain behind a separate authenticated operating boundary.",
    },
  ];

  return (
    <section
      aria-label="Privacy, terms, and security"
      className="scroll-mt-24 bg-[var(--paper)] py-24 lg:pl-[220px]"
    >
      <div className="mx-auto max-w-[1200px] px-5 lg:px-8">
        <div className="mb-10 max-w-2xl">
          <p className="font-display text-sm italic text-[var(--g5)]/60">Public boundary</p>
          <h2 className="font-heading mt-3 text-4xl font-bold leading-[1.05] text-[var(--g5)] lg:text-5xl">
            Clear before the first conversation.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {panels.map((panel) => (
            <article
              id={panel.id}
              key={panel.id}
              className="scroll-mt-28 rounded-lg border border-[var(--g5)]/12 bg-white/70 p-6 text-[var(--g5)] shadow-sm"
            >
              <h3 className="font-heading text-2xl font-bold">{panel.title}</h3>
              <p className="mt-4 text-sm leading-relaxed text-[var(--g5)]/68">{panel.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
