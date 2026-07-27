const DEFAULT_CLIENT_ROUTES = [
  "/", "/context", "/orchestrate", "/create", "/credentials", "/capabilities", "/deliver",
  "/paperclip", "/room", "/pipeline", "/claude", "/openclaw", "/hermes", "/antigravity", "/codex",
  "/kimi", "/glm", "/glm-code", "/grok", "/freeclaude", "/fusion", "/sakana", "/local", "/engine",
  "/agent-kanban", "/loop", "/ruflo", "/goals", "/journal", "/seo", "/opendesign", "/web-studio",
  "/flow-lab", "/integrations", "/video", "/studio", "/openmontage", "/music", "/games", "/thumbnails",
  "/notebook", "/kanban", "/memory", "/leads", "/radar", "/guide",
];
const DEFAULT_CLIENT_API_ROUTES = [
  "/api/capabilities",
  "/api/client-runtime/credentials",
  "/api/client-runtime/credential-submissions",
  "/api/client-runtime/requests",
  "/api/client-runtime/artifacts",
  "/api/client-runtime/provider-chat",
  "/api/client-runtime/jobs",
  "/api/internal/client-runtime/jobs",
  "/api/client-auth/session",
];

function configuredList(name: string, fallback: string[]) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

export function clientConfiguredList(name: string) {
  return configuredList(name, []);
}

export function clientCapabilityEnabled(id: string) {
  const configured = clientConfiguredList("CLIENT_ENABLED_CAPABILITIES");
  return configured.length === 0 || configured.includes(id);
}

export function clientProviderEnabled(key: string) {
  const configured = clientConfiguredList("CLIENT_PROVIDER_ALLOWLIST");
  return configured.length === 0 || configured.includes(key);
}

export function clientProviderCallsEnabled() {
  return process.env.CLIENT_PROVIDER_CALLS_ENABLED === "1";
}

export function clientAuthEnforced() {
  return process.env.CLIENT_RUNTIME_ENFORCE_AUTH === "1";
}

export function clientRouteAllowed(pathname: string) {
  const routes = configuredList("CLIENT_ALLOWED_ROUTES", DEFAULT_CLIENT_ROUTES);
  return routes.some((route) => route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`));
}

export function clientApiRouteAllowed(pathname: string) {
  const routes = configuredList("CLIENT_ALLOWED_API_ROUTES", DEFAULT_CLIENT_API_ROUTES);
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export const clientRouteDefaults = DEFAULT_CLIENT_ROUTES;
export const clientApiRouteDefaults = DEFAULT_CLIENT_API_ROUTES;
