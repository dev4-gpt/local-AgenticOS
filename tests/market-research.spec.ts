import { expect, test } from "@playwright/test";
import { resolveDiscoveredUrl, safePublicUrl } from "../src/lib/clientSeoAdapter";

// A direct scrape points the runtime at a host the tenant named, so it keeps
// the allowlist. These are the cases that would otherwise reach something the
// client was never authorised to fetch.
test("a named scrape target must clear the host allowlist", () => {
  const allowed = ["example.com"];
  expect(safePublicUrl("https://example.com/pricing", allowed)).toBe("https://example.com/pricing");
  expect(safePublicUrl("https://blog.example.com/x", allowed)).toBe("https://blog.example.com/x");
  expect(safePublicUrl("https://not-allowed.com/x", allowed)).toBeNull();
  // An empty allowlist must deny everything rather than mean "no restriction".
  expect(safePublicUrl("https://example.com/x", [])).toBeNull();
});

test("a named scrape target may not be internal, plaintext, or carry credentials", () => {
  const allowed = ["example.com", "localhost", "169.254.169.254", "10.0.0.1"];
  expect(safePublicUrl("http://example.com/x", allowed)).toBeNull();
  expect(safePublicUrl("https://user:pass@example.com/x", allowed)).toBeNull();
  expect(safePublicUrl("https://localhost/x", allowed)).toBeNull();
  // The cloud metadata endpoint is the classic SSRF target.
  expect(safePublicUrl("https://169.254.169.254/latest/meta-data/", allowed)).toBeNull();
  expect(safePublicUrl("https://10.0.0.1/admin", allowed)).toBeNull();
});

test("the fragment is dropped so the same page is not fetched twice", () => {
  expect(safePublicUrl("https://example.com/a#section", ["example.com"])).toBe("https://example.com/a");
});

// Search names no host, so results may come from anywhere. Following one is
// allowed only when the search itself returned it, which keeps the open web
// readable without opening a "point it at anything" path.
test("only a URL the search actually returned may be followed", async () => {
  const discovered = ["https://competitor.com/pricing"];
  expect(await resolveDiscoveredUrl("https://competitor.com/other", discovered)).toBeNull();
  expect(await resolveDiscoveredUrl("https://attacker.test/x", discovered)).toBeNull();
  // Passing an empty discovery set must not become a wildcard.
  expect(await resolveDiscoveredUrl("https://competitor.com/pricing", [])).toBeNull();
});

test("a discovered URL is still rejected when it is internal or plaintext", async () => {
  // Present in the discovered set, so only the transport and address checks
  // stand between this and a fetch.
  expect(await resolveDiscoveredUrl("http://competitor.com/x", ["http://competitor.com/x"])).toBeNull();
  expect(await resolveDiscoveredUrl("https://127.0.0.1/x", ["https://127.0.0.1/x"])).toBeNull();
  expect(await resolveDiscoveredUrl("https://169.254.169.254/x", ["https://169.254.169.254/x"])).toBeNull();
  expect(await resolveDiscoveredUrl("https://user:pass@competitor.com/x", ["https://user:pass@competitor.com/x"])).toBeNull();
});
