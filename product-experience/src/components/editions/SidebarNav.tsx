"use client";

import { useEffect, useState } from "react";
import { chapters } from "@/data/editions";
import { cn } from "@/lib/utils";

export function SidebarNav() {
  const [active, setActive] = useState(chapters[0]?.slug);

  useEffect(() => {
    const sections = chapters
      .map((c) => document.getElementById(c.slug))
      .filter((el): el is HTMLElement => !!el);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <aside className="sidebar-theme-text pointer-events-none fixed inset-y-0 left-0 z-40 hidden w-[220px] pl-8 lg:block">
      <nav className="pointer-events-auto absolute top-1/2 flex -translate-y-1/2 flex-col gap-1 text-sm">
        {chapters.map((chapter) => (
          <a
            key={chapter.slug}
            href={`#${chapter.slug}`}
            className={cn(
              "sidebar-link flex items-center justify-between border-t border-current/10 py-2 no-underline transition-opacity",
              active === chapter.slug ? "opacity-100 font-medium" : "opacity-50 hover:opacity-80"
            )}
          >
            <span>{chapter.title}</span>
            <span className="font-display text-xs italic">{chapter.roman}</span>
          </a>
        ))}
      </nav>

      <div className="terms-of-service pointer-events-auto absolute bottom-8 flex flex-col gap-2 text-[10px]">
        <p className="font-display">&copy; Veloce AgenticOS</p>
        <a href="#developer" className="font-display no-underline hover:underline">
          Terms of Service
        </a>
        <a
          href="#developer"
          className="font-display no-underline hover:underline"
        >
          Privacy Policy
        </a>
      </div>
    </aside>
  );
}
