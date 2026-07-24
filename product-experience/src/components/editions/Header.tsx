"use client";

import { useState } from "react";
import { chapters } from "@/data/editions";
import { ChevronDownIcon, MenuIcon, CloseIcon, SearchIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editionsOpen, setEditionsOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-gradient-to-b from-black/10 to-transparent">
      <nav className="mx-auto flex h-[50px] max-w-[1680px] items-center justify-between px-5 lg:h-[60px] lg:px-8">
        <div className="nav-theme-text flex items-center gap-8 text-sm font-medium">
          <span className="font-heading font-bold">Veloce AgenticOS</span>
          <span className="opacity-60">Private Operator Edition</span>
        </div>

        <div className="hidden items-center gap-6 lg:flex">
          <button
            type="button"
            onClick={() => setEditionsOpen((v) => !v)}
            className="nav-theme-text flex items-center gap-2 text-sm font-medium"
          >
            Editions
            <ChevronDownIcon className={cn("transition-transform", editionsOpen && "rotate-180")} />
          </button>
          <button type="button" className="nav-theme-text flex items-center gap-2 text-sm font-medium">
            Search
            <SearchIcon />
          </button>
        </div>

        <div className="flex items-center gap-6">
          <a
            href="https://github.com/dev4-gpt/local-AgenticOS"
            className="nav-theme-text hidden text-sm no-underline hover:underline lg:inline"
          >
            GitHub
          </a>
          <a
            href="#developer"
            className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black no-underline"
          >
            Book a walkthrough
          </a>
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className="nav-theme-text lg:hidden"
          >
            <MenuIcon />
          </button>
        </div>
      </nav>

      {editionsOpen && (
        <div className="mx-auto hidden max-w-[1680px] px-8 lg:block">
          <ul className="w-[280px] rounded-md border border-black/10 bg-white py-2 shadow-lg">
            {chapters.length > 0 && (
              <li className="px-4 py-2 text-xs uppercase tracking-wide text-black/50">
                Past editions
              </li>
            )}
            {["Operator Edition — Command→Deliver", "Runtime — Local & Private", "Method — 90-day engagement"].map(
              (label) => (
                <li key={label}>
                  <a
                    href="#"
                    className="block px-4 py-2 text-sm text-black no-underline hover:bg-black/5"
                  >
                    {label}
                  </a>
                </li>
              )
            )}
          </ul>
        </div>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#292919] text-white lg:hidden">
          <div className="flex h-[50px] items-center justify-end px-5">
            <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
              <CloseIcon />
            </button>
          </div>
          <ul className="mobile-nav-list flex-1 overflow-y-auto px-5">
            {chapters.map((chapter) => (
              <li key={chapter.slug} className="border-t border-white/10 last:border-b">
                <a
                  href={`#${chapter.slug}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-between py-5 font-heading text-2xl font-bold no-underline"
                >
                  {chapter.title}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 px-5 py-6 text-xs text-white/60">
            <span>&copy; Veloce AgenticOS</span>
            <a href="#developer" className="no-underline hover:underline">
              Terms of Service
            </a>
            <a href="#developer" className="no-underline hover:underline">
              Privacy Policy
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
