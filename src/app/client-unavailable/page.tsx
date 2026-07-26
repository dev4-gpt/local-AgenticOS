import Link from "next/link";

export default function ClientUnavailablePage() {
  return <main className="min-h-screen grid place-items-center bg-[var(--bg-deep)] px-5"><section className="panel max-w-lg p-7"><div className="eyebrow">Client edition boundary</div><h1 className="text-2xl font-semibold mt-2 text-[var(--fg)]">This capability is not enabled for this runtime.</h1><p className="text-sm leading-relaxed text-[var(--fg-dim)] mt-3">Veloce has kept this operator-only surface outside the client deployment. Enabled workflows are selected in the client manifest and approved individually.</p><Link href="/" className="inline-flex mt-5 rounded-lg border border-[var(--panel-border)] px-3 py-2 text-sm text-[var(--fg)]">Return to runtime</Link></section></main>;
}
