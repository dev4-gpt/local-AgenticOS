import path from "node:path";
import type { NextConfig } from "next";

const appRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Vercel otherwise injects the repository root as the tracing root for this
  // nested project. Keep it identical to turbopack.root so the root Next.js
  // application's middleware can never enter this build.
  outputFileTracingRoot: appRoot,
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
  output: "standalone",
  // This repository contains a second Next.js app at its root. Pin
  // Turbopack to the product app so discovery cannot pull in root middleware.
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
