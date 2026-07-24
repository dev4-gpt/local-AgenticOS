"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Golden-ratio / Vitruvian construction-line diagram from the hero.
 * Markup is copied verbatim from the live site (docs/research/www.shopify.com/hero-davinci-lines.svg).
 * Lines belong to reveal "stages" via data-group; the visible stage advances
 * as the user scrolls past the first few chapter boundaries.
 */
export function DavinciLines({ stage }: { stage: number }) {
  const [drawn, setDrawn] = useState(false);
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="550 208 340 464"
      className="davinci-lines pointer-events-none absolute inset-0 h-full w-full overflow-visible text-white/25"
      aria-hidden="true"
      data-active={stage}
    >
      <rect
        x="550"
        y="208"
        width="340"
        height="464"
        className="stroke-current stroke-1"
        style={{
          strokeDasharray: 1,
          strokeDashoffset: drawn ? 0 : 1,
          transition: "stroke-dashoffset 1.2s ease",
        }}
        pathLength={1}
        strokeLinecap="square"
      />
      {LINES.map((line) => {
        const visible = line.group.length === 0 || line.group.includes(stage);
        const common = {
          pathLength: 1,
          style: {
            opacity: visible ? 1 : 0,
            transition: "opacity 600ms ease",
          },
        };
        if (line.type === "path") {
          return <path key={line.id} d={line.d} {...common} />;
        }
        return (
          <circle
            key={line.id}
            cx={line.cx}
            cy={line.cy}
            r={line.r}
            fill="none"
            className={line.rotate}
            {...common}
          />
        );
      })}
    </svg>
  );
}

type LineDef =
  | { id: string; type: "path"; d: string; group: number[] }
  | { id: string; type: "circle"; cx: number; cy: number; r: number; group: number[]; rotate?: string };

const LINES: LineDef[] = [
  { id: "centered-horizontal", type: "path", d: "M-1840 440h5120", group: [1, 3, 5] },
  { id: "golden-top-horizontal-left", type: "path", d: "M-1840 336.13h2390.03", group: [1, 2, 3, 4, 5, 6, 7, 8] },
  { id: "golden-lower-horizontal-right", type: "path", d: "M889.97 543.87h2390.03", group: [1, 2, 3, 5, 6, 7, 8] },
  { id: "golden-bottom-horizontal-left", type: "path", d: "M-1840 543.87h2390.03", group: [] },
  { id: "centered-vertical", type: "path", d: "M720 -1000v2880", group: [1, 2, 3, 4, 5, 6, 7, 8] },
  { id: "golden-left-vertical", type: "path", d: "M550.03 -1000v2880", group: [1, 2, 3, 4, 5, 6, 7, 8] },
  { id: "golden-right-vertical", type: "path", d: "M889.97 -1000v2880", group: [1, 2, 3, 4, 5, 6, 7, 8] },
  { id: "diagonal-tl-br", type: "path", d: "M-1636.36,-1000L3076.36,1880", group: [1, 3, 4, 5, 6, 7, 8] },
  { id: "diagonal-tr-bl", type: "path", d: "M3076.36,-1000L-1636.36,1880", group: [1, 3, 4, 5, 6, 7, 8] },
  { id: "diagonal-gl-bl", type: "path", d: "M1175.07,-1000L-625.04,1880", group: [1] },
  { id: "diagonal-gr-br", type: "path", d: "M-1011.33,-1000L1901.30,1880", group: [] },
  { id: "diagonal-gr-tr", type: "path", d: "M2065.04,-1000L264.93,1880", group: [1, 3] },
  { id: "diagonal-gl-tl", type: "path", d: "M-625.04,-1000L1175.07,1880", group: [2, 3] },
  { id: "spiral-tl-v1", type: "path", d: "M339.94 -1000v1336.13", group: [1, 2, 3, 6, 7] },
  { id: "spiral-tl-h1", type: "path", d: "M339.94 207.74h210.09", group: [1, 2, 3, 6, 7] },
  { id: "spiral-tl-v2", type: "path", d: "M420.19 207.74v128.39", group: [1, 3, 6, 7] },
  { id: "spiral-tl-h2", type: "path", d: "M339.94 256.78h80.25", group: [1, 3, 6, 7] },
  { id: "spiral-tl-v3", type: "path", d: "M389.53 256.78v-49.04", group: [1, 3, 6, 7] },
  { id: "spiral-tl-h3", type: "path", d: "M389.53 238.05h30.65", group: [1, 3, 6, 7] },
  { id: "spiral-br-v1", type: "path", d: "M1100.06 543.87v1336.13", group: [1, 2, 3, 6, 7] },
  { id: "spiral-br-h1", type: "path", d: "M889.97 672.26h210.09", group: [1, 2, 3, 6, 7] },
  { id: "spiral-br-v2", type: "path", d: "M1019.81 672.26v-128.39", group: [1, 2, 3, 6, 7] },
  { id: "spiral-br-h2", type: "path", d: "M1019.81 623.22h80.25", group: [1, 2, 3, 6, 7] },
  { id: "spiral-br-v3", type: "path", d: "M1050.47 623.22v49.04", group: [1, 2, 3, 6, 7] },
  { id: "spiral-br-h3", type: "path", d: "M1050.47 641.95h-30.65", group: [1, 2, 3, 6, 7] },
  { id: "circle-bottom-arc", type: "circle", cx: 550, cy: 886, r: 550, group: [2, 4], rotate: "rotate-45" },
  { id: "circle-right-arc", type: "circle", cx: 1439.97, cy: 543.87, r: 550, group: [2, 4] },
  { id: "circle-center-small-top", type: "circle", cx: 720, cy: 15, r: 425, group: [5, 7, 8], rotate: "-rotate-45" },
  { id: "circle-center-small-bottom", type: "circle", cx: 720, cy: 865, r: 425, group: [5, 7, 8], rotate: "rotate-45" },
];
