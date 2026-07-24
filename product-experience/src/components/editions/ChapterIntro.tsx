"use client";

import Image from "next/image";
import type { Chapter } from "@/types/editions";
import { paintingFor } from "@/data/paintings";
import { cn } from "@/lib/utils";
import { useMouseParallax } from "./useMouseParallax";
import { useScrollProgress } from "./useScrollProgress";
import { SEAM_PAINTING_OPACITY, SEAM_PAINTING_SCALE } from "./seam";

/**
 * Pinned, full-viewport chapter-opening moment: a painting background stays
 * sticky while the chapter title and a couple of floating product cards
 * animate in as the user scrolls through a tall wrapper region, then the
 * whole thing fades/scales out to release into the normal feature grid.
 * Mirrors the live site's per-chapter Three.js title-card sequence (see
 * docs/research/www.shopify.com/BEHAVIORS.md) using CSS/JS instead of WebGL.
 */
export function ChapterIntro({ chapter }: { chapter: Chapter }) {
  const { ref: wrapperRef, progress } = useScrollProgress<HTMLDivElement>();
  const { ref: parallaxRef, offset } = useMouseParallax<HTMLDivElement>();
  const painting = paintingFor(chapter.slug);
  const floatingCards = chapter.items.filter((i) => i.imgSrc).slice(0, 3);

  // Title/cards fade+rise in over the first 35%, hold, then the whole panel
  // fades+scales out over the final 25% to release into the grid below.
  const enter = Math.min(1, progress / 0.35);
  const exit = Math.max(0, (progress - 0.75) / 0.25);

  return (
    <div ref={wrapperRef} className="relative h-[220vh]">
      <div
        ref={parallaxRef}
        className="theme-dark-region sticky top-0 h-screen w-full overflow-hidden bg-black text-white"
      >
        <div className="absolute inset-0">
          <Image
            src={painting.localPath}
            alt={`${painting.title} by ${painting.artist}`}
            fill
            sizes="100vw"
            className="object-cover transition-transform duration-100 ease-out"
            style={{
              // Rest state (progress=0, exit=0) is the shared seam value, so
              // the hero's reveal hands off into this with no jump — see seam.ts.
              opacity: SEAM_PAINTING_OPACITY * (1 - exit),
              transform: `scale(${SEAM_PAINTING_SCALE + progress * 0.08}) translate(${offset.x * 10}px, ${offset.y * 10}px)`,
            }}
            priority
            unoptimized
          />
        </div>
        {/* bg-black/45 == SEAM_SCRIM_OPACITY; the hero ramps a matching scrim
            up to this value so painting brightness lines up at the seam. */}
        <div className="absolute inset-0 bg-black/45" style={{ opacity: 1 - exit }} />

        <div
          className="relative z-10 flex h-full flex-col items-start justify-center px-8 transition-transform duration-100 ease-out lg:px-24"
          style={{
            opacity: (0.2 + enter * 0.8) * (1 - exit),
            transform: `translate(${offset.x * -16}px, ${(1 - enter) * 24 + offset.y * -16}px)`,
          }}
        >
          <span className="font-display mb-4 text-sm italic text-white/70">{chapter.roman}</span>
          <h2 className="font-heading text-[15vw] font-bold leading-[0.9] lg:text-[9vw]">
            {chapter.title}
          </h2>
        </div>

        {floatingCards.map((item, i) => {
          const positions = [
            { top: "18%", left: "62%", rotate: -6 },
            { top: "55%", left: "72%", rotate: 4 },
            { top: "70%", left: "50%", rotate: -3 },
          ];
          const pos = positions[i] ?? positions[0];
          const cardProgress = Math.min(1, Math.max(0, (progress - i * 0.1) / 0.4));
          const depth = 24 + i * 10;
          return (
            <div
              key={i}
              className={cn(
                "absolute z-10 hidden w-40 overflow-hidden rounded-lg shadow-2xl transition-transform duration-100 ease-out lg:block"
              )}
              style={{
                top: pos.top,
                left: pos.left,
                opacity: cardProgress * (1 - exit),
                transform: `translate(${offset.x * -depth}px, ${(1 - cardProgress) * 60 + offset.y * -depth}px) rotate(${pos.rotate}deg)`,
              }}
            >
              {item.imgSrc && (
                <Image
                  src={item.imgSrc}
                  alt={item.eyebrow ?? ""}
                  width={200}
                  height={150}
                  className="w-full"
                  unoptimized
                />
              )}
            </div>
          );
        })}

        <p
          className="absolute bottom-6 right-6 z-10 text-[10px] text-white/40"
          style={{ opacity: 1 - exit }}
        >
          {painting.title}, {painting.artist} — public domain, The Met
        </p>
      </div>
    </div>
  );
}
