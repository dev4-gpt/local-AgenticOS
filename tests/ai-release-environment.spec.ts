import { expect, test } from "@playwright/test";
import { offlineTestEnvironment } from "../scripts/lib/offline-test-environment.mjs";

test("offline AI evaluation child process receives no inherited credential variables", () => {
  const environment = offlineTestEnvironment({
    PATH: "/test/bin",
    HOME: "/test/home",
    TMPDIR: "/test/tmp",
    LANG: "en_US.UTF-8",
    CI: "0",
    NODE_ENV: "production",
    SUPABASE_SERVICE_ROLE_KEY: "database-secret",
    STRIPE_SECRET_KEY: "billing-secret",
    GROQ_API_KEY: "provider-secret",
    FUTURE_PROVIDER_API_KEY: "future-secret",
  }, "/fallback/home");

  expect(environment).toEqual({
    PATH: "/test/bin",
    HOME: "/test/home",
    TMPDIR: "/test/tmp",
    LANG: "en_US.UTF-8",
    CI: "1",
    NODE_ENV: "test",
  });
});
