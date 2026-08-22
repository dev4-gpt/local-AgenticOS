import Link from "next/link";
import { SupportForm } from "@/components/SupportForm";

export const metadata = { title: "Support · Veloce AgenticOS" };

export default function SupportPage() {
  return <main className="min-h-screen bg-[var(--paper)] text-[var(--g5)]"><header className="border-b border-[var(--g5)]/12"><nav className="mx-auto flex max-w-[1040px] items-center justify-between px-5 py-5 lg:px-8"><Link href="/" className="font-heading text-lg font-bold no-underline">Veloce AgenticOS</Link><Link href="/start" className="text-sm font-semibold underline">Start onboarding</Link></nav></header><section className="mx-auto max-w-[840px] px-5 py-14 lg:px-8"><p className="font-display text-base italic text-[var(--g5)]/62">Human support and abuse reporting</p><h1 className="font-heading mt-3 text-5xl font-bold leading-tight">How can we help?</h1><p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--g5)]/68">Include a request ID when you have one. Never include passwords, API keys, access tokens, or private credentials in a support message.</p><div className="mt-10 rounded-2xl border border-[var(--g5)]/14 bg-white/45 p-5 lg:p-8"><SupportForm /></div></section></main>;
}
