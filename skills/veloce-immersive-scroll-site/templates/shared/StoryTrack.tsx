"use client";

import { useRef } from "react";
import SceneCanvas from "@/components/scene/LazyScene";
import type { SceneTheme } from "@/components/scene/OperationalScene";

/**
 * Wraps a page's chapters with the shared, lazy-loaded 3D scene pinned behind
 * them. The scene reads scroll progress across exactly this track's height.
 * `theme` pins the scene to the motif matching this page's topic (Home uses
 * the full storyline; every other page holds a single, gently-breathing motif).
 */
export default function StoryTrack({
  children,
  theme = "full",
}: {
  children: React.ReactNode;
  theme?: SceneTheme;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={trackRef} className="relative grid grid-cols-1">
      <div className="col-start-1 row-start-1 sticky top-0 h-screen">
        <SceneCanvas trackRef={trackRef} theme={theme} />
      </div>
      <div className="relative col-start-1 row-start-1 z-10">{children}</div>
    </div>
  );
}
