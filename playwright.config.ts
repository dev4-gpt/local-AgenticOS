import { defineConfig } from "@playwright/test";

/**
 * There was no Playwright config at all until now, which is why nineteen tests
 * failed. Without a `webServer`, every spec that calls `page.goto` was pointed
 * at a port nobody had started, and ten of them failed with a bare
 * ERR_CONNECTION_REFUSED that read like a product failure.
 *
 * It also meant `verify:product` and `verify:v1` -- the project's own declared
 * gates -- were structurally incapable of passing from a cold machine: they run
 * `next build` and then immediately run specs against a server the build never
 * starts.
 *
 * Each spec sets its own `baseURL` via `test.use()`, so this file deliberately
 * does not set a global one. It only guarantees the servers those specs assume
 * are actually running.
 */
export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  reporter: "line",
  // Most specs are pure unit assertions over src/lib and never touch a browser;
  // only the four page-driven specs need the servers below.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { trace: "retain-on-failure" },

  webServer: [
    {
      // tests/sidebar-smoke.spec.ts and tests/visual-shell.spec.ts pin 3737,
      // which is the v0 dist lane (VELOCE_DIST_DIR=.next-v0), not the 3939
      // workspace port.
      command: "npm run dev:v0",
      url: "http://127.0.0.1:3737",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // tests/product-experience.spec.ts, PRODUCT_EXPERIENCE_URL || :3565
      command: "npm --prefix product-experience run dev",
      url: "http://127.0.0.1:3565",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // tests/public-edition.spec.ts expects PUBLIC_SITE_URL || :4175, but
      // public-site's dev script pins 4321 and its preview script sets no port
      // at all (Vite would default to 4173). So 4175 matched nothing in the
      // repo and those four tests could never have passed. The port is forced
      // here, with --strictPort so a silent fallback fails loudly instead.
      command: "npm --prefix public-site run dev -- --port 4175 --strictPort",
      url: "http://127.0.0.1:4175",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
