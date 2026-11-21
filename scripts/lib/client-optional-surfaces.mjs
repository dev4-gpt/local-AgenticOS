// Client pages that are off by default and switched on per client in the blueprint:
//   "optionalSurfaces": ["adapters"]
// Each surface lists the pages and the browser-facing API routes it needs, and nothing else.
// Host-internal routes (adapter tasks, /api/adapter-host) are never listed here.
export const OPTIONAL_CLIENT_SURFACES = Object.freeze({
  adapters: Object.freeze({
    pages: Object.freeze(["/adapters"]),
    apiRoutes: Object.freeze([
      "/api/client-runtime/adapters",
      "/api/client-runtime/adapter-activity",
      "/api/client-runtime/adapter-spend",
      "/api/client-runtime/adapter-sync-switch",
      "/api/client-runtime/adapter-approvals",
      "/api/client-runtime/adapter-promotions",
      "/api/client-runtime/adapter-memory",
    ]),
  }),
});

// Pure: turns the blueprint's optionalSurfaces value into the extra routes. An unknown name is an error.
export function resolveOptionalSurfaces(requested) {
  if (requested === undefined || requested === null) return { pages: [], apiRoutes: [] };
  if (!Array.isArray(requested)) throw new Error("optionalSurfaces must be an array of surface names");
  const names = [...new Set(requested.map((name) => String(name).trim()).filter(Boolean))];
  const unknown = names.filter((name) => !Object.hasOwn(OPTIONAL_CLIENT_SURFACES, name));
  if (unknown.length > 0) {
    throw new Error(`optionalSurfaces has unknown surface(s): ${unknown.join(", ")}. Known: ${Object.keys(OPTIONAL_CLIENT_SURFACES).join(", ")}`);
  }
  return {
    pages: names.flatMap((name) => OPTIONAL_CLIENT_SURFACES[name].pages),
    apiRoutes: names.flatMap((name) => OPTIONAL_CLIENT_SURFACES[name].apiRoutes),
  };
}
