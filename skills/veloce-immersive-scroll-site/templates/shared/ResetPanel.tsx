/** A deliberate calm beat between chapters — visual and cognitive breathing room before the next signal. */
export default function ResetPanel({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-content px-6">
      <div className="flex items-center gap-4 py-4 text-xs uppercase tracking-[0.25em] text-mist-400">
        <span className="h-px flex-1 bg-white/10" />
        <span>{label}</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}
