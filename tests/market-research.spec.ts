import { expect, test } from "@playwright/test";
import { evaluateRobotsForAgents, marketSearchToV90Records, resolveDiscoveredUrl, safePublicUrl } from "../src/lib/clientSeoAdapter";
import { normalizeV90ResearchRecord } from "../src/lib/v90Contracts";

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

test("a site with no rule for a crawler is reported as allowing it", () => {
  // Absence of a rule means allowed - that is how robots.txt works, and
  // reporting "unknown" would be softer but wrong.
  const verdicts = evaluateRobotsForAgents("User-agent: *\nDisallow:");
  expect(verdicts.every((verdict) => verdict.allowed)).toBe(true);
});

test("a blanket disallow blocks every crawler, a targeted one blocks only that crawler", () => {
  const all = evaluateRobotsForAgents("User-agent: *\nDisallow: /");
  expect(all.every((verdict) => !verdict.allowed)).toBe(true);

  const targeted = evaluateRobotsForAgents("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:");
  expect(targeted.find((verdict) => verdict.agent === "GPTBot")?.allowed).toBe(false);
  expect(targeted.find((verdict) => verdict.agent === "ClaudeBot")?.allowed).toBe(true);
});

test("a specific rule wins over the wildcard rather than stacking with it", () => {
  // The site blocks everyone by default but lets ClaudeBot through.
  const robots = "User-agent: *\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow:";
  const verdicts = evaluateRobotsForAgents(robots);
  expect(verdicts.find((verdict) => verdict.agent === "ClaudeBot")?.allowed).toBe(true);
  expect(verdicts.find((verdict) => verdict.agent === "GPTBot")?.allowed).toBe(false);
});

test("comments and grouped agents are handled", () => {
  const robots = "# block the ai crawlers\nUser-agent: GPTBot\nUser-agent: PerplexityBot\nDisallow: / # everything";
  const verdicts = evaluateRobotsForAgents(robots);
  expect(verdicts.find((verdict) => verdict.agent === "GPTBot")?.allowed).toBe(false);
  expect(verdicts.find((verdict) => verdict.agent === "PerplexityBot")?.allowed).toBe(false);
});

test("an unscraped result is a partial record, never a complete one", () => {
  const [record] = marketSearchToV90Records({
    tenantSlug: "t", query: "q", scraped: false,
    results: [{ url: "https://competitor.com/a", title: "T", description: "A snippet.", markdown: "" }],
  });
  // Saying "complete" for a page we only saw a snippet of would make every
  // downstream claim look better sourced than it is.
  expect(record.status).toBe("partial");
  expect(record.confidence).toBe(0.5);
  expect(record.citations[0].evidence).toBe("A snippet.");
});

test("a scraped result is complete, and every record passes the contract", () => {
  const records = marketSearchToV90Records({
    tenantSlug: "t", query: "q", scraped: true,
    results: [{ url: "https://competitor.com/a", title: "T", description: "D", markdown: "Full page." }],
  });
  expect(records[0].status).toBe("complete");
  expect(records[0].confidence).toBe(1);
  // The contract is the thing downstream trusts, so the mapping must satisfy it.
  expect(normalizeV90ResearchRecord(records[0])).not.toBeNull();
});

test("a result with neither content nor summary fails with a stated reason", () => {
  const [record] = marketSearchToV90Records({
    tenantSlug: "t", query: "q", scraped: false,
    results: [{ url: "https://competitor.com/a", title: "", description: "", markdown: "" }],
  });
  expect(record.status).toBe("failed");
  expect(record.failureReason).toBeTruthy();
  expect(record.citations).toHaveLength(0);
});
