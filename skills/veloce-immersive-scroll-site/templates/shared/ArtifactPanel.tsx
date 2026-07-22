export default function ArtifactPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-void-900/70 shadow-[0_0_60px_rgba(255,154,77,0.06)] backdrop-blur">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-signal-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-mist-400/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-mist-400/40" />
        <p className="ml-2 text-xs font-medium text-mist-400">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
