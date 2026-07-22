"use client";

import { Canvas } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import { Suspense, useEffect, useRef } from "react";
import { useWebGLSupport } from "@/lib/useWebGLSupport";
import OperationalScene, { SceneTheme } from "./OperationalScene";
import StaticFallback from "./StaticFallback";

/**
 * Single reusable, lazy-mounted 3D scene shared by the whole page.
 * Tracks scroll progress (0-1 across the storyline sections) in a ref so the
 * scene animates without re-rendering React on every scroll frame.
 * Falls back to a static CSS scene when WebGL is unavailable or the user
 * prefers reduced motion — the canvas never carries copy, state, or CTAs.
 */
export default function SceneCanvas({
  trackRef,
  theme = "full",
}: {
  trackRef: React.RefObject<HTMLElement>;
  theme?: SceneTheme;
}) {
  const webglSupported = useWebGLSupport();
  const prefersReducedMotion = useReducedMotion();
  const progressRef = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (prefersReducedMotion || webglSupported === false) return;

    function update() {
      const el = trackRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const total = rect.height - window.innerHeight;
        const scrolled = -rect.top;
        progressRef.current = total > 0 ? Math.min(1, Math.max(0, scrolled / total)) : 0;
      }
      rafRef.current = requestAnimationFrame(update);
    }

    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [trackRef, prefersReducedMotion, webglSupported]);

  if (webglSupported === null) {
    return <StaticFallback />;
  }

  if (!webglSupported || prefersReducedMotion) {
    return <StaticFallback />;
  }

  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 bg-void-950">
      <Suspense fallback={<StaticFallback />}>
        <Canvas
          camera={{ position: [0, 0, 8], fov: 50 }}
          gl={{ antialias: true, alpha: false }}
          dpr={[1, 1.75]}
        >
          <color attach="background" args={["#05050a"]} />
          <OperationalScene progressRef={progressRef} reduced={!!prefersReducedMotion} theme={theme} />
        </Canvas>
      </Suspense>
    </div>
  );
}
