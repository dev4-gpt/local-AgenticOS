import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
  // A separate local build directory lets the preserved V0 server run beside
  // the active operator workspace without either dev server taking the other
  // process's Next lock.
  distDir: process.env.VELOCE_DIST_DIR || ".next",
  output: process.env.VELOCE_CONTAINER_BUILD === "1" ? "standalone" : undefined,
};

export default nextConfig;
