const DEFAULT_CLIENT_ROUTES = [
  "/", "/provider-catalog", "/credits", "/context", "/orchestrate", "/create", "/credentials", "/provider-matrix", "/capabilities", "/deliver",
  "/paperclip", "/room", "/pipeline", "/claude", "/openclaw", "/hermes", "/antigravity", "/codex",
  "/kimi", "/glm", "/glm-code", "/grok", "/freeclaude", "/fusion", "/sakana", "/local", "/engine",
  "/agent-kanban", "/loop", "/ruflo", "/goals", "/journal", "/seo", "/opendesign", "/web-studio",
  "/flow-lab", "/integrations", "/video", "/studio", "/openmontage", "/music", "/games", "/thumbnails",
  "/notebook", "/kanban", "/memory", "/leads", "/radar", "/guide", "/seo-guide", "/hybrid",
];
const DEFAULT_CLIENT_API_ROUTES = [
  "/api/capabilities",
  "/api/speech/transcribe",
  "/api/client-runtime/credentials",
  "/api/client-runtime/credits",
  "/api/client-runtime/credits/checkout",
  "/api/client-runtime/manifest-proposals",
  "/api/client-runtime/credential-submissions",
  "/api/client-runtime/requests",
  "/api/client-runtime/artifacts",
  "/api/client-runtime/visual-qa",
  "/api/client-runtime/hosted-jobs",
  "/api/client-runtime/executions",
  "/api/client-runtime/delivery",
  "/api/client-runtime/memory-import",
  "/api/client-runtime/source-import",
  "/api/client-runtime/memory-graph",
  "/api/client-runtime/provider-history",
  "/api/client-runtime/telemetry",
  "/api/client-runtime/observability",
  "/api/client-runtime/build-identity",
  "/api/client-runtime/records",
  "/api/client-runtime/research",
  "/api/client-runtime/notebooks",
  "/api/client-runtime/notebook-sources",
  "/api/client-runtime/budget",
  "/api/client-runtime/skills",
  "/api/client-runtime/learning",
  "/api/client-runtime/ecc",
  "/api/client-runtime/workflows",
  "/api/client-runtime/paperclip",
  "/api/client-runtime/room",
  "/api/client-runtime/pipeline",
  "/api/client-runtime/boards",
  "/api/client-runtime/loop",
  "/api/client-runtime/intent",
  "/api/client-runtime/ruflo",
  "/api/client-runtime/hermes-content-factory",
  "/api/client-runtime/jobs",
  "/api/internal/client-runtime/jobs",
  "/api/internal/client-runtime/dispatch",
  "/api/internal/client-runtime/delivery",
  "/api/client-auth/session",
];
const CAPABILITY_ALIASES: Record<string, string> = {
  "delivery-actions": "delivery",
};

const GOVERNED_CAPABILITY_ALIASES: Record<string, string> = {
  "content-research": "research",
  "seo-intelligence": "seo",
};

function configuredList(name: string, fallback: string[]) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function clientEdition() {
  return process.env.VELOCE_CLIENT_EDITION === "1";
}

export function clientConfiguredList(name: string) {
  return configuredList(name, []);
}

export function clientCapabilityEnabled(id: string) {
  const configured = clientConfiguredList("CLIENT_ENABLED_CAPABILITIES");
  const canonicalId = CAPABILITY_ALIASES[id] ?? id;
  // A client image must never become permissive because provisioning omitted
  // the manifest. Operator development keeps the historical open default.
  return clientEdition()
    ? configured.includes(id) || configured.includes(canonicalId)
    : configured.length === 0 || configured.includes(id) || configured.includes(canonicalId);
}

/**
 * New portfolio capabilities are reviewable before they are executable. The
 * manifest can expose a capability as `preview` while evidence is collected;
 * only the existing enabled-capability allowlist grants execution.
 */
export function clientCapabilityExposure(id: string): "hidden" | "preview" | "enabled" {
  const canonicalId = GOVERNED_CAPABILITY_ALIASES[id] ?? id;
  const preview = clientConfiguredList("CLIENT_PREVIEW_CAPABILITIES").map((value) => GOVERNED_CAPABILITY_ALIASES[value] ?? value);
  if (clientCapabilityEnabled(canonicalId)) return "enabled";
  return preview.includes(canonicalId) ? "preview" : "hidden";
}

export function clientProviderEnabled(key: string) {
  const configured = clientConfiguredList("CLIENT_PROVIDER_ALLOWLIST");
  // Provider access is an explicit per-client approval, never an implicit
  // consequence of an empty environment variable.
  return clientEdition() ? configured.includes(key) : configured.length === 0 || configured.includes(key);
}

export function clientProviderCallsEnabled() {
  return process.env.CLIENT_PROVIDER_CALLS_ENABLED === "1";
}

export function clientContextCompressionEnabled() {
  const configured = clientConfiguredList("CLIENT_ENABLED_TRAITS");
  return configured.includes("context-compression");
}

export function clientIntentRoutingEnabled() {
  return process.env.CLIENT_INTENT_ROUTING_ENABLED === "1";
}

export function clientResearchRoutingEnabled() {
  return process.env.CLIENT_RESEARCH_ROUTING_ENABLED === "1";
}

export type ClientResearchProvider = "firecrawl" | "brave";

/** Provider choice is server-side manifest policy, never a client selector. */
export function clientResearchProvider(): ClientResearchProvider {
  return process.env.CLIENT_RESEARCH_PROVIDER?.trim().toLowerCase() === "brave" ? "brave" : "firecrawl";
}

/**
 * Takes both identifiers because the two checks compare different things, and
 * conflating them has broken this twice in opposite directions.
 *
 * The per-capability JSON is written from the manifest's
 * `capabilityProviderAllowlist`, which lists provider *names* ("elevenlabs").
 * The fallback defers to the global allowlist, which lists provider *keys*
 * ("ELEVENLABS_API_KEY"). Passing one where the other is expected silently
 * denies every provider, which reads as a configuration problem rather than
 * the code bug it is.
 */
export function clientCapabilityProviderEnabled(capability: string, provider: string, providerKey: string) {
  const configured = process.env.CLIENT_CAPABILITY_PROVIDER_ALLOWLIST_JSON?.trim();
  if (!configured) return clientProviderEnabled(providerKey);
  try {
    const parsed = JSON.parse(configured) as unknown;
    const providers = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)[capability]
      : undefined;
    // A capability absent from the JSON is not narrowed by it.
    if (!Array.isArray(providers)) return clientProviderEnabled(providerKey);
    // Narrowing must still respect the global allowlist: naming a provider for
    // a capability cannot grant a key the tenant was never approved for.
    return providers.map((value) => String(value).trim()).includes(provider) && clientProviderEnabled(providerKey);
  } catch {
    return false;
  }
}

export function clientCredentialSubmissionEnabled() {
  return Boolean(process.env.CLIENT_CREDENTIAL_INBOX_SECRET?.trim())
    && (clientEdition() || process.env.CLIENT_CREDENTIAL_SUBMISSIONS_ENABLED === "1");
}

export function clientAuthEnforced() {
  return process.env.CLIENT_RUNTIME_ENFORCE_AUTH === "1";
}

export function clientRouteAllowed(pathname: string) {
  const routes = clientAllowedRoutes();
  return routes.some((route) => route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`));
}

export function clientAllowedRoutes() {
  return configuredList("CLIENT_ALLOWED_ROUTES", DEFAULT_CLIENT_ROUTES);
}

export function clientApiRouteAllowed(pathname: string) {
  const routes = configuredList("CLIENT_ALLOWED_API_ROUTES", DEFAULT_CLIENT_API_ROUTES);
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export const clientRouteDefaults = DEFAULT_CLIENT_ROUTES;
export const clientApiRouteDefaults = DEFAULT_CLIENT_API_ROUTES;
