// Native `href="#id"` fragment navigation silently no-ops on this page (the
// pinned/sticky scroll-jacked story section breaks the browser's built-in
// scroll-to-fragment step). scrollIntoView() is unaffected, so every in-page
// link calls this instead of relying on the browser's default anchor jump.
export function jumpTo(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}
