/**
 * Local AgentOS surfaces may read machine-owned files or start local tools.
 * They are protected by the operator runtime's loopback bind and this route
 * guard so they cannot be accidentally exposed by a cloud deployment.
 */
export function isLocalOnlyRequest(request: Request) {
  const rawHost = request.headers.get("host")?.trim().toLowerCase() || "";
  const host = rawHost.startsWith("[")
    ? rawHost.slice(1, rawHost.indexOf("]"))
    : rawHost.split(":", 1)[0];
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
