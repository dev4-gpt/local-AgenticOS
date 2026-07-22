"use client";

import { useEffect, useRef, useState } from "react";

export interface ScrollFrameSequenceProps {
  frameCount: number;
  src: (index: number) => string;
  alt: string;
  poster?: string;
  scrollScreens?: number;
  fit?: "contain" | "cover";
  className?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function ScrollFrameSequence({
  frameCount,
  src,
  alt,
  poster,
  scrollScreens = 4,
  fit = "contain",
  className = "",
}: ScrollFrameSequenceProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef(new Map<number, HTMLImageElement>());
  const currentRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas || frameCount < 2) return;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) { setFailed(true); return; }

    const cache = cacheRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;

    const nearestLoaded = (index: number) => {
      for (let offset = 0; offset < frameCount; offset += 1) {
        for (const candidate of [index - offset, index + offset]) {
          const image = cache.get(candidate);
          if (image?.complete && image.naturalWidth > 0) return image;
        }
      }
      return undefined;
    };

    function draw(index: number) {
      const image = nearestLoaded(index);
      if (!image) return;
      const canvasRatio = canvas.width / canvas.height;
      const imageRatio = image.naturalWidth / image.naturalHeight;
      const contain = fit === "contain";
      const width = (contain ? imageRatio > canvasRatio : imageRatio < canvasRatio)
        ? canvas.width
        : canvas.height * imageRatio;
      const height = width / imageRatio;
      context.fillStyle = "#08070b";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }

    const load = (index: number) => {
      const safeIndex = clamp(index, 0, frameCount - 1);
      const existing = cache.get(safeIndex);
      if (existing) return;
      const image = new Image();
      image.decoding = "async";
      image.src = src(safeIndex);
      image.onload = () => {
        if (disposed) return;
        if (safeIndex === 0) setReady(true);
        if (safeIndex === currentRef.current) draw(safeIndex);
      };
      image.onerror = () => { if (!disposed && safeIndex === 0) setFailed(true); };
      cache.set(safeIndex, image);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const mobile = window.innerWidth < 768;
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      draw(currentRef.current);
    };

    const primeWindow = (index: number) => {
      load(0);
      load(frameCount - 1);
      for (let offset = -2; offset <= 7; offset += 1) load(index + offset);
    };

    const update = () => {
      animationRef.current = null;
      if (reduced) { currentRef.current = 0; primeWindow(0); draw(0); return; }
      const rect = section.getBoundingClientRect();
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = clamp(-rect.top / travel, 0, 1);
      const index = Math.round(progress * (frameCount - 1));
      if (index !== currentRef.current) {
        currentRef.current = index;
        primeWindow(index);
        draw(index);
      }
    };

    const requestUpdate = () => {
      if (animationRef.current !== null) return;
      animationRef.current = window.requestAnimationFrame(update);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    primeWindow(0);
    resize();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });

    return () => {
      disposed = true;
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      cache.clear();
    };
  }, [fit, frameCount, src]);

  return (
    <section
      ref={sectionRef}
      className={className}
      style={{ position: "relative", minHeight: `${clamp(scrollScreens, 2, 8) * 100}vh` }}
      aria-label={alt}
    >
      <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>
        {poster && <img src={poster} alt="" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit }} />}
        <canvas ref={canvasRef} aria-hidden="true" style={{ position: "relative", display: "block", width: "100%", height: "100%", opacity: ready && !failed ? 1 : 0 }} />
        {!ready && !failed && <span role="status" style={{ position: "absolute", left: 16, bottom: 16 }}>Loading visual sequence...</span>}
        {failed && <span role="status" style={{ position: "absolute", left: 16, bottom: 16 }}>The motion preview is unavailable. The page content remains accessible.</span>}
      </div>
    </section>
  );
}
