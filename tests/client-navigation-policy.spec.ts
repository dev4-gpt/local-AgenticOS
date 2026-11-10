import { expect, test } from "@playwright/test";
import { clientAllowedRoutes, clientApiRouteAllowed, clientNavigationRoutes, clientRouteAllowed, clientRouteIsOperatorOnly } from "../src/lib/clientRuntimePolicy";

const originalRoutes = process.env.CLIENT_ALLOWED_ROUTES;
const originalApiRoutes = process.env.CLIENT_ALLOWED_API_ROUTES;

test.afterEach(() => {
  if (originalRoutes === undefined) delete process.env.CLIENT_ALLOWED_ROUTES;
  else process.env.CLIENT_ALLOWED_ROUTES = originalRoutes;
  if (originalApiRoutes === undefined) delete process.env.CLIENT_ALLOWED_API_ROUTES;
  else process.env.CLIENT_ALLOWED_API_ROUTES = originalApiRoutes;
});

test("default client navigation excludes operator-only research", () => {
  delete process.env.CLIENT_ALLOWED_ROUTES;
  expect(clientAllowedRoutes()).toContain("/memory");
  expect(clientAllowedRoutes()).not.toContain("/classroom-research");
  expect(clientRouteAllowed("/classroom-research")).toBe(false);
});

test("runtime route overrides drive both navigation and middleware", () => {
  process.env.CLIENT_ALLOWED_ROUTES = "/,/context,/memory";
  expect(clientAllowedRoutes()).toEqual(["/", "/context", "/memory"]);
  expect(clientRouteAllowed("/memory")).toBe(true);
  expect(clientRouteAllowed("/journal")).toBe(false);
});

test("source-import parent route covers the upload subroute by prefix", () => {
  delete process.env.CLIENT_ALLOWED_API_ROUTES;
  expect(clientApiRouteAllowed("/api/client-runtime/source-import/upload")).toBe(true);

  process.env.CLIENT_ALLOWED_API_ROUTES = "/api/client-runtime/source-import,/api/client-runtime/build-identity";
  expect(clientApiRouteAllowed("/api/client-runtime/source-import/upload")).toBe(true);

  process.env.CLIENT_ALLOWED_API_ROUTES = "/api/client-runtime/build-identity";
  expect(clientApiRouteAllowed("/api/client-runtime/source-import/upload")).toBe(false);
});

test("operator-only research routes stay unavailable even if a manifest lists them", () => {
  process.env.CLIENT_ALLOWED_ROUTES = "/,/context,/classroom-research,/classroom-research/archive,/social-research,/memory";

  expect(clientAllowedRoutes()).toEqual(["/", "/context", "/memory"]);
  expect(clientRouteIsOperatorOnly("/classroom-research")).toBe(true);
  expect(clientRouteIsOperatorOnly("/classroom-research/archive")).toBe(true);
  expect(clientRouteIsOperatorOnly("/social-research/results")).toBe(true);
  expect(clientRouteIsOperatorOnly("/memory")).toBe(false);
  expect(clientNavigationRoutes(
    ["/", "/classroom-research", "/classroom-research/archive", "/social-research", "/memory"],
    ["/", "/classroom-research", "/classroom-research/archive", "/social-research", "/memory"],
  )).toEqual(["/", "/memory"]);
  expect(clientRouteAllowed("/classroom-research")).toBe(false);
  expect(clientRouteAllowed("/classroom-research/archive")).toBe(false);
  expect(clientRouteAllowed("/social-research/results")).toBe(false);
});
