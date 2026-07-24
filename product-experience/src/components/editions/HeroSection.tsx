"use client";

import Image from "next/image";
import { BigBangCanvas } from "./BigBangCanvas";
import { DavinciLines } from "./DavinciLines";
import { useMouseParallax } from "./useMouseParallax";
import { useScrollProgress } from "./useScrollProgress";

const HOLD_END = 0.15;
const EXPLOSION_END = 0.6;
const BANG_START = 0.1;
const BANG_END = 0.65;

export function HeroSection() {
  const { ref: wrapperRef, progress } = useScrollProgress<HTMLElement>();
  const { ref: parallaxRef, offset } = useMouseParallax<HTMLDivElement>();

  const explosionT = Math.min(1, Math.max(0, (progress - HOLD_END) / (EXPLOSION_END - HOLD_END)));
  const linesScale = 1 + explosionT * 3;
  const titleScale = 1 + explosionT * 1.5;
  const titleOpacity = 1 - explosionT;
  // Construction lines dissolve as the big bang takes over, so the exploding
  // universe is the clean focus of the reveal rather than competing with the
  // geometric diagram.
  const linesOpacity = 1 - explosionT;

  // Real NASA nebula (the Helix, public domain — see public/images/editions/
  // space/CREDIT.txt) inflates from a point at the singularity out past the
  // screen edges as the user scrolls: real cosmic texture behind the particle
  // burst, so the "big bang" reads as an actual forming universe rather than
  // generic dots. Bang progress matches BigBangCanvas's own particle spread.
  const bang = Math.min(1, Math.max(0, (progress - BANG_START) / (BANG_END - BANG_START)));
  const nebulaScale = 0.06 + bang * 1.6; // tiny point -> overflows the viewport
  const nebulaOpacity = Math.min(1, Math.max(0, (progress - BANG_START) / 0.18));

  return (
    <section ref={wrapperRef} id="hero" className="relative h-[320vh]">
      <div
        ref={parallaxRef}
        className="theme-dark-region sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden bg-black text-white"
      >
        {/* Real nebula inflating from the singularity — the cosmic substance
            behind the particle burst. Centered square that scales from a point
            out past the viewport edges as the bang progresses. */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[130vmax]"
          style={{
            opacity: nebulaOpacity,
            transform: `translate(calc(-50% + ${offset.x * 8}px), calc(-50% + ${offset.y * 8}px)) scale(${nebulaScale})`,
          }}
        >
          <Image
            src="/images/editions/space/helix-nebula.jpg"
            alt=""
            fill
            sizes="130vmax"
            className="object-cover"
            priority
            unoptimized
          />
        </div>

        {/* Scroll-driven big-bang particle burst — glowing dust motion layered
            over the real nebula. Replaces what used to be a painting reveal
            here; the Sidekick painting now appears fresh for the first time in
            Sidekick's own ChapterIntro right after the hero, not twice. */}
        <BigBangCanvas progress={progress} />

        <div
          className="absolute inset-0 transition-transform duration-100 ease-out"
          style={{
            opacity: linesOpacity,
            transform: `scale(${linesScale}) translate(${offset.x * 14}px, ${offset.y * 14}px)`,
          }}
        >
          <DavinciLines stage={1} />
        </div>

        <div
          className="relative z-10 flex h-[560px] w-[380px] max-w-[85vw] flex-col items-start justify-center px-10 transition-transform duration-100 ease-out"
          style={{
            opacity: titleOpacity,
            transform: `scale(${titleScale}) translate(${offset.x * -28}px, ${offset.y * -28}px)`,
          }}
        >
          <h1 className="font-display text-[56px] leading-[0.95] italic sm:text-[72px]">
            Ren
            <span className="not-italic font-mono font-bold" style={{ color: "#e0b53c" }}>
              ai
            </span>
            ssance
          </h1>
          <p className="font-display mt-4 text-[28px] italic leading-[1] text-white/85 sm:text-[36px]">
            Veloce Agentic
            <span className="not-italic font-mono font-bold" style={{ color: "#e0b53c" }}>
              OS
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
