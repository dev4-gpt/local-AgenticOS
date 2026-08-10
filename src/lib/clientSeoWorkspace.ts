// The hosted SEO surface, matching the local one tab for tab.
//
// Local SEO has eight tabs and an earlier hosted version collapsed them into
// four, which lost the information architecture even where the capability was
// portable. The tabs, their order, and their labels are the local ones. What
// differs is only what stands behind each, and where that differs it is stated
// rather than hidden.
//
// Per tab:
//   Research    - local runs Google Search Console through the operator's own
//                 cached OAuth token. A tenant has no such token, so the hosted
//                 equivalent researches the market instead: search what already
//                 exists, cite it, and compare it against the client's strategy.
//   AEO         - fully portable. It reads a named site's robots.txt, llms.txt
//                 and structured data. Read-only, on a host the client names.
//   OpenSEO     - a third-party subscription the operator pays for, embedded
//                 locally in an iframe. A client needs their own account; we do
//                 not proxy ours, and we do not embed a dashboard we cannot
//                 vouch for inside a client product.
//   Generate    - portable. The article itself, through the copy intent.
//   Deploy      - local shells out to the netlify CLI. Hosted publishing runs
//                 through the approved delivery adapter and its host allowlist.
//   History     - portable. The tenant's own artifacts.
//   Transcripts - local reads files from the operator's disk. Hosted uses the
//                 tenant's own records as source material, and keeps the local
//                 behaviour where picking one carries it into Generate.
//   Skill       - portable. The playbook the generator follows.

export type SeoTab = "research" | "aeo" | "openseo" | "generate" | "deploy" | "history" | "transcripts" | "skill";

export const SEO_TABS: Array<{ key: SeoTab; label: string }> = [
  { key: "research", label: "Research" },
  { key: "aeo", label: "AEO" },
  { key: "openseo", label: "OpenSEO" },
  { key: "generate", label: "Generate" },
  { key: "deploy", label: "Deploy" },
  { key: "history", label: "History" },
  { key: "transcripts", label: "Transcripts" },
  { key: "skill", label: "Skill" },
];

/** The pilot bound. Deliberately small: each result costs, and three is enough
 *  to see whether a strategy has a gap without turning a check into a crawl. */
export const SEO_RESEARCH_RESULT_LIMIT = 3;

export const SEO_RESEARCH_PRESETS = [
  { label: "Competitor comparison", question: "How do competitors position this, and what do they claim that we do not?" },
  { label: "Content gap", question: "What questions does existing content answer that ours does not?" },
  { label: "Positioning check", question: "Is our angle already crowded, and where is it genuinely different?" },
];

/**
 * The comparison prompt. It runs after the search, over sources the search
 * returned, and its whole value is that every claim is attributable - so it is
 * told to name the source per point and to say plainly where the sources do
 * not settle a question rather than filling the gap.
 */
export function seoComparisonGoal(input: {
  question: string;
  ourStrategy: string;
  sources: Array<{ url: string; title: string; description: string; markdown?: string }>;
}) {
  const sources = input.sources.map((source, index) => [
    `### Source ${index + 1}: ${source.title || source.url}`,
    `URL: ${source.url}`,
    source.description ? `Summary: ${source.description}` : "",
    source.markdown ? `Page content:\n${source.markdown.slice(0, 4_000)}` : "Page content was not retrieved; use the summary only.",
  ].filter(Boolean).join("\n")).join("\n\n");

  return [
    "Compare the client's strategy against what these sources already do, and produce a recommendation they can act on.",
    `## The question\n\n${input.question.trim()}`,
    `## Our current strategy\n\n${input.ourStrategy.trim()}`,
    `## Sources found\n\n${sources || "No sources were returned."}`,
    [
      "Attribute every claim about a source to that source by number and URL. Do not describe page content that was not retrieved.",
      "Structure the answer as: what the sources already cover, where our strategy differs, the gaps worth closing, and what you would do first.",
      "Where the sources do not settle a question, say so rather than filling the gap. Do not invent competitors, figures, or quotes.",
    ].join(" "),
  ].join("\n\n").slice(0, 10_000);
}

export function seoArticleGoal(input: { query: string; direction: string; source?: string }) {
  const source = input.source?.trim().slice(0, 6_000);
  return [
    input.direction.trim(),
    `Target query: ${input.query.trim()}`,
    source ? `Source material supplied by the client, to ground the article (you did not retrieve this):\n${source}` : "",
    "Write for a reader, not for a keyword. Do not invent statistics, quotes, customer names, or citations. If a claim needs a source you were not given, write the claim so it does not depend on one.",
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}

export const SEO_ARTICLE_PRESETS = [
  { label: "How-to guide", direction: "Write a practical how-to guide that answers the query completely, with concrete steps a reader can follow and no filler introduction." },
  { label: "Comparison", direction: "Write an honest comparison that helps the reader choose, states the trade-offs plainly, and does not pretend one option wins every case." },
  { label: "Explainer", direction: "Write an explainer that takes a reader from no knowledge to a working understanding, defining terms the first time they appear." },
];

/** The AI crawlers the AEO check reports on, matching the local panel. */
export const AEO_CRAWLERS = [
  { name: "ChatGPT", agent: "GPTBot" },
  { name: "ChatGPT-User", agent: "ChatGPT-User" },
  { name: "Claude", agent: "ClaudeBot" },
  { name: "Perplexity", agent: "PerplexityBot" },
  { name: "Google-Extended", agent: "Google-Extended" },
  { name: "Applebot-Extended", agent: "Applebot-Extended" },
] as const;

export const SEO_NOTICES = {
  research: "Local Research reads Google Search Console through the operator's own Google account, which a tenant does not have. This researches the market instead: it searches what already exists, cites it, and compares it against your strategy. Scraping full pages is off by default because each page costs.",
  openseo: "OpenSEO is a separate paid subscription. The local edition embeds the operator's own dashboard, which is not something to proxy or embed on a client's behalf - it would mean showing you an account you do not control. Connect your own OpenSEO account and open it directly.",
  deploy: "Publishing runs through the approved delivery adapter, which only accepts destinations on this client's approved host list and records every send. Local publishing shells out to the netlify CLI on the operator's machine; nothing here contacts a destination.",
  transcripts: "Local Transcripts reads files from the operator's disk. These are this tenant's own records, and picking one carries it into Generate the same way.",
} as const;

export function seoResearchTitle(question: string) {
  return `Research · ${question.trim().slice(0, 110)}`;
}

export function seoArticleTitle(query: string) {
  return `Article · ${query.trim().slice(0, 110)}`;
}
