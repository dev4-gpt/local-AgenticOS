"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  ["Command", [["/", "Mission Control"], ["/claude", "Claude"], ["/openclaw", "OpenClaw"], ["/hermes", "Hermes"], ["/antigravity", "Antigravity"], ["/codex", "Codex"], ["/kimi", "Kimi Code"], ["/glm", "GLM 5.2"], ["/glm-code", "GLM Code"], ["/grok", "Grok Build"], ["/freeclaude", "Free Claude Code"], ["/fusion", "Fusion"], ["/sakana", "Sakana Fugu"], ["/local", "Local"]]],
  ["Context", [["/memory", "Memory"], ["/notebook", "Notebook"]]],
  ["Orchestrate", [["/paperclip", "Paperclip"], ["/room", "AI Agent Mastermind"], ["/pipeline", "Pipeline"], ["/agent-kanban", "Agent Kanban"], ["/kanban", "Kanban"], ["/loop", "Loop"]]],
  ["Create", [["/flow-lab", "Flow Lab"], ["/web-studio", "Web Studio"], ["/opendesign", "Open Design"], ["/video", "Video"], ["/openmontage", "OpenMontage"], ["/music", "Music"], ["/games", "Game Studio"], ["/thumbnails", "Thumbnails"]]],
  ["Govern", [["/integrations", "Integrations"], ["/capabilities", "Capabilities"], ["/seo", "SEO"], ["/guide", "Build Guide"]]],
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function pageTitle(pathname: string) {
  for (const [, items] of navigation) {
    const item = items.find(([href]) => isActive(pathname, href));
    if (item) return item[1];
  }
  return "Workspace";
}

export default function RuntimeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const home = pathname === "/";

  return (
    <div className="h-screen overflow-hidden bg-[var(--bg-deep)] text-[var(--cream)] md:flex">
      <header className="md:hidden flex items-center justify-between gap-4 border-b border-[var(--line-soft)] px-4 py-3 bg-[var(--bg-mid)]">
        <Link href="/" className="text-sm font-semibold">Veloce AgenticOS</Link>
        <Link href="/capabilities" className="text-xs text-[var(--gold)]">Capabilities</Link>
      </header>
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-[var(--line-soft)] bg-[var(--bg-mid)]">
        <Link href="/" className="px-5 pt-6 pb-4 border-b border-[var(--line-soft)]">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--cream-mute)]">Local Studio</div>
          <div className="mt-1 text-lg font-semibold">Veloce AgenticOS</div>
        </Link>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
          {navigation.map(([group, items]) => (
            <section key={group} className="mb-5">
              <h2 className="px-2 mb-1 text-[10px] uppercase tracking-[0.16em] text-[var(--cream-mute)]">{group}</h2>
              <div className="space-y-0.5">
                {items.map(([href, label]) => {
                  const active = isActive(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`block rounded-md px-2.5 py-2 text-sm transition ${active ? "bg-[rgba(212,165,116,0.14)] text-[var(--gold)]" : "text-[var(--cream-dim)] hover:bg-black/5 hover:text-[var(--cream)]"}`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <div className="border-t border-[var(--line-soft)] px-5 py-4 text-[11px] leading-relaxed text-[var(--cream-mute)]">
          Private local workspace<br />Claude · OpenClaw · Hermes
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className={home ? "min-h-full w-full" : "mx-auto min-h-full max-w-[1500px] px-6 py-8 md:px-10"}>
          {!home && (
            <header className="mb-8 border-b border-[var(--line-soft)] pb-5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--cream-mute)]">Veloce AgenticOS · Private workspace</p>
              <h1 className="mt-2 text-2xl font-semibold text-[var(--cream)]">{pageTitle(pathname)}</h1>
            </header>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
