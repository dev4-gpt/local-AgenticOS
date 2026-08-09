// The hosted SEO surface.
//
// Local SEO is eight tabs sitting on machine-local capability: research shells
// out to a Python script holding the operator's own Google Search Console
// OAuth token, generate streams the blog-post skill through the local Claude
// CLI and writes files into site directories, deploy spawns the netlify CLI,
// and history and transcripts are files under the operator's home directory.
// None of that can be lifted into a tenant, so this is not a port of the local
// implementation — it is the same user outcomes rebuilt on lanes a tenant has.
//
// What survives: plan a target query, write the article, keep the trail. What
// cannot survive is stated as a blocked prerequisite rather than mimicked,
// because a control that pretends to reach Search Console or publish to a live
// site would be lying about what this runtime can do.

export type SeoTab = "plan" | "article" | "history" | "publish";

export const SEO_TABS: Array<{ key: SeoTab; label: string }> = [
  { key: "plan", label: "Plan" },
  { key: "article", label: "Write" },
  { key: "history", label: "Library" },
  { key: "publish", label: "Publish" },
];

export type SeoPreset = { label: string; query: string; direction: string };

export const SEO_PLAN_PRESETS: SeoPreset[] = [
  {
    label: "Content opportunity",
    query: "",
    direction: "Assess this opportunity: the queries worth targeting, the intent behind each, what currently ranks, and what would have to be true for this site to win.",
  },
  {
    label: "Content brief",
    query: "",
    direction: "Write a content brief: target query, search intent, the sections the page must contain, the internal links it needs, and how success is measured.",
  },
  {
    label: "Technical plan",
    query: "",
    direction: "Produce a technical SEO plan covering crawlability, indexation, performance and structured data, ordered by leverage rather than by checklist.",
  },
];

export const SEO_ARTICLE_PRESETS: SeoPreset[] = [
  {
    label: "How-to guide",
    query: "",
    direction: "Write a practical how-to guide that answers the query completely, with concrete steps a reader can follow and no filler introduction.",
  },
  {
    label: "Comparison",
    query: "",
    direction: "Write an honest comparison that helps the reader choose, states the trade-offs plainly, and does not pretend one option wins every case.",
  },
  {
    label: "Explainer",
    query: "",
    direction: "Write an explainer that takes a reader from no knowledge to a working understanding, defining terms the first time they appear.",
  },
];

/**
 * Live rank and impression data needs the client's own Search Console
 * connection, which is a separate credentialed approval. The local surface
 * reads the operator's cached token; a tenant has no such thing and must not
 * be shown a control implying otherwise.
 */
export const SEO_RESEARCH_NOTICE =
  "Live Search Console data needs this client's own Google connection, approved separately with its own credentials. Nothing on this surface reaches Search Console, so plan from queries you already know or from data you paste in.";

export const SEO_PUBLISH_NOTICE =
  "Publishing to a live site runs through an approved delivery adapter with its own destination allowlist and audit record. This surface produces the article and keeps the trail; it does not deploy, and no destination is contacted from here.";

const MAX_SOURCE_CHARS = 6_000;

/**
 * Builds the plan goal. Any pasted data is labelled as supplied by the client
 * so the model treats it as given rather than as something it retrieved.
 */
export function seoPlanGoal(input: { query: string; direction: string; data?: string }) {
  const data = input.data?.trim().slice(0, MAX_SOURCE_CHARS);
  return [
    input.direction.trim(),
    `Target query: ${input.query.trim()}`,
    data ? `Client-supplied data for context (you did not retrieve this, do not claim you did):\n${data}` : "",
    "Do not claim to have checked live rankings, crawled a site, or run a search. Where a judgement needs data you were not given, say which data is needed.",
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}

/**
 * Builds the article goal. The local pipeline grounds an article in an
 * optional transcript; the same option is kept here, bounded and labelled.
 */
export function seoArticleGoal(input: { query: string; direction: string; source?: string }) {
  const source = input.source?.trim().slice(0, MAX_SOURCE_CHARS);
  return [
    input.direction.trim(),
    `Target query: ${input.query.trim()}`,
    source ? `Source material supplied by the client, to ground the article (you did not retrieve this):\n${source}` : "",
    "Write for a reader, not for a keyword. Do not invent statistics, quotes, customer names, or citations. If a claim needs a source you were not given, write the claim so it does not depend on one.",
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}

export function seoSlug(query: string) {
  return query.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
