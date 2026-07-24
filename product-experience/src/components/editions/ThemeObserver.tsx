"use client";

import { useEffect } from "react";

/**
 * Flips data-nav-theme / data-sidebar-theme / data-title-theme on <html>
 * between "light" (light text, used over dark backgrounds — the hero and
 * every chapter's pinned painting intro) and "dark" (dark text, used over
 * the beige content background) based on which .theme-dark-region is
 * currently crossing the trigger line near the top of the viewport. Mirrors
 * the live site's IntersectionObserver-driven theme system (see
 * docs/research/www.shopify.com/BEHAVIORS.md).
 */
export function ThemeObserver() {
  useEffect(() => {
    const regions = Array.from(document.querySelectorAll<HTMLElement>(".theme-dark-region"));
    if (regions.length === 0) return;

    // Each theme layer flips based on whether a dark painting region is behind
    // the element that layer styles — so each uses a trigger band at that
    // element's own vertical position. The top nav samples the top of the
    // viewport; the chapter list is vertically centered, so it must sample the
    // MIDDLE (otherwise, over a tall pale feature area, the centered list would
    // still read the previous painting near the top and stay white-on-white).
    const makeBandObserver = (
      rootMargin: string,
      apply: (theme: "light" | "dark") => void
    ) => {
      // Callbacks only report entries whose intersection state just changed, so
      // aggregate across calls instead of trusting the latest batch alone.
      const intersecting = new Set<Element>();
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) intersecting.add(entry.target);
            else intersecting.delete(entry.target);
          }
          apply(intersecting.size > 0 ? "light" : "dark");
        },
        { threshold: 0, rootMargin }
      );
      regions.forEach((el) => observer.observe(el));
      return observer;
    };

    // Top band → nav + big chapter title (both sit near the top).
    const topObserver = makeBandObserver("-50px 0px -95% 0px", (theme) => {
      document.documentElement.setAttribute("data-nav-theme", theme);
      document.documentElement.setAttribute("data-title-theme", theme);
    });

    // Center band (a thin sliver at 50% height) → the vertically-centered
    // chapter list, so its text always opposes whatever is directly behind it.
    const centerObserver = makeBandObserver("-49.9% 0px -49.9% 0px", (theme) => {
      document.documentElement.setAttribute("data-sidebar-theme", theme);
    });

    return () => {
      topObserver.disconnect();
      centerObserver.disconnect();
    };
  }, []);

  return null;
}
