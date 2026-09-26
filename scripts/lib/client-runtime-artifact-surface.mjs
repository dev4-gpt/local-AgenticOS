export const clientRuntimePageRoutes = [
  "/", "/provider-catalog", "/credits", "/context", "/orchestrate", "/create", "/credentials", "/provider-matrix", "/capabilities", "/deliver",
  "/paperclip", "/room", "/pipeline", "/claude", "/openclaw", "/hermes", "/antigravity", "/codex",
  "/kimi", "/glm", "/glm-code", "/grok", "/freeclaude", "/fusion", "/sakana", "/local", "/engine",
  "/agent-kanban", "/loop", "/ruflo", "/goals", "/journal", "/seo", "/opendesign", "/web-studio",
  "/flow-lab", "/integrations", "/video", "/studio", "/openmontage", "/music", "/games", "/thumbnails",
  "/notebook", "/kanban", "/memory", "/leads", "/radar", "/guide", "/seo-guide", "/hybrid",
];

const systemRoutes = ["/_not-found", "/_global-error", "/favicon.ico", "/healthz", "/status", "/login", "/auth/callback", "/client-unavailable"];
const clientApiPrefixes = ["/api/capabilities", "/api/speech/transcribe", "/api/client-runtime", "/api/internal/client-runtime", "/api/client-auth"];

export function clientRuntimeArtifactRouteAllowed(pathname) {
  if (systemRoutes.includes(pathname)) return true;
  const allowed = pathname.startsWith("/api/") ? clientApiPrefixes : clientRuntimePageRoutes;
  return allowed.some((route) => route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`));
}
