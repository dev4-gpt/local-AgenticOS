import Link from "next/link";
import { StartIntakeForm } from "@/components/editions/StartIntakeForm";

const steps = [
  "You submit requirements, tools, budget, and approval rules.",
  "You verify your email; payment and manifest review happen before activation.",
  "The control plane provisions an isolated runtime and runs its evidence bundle.",
  "You enter the portal and connect BYOK or Veloce-managed providers server-side.",
];

const guardrails = [
  "No raw 3939 operator workspace exposure",
  "Cloud Run service gated to approved identities",
  "Client-owned credentials or written managed allowance",
  "Secret Manager for provider keys and OAuth material",
  "Human approval before external actions",
  "Budget caps and warning thresholds",
  "Tenant-scoped memory, files, and audit logs",
];

export default function StartPage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--g5)]">
      <header className="border-b border-[var(--g5)]/12 bg-[var(--paper)]/95">
        <nav className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 lg:px-8">
          <Link href="/" className="font-heading text-lg font-bold no-underline">
            Veloce AgenticOS
          </Link>
          <Link
            href="/#developer"
            className="rounded-full border border-[var(--g5)]/18 px-4 py-2 text-sm font-semibold no-underline"
          >
            Back to product
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-[1240px] gap-12 px-5 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
        <div className="flex flex-col justify-between gap-10">
          <div>
            <p className="font-display text-base italic text-[var(--g5)]/62">Public onboarding · governed execution</p>
            <h1 className="font-heading mt-4 max-w-2xl text-5xl font-bold leading-[0.98] lg:text-7xl">
              Request your own Veloce OS.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--g5)]/68">
              Anyone can start here. Veloce turns a verified, paid request into an isolated
              client operating system with a personal provider page, transparent credits,
              approval checkpoints, and tenant-scoped data.
            </p>
          </div>

          <div className="grid gap-8">
            <section>
              <h2 className="font-heading text-xl font-bold">Provisioning path</h2>
              <ol className="mt-4 grid gap-3">
                {steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-relaxed text-[var(--g5)]/70">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--g5)] text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h2 className="font-heading text-xl font-bold">Runtime guardrails</h2>
              <ul className="mt-4 grid gap-2">
                {guardrails.map((item) => (
                  <li key={item} className="rounded-lg border border-[var(--g5)]/12 bg-white/35 px-4 py-3 text-sm text-[var(--g5)]/70">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <section className="rounded-lg border border-[var(--g5)]/14 bg-[var(--g1)]/55 p-5 shadow-sm lg:p-8">
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--g5)]/50">
              Public signup
            </p>
            <h2 className="font-heading mt-2 text-3xl font-bold">Describe the service you need.</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--g5)]/62">
              Never paste credentials into intake. After verification, payment, and approval, add BYOK keys or choose managed credits in your private portal.
            </p>
          </div>
          <div className="mb-6 flex flex-wrap gap-3 text-sm">
            <a href="/provider-catalog" className="rounded-full border border-[var(--g5)]/18 px-4 py-2 font-semibold no-underline">Provider catalog</a>
            <a href="/credits" className="rounded-full border border-[var(--g5)]/18 px-4 py-2 font-semibold no-underline">Credits policy</a>
          </div>
          <StartIntakeForm />
        </section>
      </section>
    </main>
  );
}
