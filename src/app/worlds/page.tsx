import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

export const metadata = { title: "World Studio | Veloce AgenticOS" };

export default function WorldsPage() {
  if (process.env.VELOCE_CLIENT_EDITION === "1") notFound();
  return <div className="flex h-full min-h-[100dvh] flex-col bg-[#0c1719] text-[#f0efdf]">
    <header className="flex min-h-12 items-center justify-between gap-3 border-b border-white/10 px-4">
      <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold" title="Back to Mission Control"><ArrowLeft size={15} />World Studio</Link>
      <a href="http://127.0.0.1:3945/worlds/index.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs" title="Open World Studio in a new window"><ExternalLink size={14} />Open full window</a>
    </header>
    <iframe
      className="min-h-0 w-full flex-1 border-0"
      src="http://127.0.0.1:3945/worlds/index.html"
      title="Interactive 3D worlds"
      sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-downloads allow-popups"
      allow="fullscreen"
      referrerPolicy="no-referrer"
    />
  </div>;
}
