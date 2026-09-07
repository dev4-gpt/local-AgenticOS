import Link from "next/link";

export const metadata = { title: "Payment received · Veloce AgenticOS" };

export default function BillingSuccessPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-5 text-[var(--g5)]">
      <section className="max-w-lg rounded-2xl border border-[var(--g5)]/14 bg-white/45 p-8 text-center">
        <p className="font-display italic text-[var(--g5)]/60">Veloce AgenticOS</p>
        <h1 className="font-heading mt-2 text-3xl font-bold">Payment received</h1>
        <p className="mt-5 text-sm leading-relaxed text-[var(--g5)]/68">
          Your payment is being verified securely. Your request will move to
          operator review before any runtime is provisioned or activated.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--g5)]/68">
          We will send the next steps to the email address used for onboarding.
        </p>
        <Link href="/support" className="mt-6 inline-block text-sm font-semibold underline">
          Contact support
        </Link>
      </section>
    </main>
  );
}
