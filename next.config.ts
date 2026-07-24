import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A separate local build directory lets the preserved V0 server run beside
  // the active operator workspace without either dev server taking the other
  // process's Next lock.
  distDir: process.env.VELOCE_DIST_DIR || ".next",
};

export default nextConfig;
