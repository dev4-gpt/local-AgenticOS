export function validateClientRuntimePublicBaseUrl(value: unknown) {
  const raw = String(value ?? "").trim().replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("VELOCE_LOCAL_PUBLIC_URL must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:") throw new Error("VELOCE_LOCAL_PUBLIC_URL must use HTTPS");
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname) || url.hostname.endsWith(".localhost")) {
    throw new Error("VELOCE_LOCAL_PUBLIC_URL must be a public tunnel origin, not localhost");
  }
  return raw;
}
