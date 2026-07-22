"use client";

import dynamic from "next/dynamic";

const CodexView = dynamic(() => import("@/components/CodexView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center" aria-busy="true">
      <p className="text-sm text-[var(--cream-dim)]">Loading Codex workspace...</p>
    </div>
  ),
});

export default function CodexRoute() {
  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      <CodexView />
    </div>
  );
}
