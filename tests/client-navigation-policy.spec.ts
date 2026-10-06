import { expect, test } from "@playwright/test";
import { clientAllowedRoutes, clientRouteAllowed } from "../src/lib/clientRuntimePolicy";

const originalRoutes = process.env.CLIENT_ALLOWED_ROUTES;

test.afterEach(() => {
  if (originalRoutes === undefined) delete process.env.CLIENT_ALLOWED_ROUTES;
  else process.env.CLIENT_ALLOWED_ROUTES = originalRoutes;
});

test("default client navigation excludes operator-only research", () => {
  delete process.env.CLIENT_ALLOWED_ROUTES;
  expect(clientAllowedRoutes()).toContain("/memory");
  expect(clientAllowedRoutes()).not.toContain("/classroom-research");
  expect(clientRouteAllowed("/classroom-research")).toBe(false);
});

test("runtime route overrides drive both navigation and middleware", () => {
  process.env.CLIENT_ALLOWED_ROUTES = "/,/context,/classroom-research";
  expect(clientAllowedRoutes()).toEqual(["/", "/context", "/classroom-research"]);
  expect(clientRouteAllowed("/classroom-research")).toBe(true);
  expect(clientRouteAllowed("/memory")).toBe(false);
});
