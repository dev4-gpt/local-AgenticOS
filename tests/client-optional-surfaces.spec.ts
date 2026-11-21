import { expect, test } from "@playwright/test";
// @ts-expect-error plain ESM script, no type declarations
import { OPTIONAL_CLIENT_SURFACES, resolveOptionalSurfaces } from "../scripts/lib/client-optional-surfaces.mjs";

test("no surfaces requested adds no routes", () => {
  expect(resolveOptionalSurfaces(undefined)).toEqual({ pages: [], apiRoutes: [] });
  expect(resolveOptionalSurfaces([])).toEqual({ pages: [], apiRoutes: [] });
});

test("the adapters surface adds the page and exactly the APIs its pages call", () => {
  const surface = resolveOptionalSurfaces(["adapters"]);
  expect(surface.pages).toEqual(["/adapters"]);
  expect(surface.apiRoutes).toEqual([
    "/api/client-runtime/adapters",
    "/api/client-runtime/adapter-activity",
    "/api/client-runtime/adapter-spend",
    "/api/client-runtime/adapter-sync-switch",
    "/api/client-runtime/adapter-approvals",
    "/api/client-runtime/adapter-promotions",
    "/api/client-runtime/adapter-memory",
  ]);
});

test("the host-internal adapter task route is never exposed to a client", () => {
  const all = resolveOptionalSurfaces(Object.keys(OPTIONAL_CLIENT_SURFACES));
  expect(all.apiRoutes).not.toContain("/api/client-runtime/adapter-tasks");
  expect(all.apiRoutes.some((route: string) => route.startsWith("/api/adapter-host"))).toBe(false);
});

test("an unknown surface name fails instead of being ignored", () => {
  expect(() => resolveOptionalSurfaces(["adapters", "operator-research"])).toThrow(/operator-research/);
});

test("a bare string is rejected and a duplicate collapses", () => {
  expect(() => resolveOptionalSurfaces("adapters")).toThrow(/array/);
  expect(resolveOptionalSurfaces(["adapters", "adapters"]).pages).toEqual(["/adapters"]);
});
