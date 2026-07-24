"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll-driven "big bang": a singularity that explodes into a universe of
 * glowing cosmic dust as the hero's scroll progress advances. Driven by the
 * same useScrollProgress value as the rest of the hero — the `progress` prop
 * scrubs the explosion outward, while an internal requestAnimationFrame loop
 * adds continuous swirl + twinkle so the field stays alive between scrolls.
 *
 * Rendered on a canvas (rather than CSS/DOM like the rest of the page)
 * because a "massive universe" needs ~1000 glowing particles, which per-frame
 * DOM nodes can't do at 60fps. Perf comes from pre-rendered glow sprites
 * stamped with drawImage — no per-particle gradient or shadowBlur per frame.
 */

// --- Tunables ---------------------------------------------------------------
const PARTICLE_COUNT = 900; // raise for a denser universe (costs perf)
const MAX_RADIUS_FACTOR = 0.8; // how far across the screen particles reach at progress 1
const SWIRL = 0.15; // continuous rotational drift (higher = more visible curl)
const BURST_START = 0.1; // scroll progress at which particles start flying out
const BURST_END = 0.65; // progress at which the outward spread is complete
// White core, deep blue, purple/magenta, and a warm gold that ties to the
// "ai" accent in the title.
const COLORS: Array<[number, number, number]> = [
  [255, 255, 255],
  [120, 150, 255],
  [200, 90, 255],
  [255, 210, 140],
];
// ----------------------------------------------------------------------------

interface Particle {
  angle: number;
  dist: number; // per-particle reach factor (0–1)
  size: number;
  color: number;
  twinkle: number;
}

export function BigBangCanvas({ progress }: { progress: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(progress);

  // The animation loop is intentionally created once; keep its input current
  // after React commits rather than mutating a ref while rendering.
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2); // cap DPR for perf
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    // Pre-render one soft radial glow sprite per color, once.
    const sprites = COLORS.map(([r, g, b]) => {
      const s = 32;
      const off = document.createElement("canvas");
      off.width = off.height = s;
      const octx = off.getContext("2d")!;
      const grad = octx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},0.5)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      octx.fillStyle = grad;
      octx.fillRect(0, 0, s, s);
      return off;
    });

    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        dist: 0.15 + Math.random() * 0.85,
        size: 1 + Math.random() * 2.5,
        color: Math.floor(Math.random() * COLORS.length),
        twinkle: Math.random() * Math.PI * 2,
      });
    }

    let raf = 0;
    let last = performance.now();

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = progressRef.current;

      // burst scrubs 0→1 across the scroll range, driving how far particles fly.
      const burst = Math.min(1, Math.max(0, (p - BURST_START) / (BURST_END - BURST_START)));
      // whole field fades in just as the bang begins.
      const fieldAlpha = Math.min(1, Math.max(0, (p - (BURST_START - 0.02)) / 0.12));
      const maxR = Math.hypot(width, height) * MAX_RADIUS_FACTOR;
      const cx = width / 2;
      const cy = height / 2;

      ctx!.clearRect(0, 0, width, height);

      // Intense central singularity — brightest at the instant of the bang,
      // fading as the particles carry the light outward.
      const flash = Math.max(0, 1 - burst * 2) * fieldAlpha;
      if (flash > 0.01) {
        const fg = ctx!.createRadialGradient(cx, cy, 0, cx, cy, 200);
        fg.addColorStop(0, `rgba(255,255,255,${flash})`);
        fg.addColorStop(0.35, `rgba(220,220,255,${flash * 0.5})`);
        fg.addColorStop(1, "rgba(255,255,255,0)");
        ctx!.fillStyle = fg;
        ctx!.fillRect(0, 0, width, height);
      }

      for (let i = 0; i < particles.length; i++) {
        const pt = particles[i];
        pt.angle += SWIRL * dt * (0.5 + pt.dist); // outer dust swirls a touch faster
        pt.twinkle += dt * 3;

        const r = burst * maxR * pt.dist;
        const x = cx + Math.cos(pt.angle) * r;
        const y = cy + Math.sin(pt.angle) * r;

        // Fade particles gently as they pass beyond the screen edges.
        const edgeFade = 1 - Math.min(1, Math.max(0, (r - maxR * 0.6) / (maxR * 0.4)));
        const tw = 0.6 + 0.4 * Math.sin(pt.twinkle);
        const alpha = fieldAlpha * edgeFade * tw;
        if (alpha <= 0.01) continue;

        const spr = sprites[pt.color];
        const sz = pt.size * 7;
        ctx!.globalAlpha = alpha;
        ctx!.drawImage(spr, x - sz / 2, y - sz / 2, sz, sz);
      }
      ctx!.globalAlpha = 1;

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
