import Link from "next/link";

/** Calm, motion-free conversion banner used at the end of every deep-dive page. */
export default function FinalCTA({
  title = "Ready to map a broken handoff?",
  description = "Tell us where delivery breaks down. We'll map how an operating system would run it instead.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="relative border-t border-white/5 bg-void-950 px-6 py-24">
      <div className="mx-auto max-w-content text-center">
        <h2 className="font-display text-3xl text-mist-200 md:text-4xl">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-mist-300">{description}</p>
        <Link
          href="/contact"
          className="mt-8 inline-flex items-center rounded-full bg-signal-500 px-7 py-3 font-semibold text-void-950 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
        >
          Map a broken handoff
        </Link>
      </div>
    </section>
  );
}
