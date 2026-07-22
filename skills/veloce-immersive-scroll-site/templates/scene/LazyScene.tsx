"use client";

import dynamic from "next/dynamic";
import StaticFallback from "./StaticFallback";

/** Lazy-loads the WebGL scene bundle so it never blocks first paint or the reduced-motion/no-WebGL path. */
const SceneCanvas = dynamic(() => import("./SceneCanvas"), {
  ssr: false,
  loading: () => <StaticFallback />,
});

export default SceneCanvas;
