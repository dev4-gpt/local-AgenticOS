import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".next-client/**",
    ".next-client-test/**",
    ".next-client-e2e/**",
    ".next-v0/**",
    "out/**",
    "build/**",
    "public-site/.next/**",
    "product-experience/.next/**",
    "public-site/dist/**",
    "test-results/**",
    "tmp/**",
    "next-env.d.ts",
  ]),
]);
