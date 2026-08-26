import path from "node:path";
import type { NextConfig } from "next";

const appRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep tracing and Turbopack scoped to this deployable app. The repository
  // contains a separate Next.js workspace at its root, whose middleware must
  // never be pulled into the product-experience Vercel build.
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
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
