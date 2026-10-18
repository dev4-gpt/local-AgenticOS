"use client";

import { useEffect, useMemo, useState } from "react";
import { chapters } from "@/data/editions";
import { MenuIcon, CloseIcon, SearchIcon, ChevronDownIcon } from "@/components/icons";

type SearchResult = {
  key: string;
  title: string;
  eyebrow: string;
  description: string;
  href: string;
};

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [query, setQuery] = useState("");

  const searchResults = useMemo<SearchResult[]>(() => {
    const chapterResults = chapters.map((chapter) => ({
      key: `chapter-${chapter.slug}`,
      title: chapter.title,
      eyebrow: `Chapter ${chapter.roman}`,
      description: `${chapter.items.length || 1} linked operating surface${chapter.items.length === 1 ? "" : "s"}`,
      href: `#${chapter.slug}`,
    }));

    const itemResults = chapters.flatMap((chapter) =>
      chapter.items.map((item) => ({
        key: `${chapter.slug}-${item.eyebrow}`,
        title: item.eyebrow ?? chapter.title,
        eyebrow: chapter.title,
        description: item.desc ?? "Open this operating surface.",
        href: item.linkHref?.startsWith("#") ? `#${chapter.slug}` : item.linkHref ?? `#${chapter.slug}`,
      }))
    );

    const needle = query.trim().toLowerCase();
    const allResults = [...chapterResults, ...itemResults];

    if (!needle) return allResults.slice(0, 8);

    return allResults
      .filter((result) =>
        [result.title, result.eyebrow, result.description].some((value) =>
          value.toLowerCase().includes(needle)
        )
      )
      .slice(0, 10);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-gradient-to-b from-black/10 to-transparent">
      <nav className="mx-auto flex h-[50px] max-w-[1680px] items-center justify-between px-5 lg:h-[60px] lg:px-8">
        <div className="nav-theme-text flex items-center gap-8 text-sm font-medium">
          <span className="font-heading font-bold">Veloce AgenticOS</span>
          <span className="opacity-60">Private Operator Edition</span>
        </div>

        <div className="relative hidden items-center lg:flex">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-10 w-[280px] items-center gap-3 rounded-full border border-black/10 bg-white/95 px-4 text-left text-sm font-medium text-black shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            aria-expanded={searchOpen}
            aria-controls="veloce-search-panel"
          >
            <SearchIcon className="shrink-0 text-black/60" />
            <span className="flex-1 text-black/70">Search OS surfaces</span>
            <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] uppercase text-black/45">Cmd K</span>
          </button>

          {searchOpen && (
            <div
              id="veloce-search-panel"
              className="absolute right-0 top-12 w-[420px] overflow-hidden rounded-lg border border-black/10 bg-white text-black shadow-2xl"
            >
              <label className="flex items-center gap-3 border-b border-black/10 px-4 py-3">
                <SearchIcon className="shrink-0 text-black/55" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search Memory, Flow Lab, Lead routing..."
                  className="h-9 flex-1 bg-transparent text-sm text-black outline-none placeholder:text-black/45"
                />
              </label>
              <div className="max-h-[460px] overflow-y-auto py-2">
                {searchResults.length > 0 ? (
                  searchResults.map((result) => (
                    <a
                      key={result.key}
                      href={result.href}
                      onClick={() => setSearchOpen(false)}
                      className="block px-4 py-3 text-black no-underline transition hover:bg-black/[0.04] focus-visible:bg-black/[0.06] focus-visible:outline-none"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-heading text-lg font-bold leading-tight">{result.title}</span>
                        <span className="shrink-0 rounded-full bg-black/[0.06] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-black/55">
                          {result.eyebrow}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm leading-snug text-black/62">{result.description}</p>
                    </a>
                  ))
                ) : (
                  <p className="px-4 py-8 text-center text-sm text-black/55">No matching surface found.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div className="relative">
            <button
              type="button"
              onClick={() => setAccessOpen((value) => !value)}
              className="flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              aria-expanded={accessOpen}
              aria-controls="runtime-access-menu"
            >
              Runtime access
              <ChevronDownIcon className={accessOpen ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {accessOpen && (
              <div id="runtime-access-menu" role="menu" className="absolute right-0 top-12 w-64 overflow-hidden rounded-lg border border-black/10 bg-white p-1 text-black shadow-2xl">
                <a href="/start" role="menuitem" onClick={() => setAccessOpen(false)} className="block rounded-md px-3 py-3 text-sm font-semibold no-underline transition hover:bg-black/[0.05]">
                  Request runtime
                  <span className="mt-1 block text-xs font-normal text-black/55">Describe the workspace you need.</span>
                </a>
                <a href="/login" role="menuitem" onClick={() => setAccessOpen(false)} className="block rounded-md px-3 py-3 text-sm font-semibold no-underline transition hover:bg-black/[0.05]">
                  Client login
                  <span className="mt-1 block text-xs font-normal text-black/55">Open your approved workspace.</span>
                </a>
              </div>
            )}
          </div>
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
            <a href="/start" onClick={() => setMenuOpen(false)} className="no-underline hover:underline">Request runtime</a>
            <a href="/login" onClick={() => setMenuOpen(false)} className="no-underline hover:underline">Client login</a>
            <a href="#terms" onClick={() => setMenuOpen(false)} className="no-underline hover:underline">
              Terms of Service
            </a>
            <a href="#privacy" onClick={() => setMenuOpen(false)} className="no-underline hover:underline">
              Privacy Policy
            </a>
            <a href="#security" onClick={() => setMenuOpen(false)} className="no-underline hover:underline">
              Security
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
