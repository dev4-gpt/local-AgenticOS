// The hosted Radar.
//
// The local Radar is "The Radar": a 24/7 watcher that searches X live through
// the operator's own xAI Grok OAuth, ranks what is trending, sweeps every
// morning on a local schedule, and logs each sweep to an Obsidian vault. None
// of those three things exist in a tenant — not the operator's X Premium
// subscription, not the vault, not the local cron — so the live sweep stays a
// blocked prerequisite.
//
// Everything else about the product does carry over, and earlier hosted work
// wrongly dropped it. The structure is the same: signals on one side, published
// work on the other, with the oracle between them. A signal here is one you
// bring rather than one the sweep found, and that is the only difference the
// client should have to understand.

export type RadarTab = "signals" | "published";

export const RADAR_TABS: Array<{ key: RadarTab; label: string }> = [
  { key: "signals", label: "Signals" },
  { key: "published", label: "Published" },
];

/** Mirrors the local signal's shape: what happened, why now, and the angle. */
export type RadarSignalInput = { headline: string; whyNow: string; angle: string; format: string };

export const RADAR_FORMATS = [
  { key: "post", label: "Post", direction: "Write it as a single post: the strongest line first, one idea, no throat-clearing, and an ending that does not trail off." },
  { key: "thread", label: "Thread", direction: "Write it as a thread: one idea per post, the sharpest first, each post able to stand alone if it is the only one someone reads." },
  { key: "note", label: "Briefing", direction: "Write it as a briefing note: the facts as given, what changes because of them, and what to watch next." },
  { key: "essay", label: "Essay", direction: "Write it as a short essay: take a position, argue it against the strongest objection, and land somewhere the reader can act on." },
] as const;

export type RadarFormat = (typeof RADAR_FORMATS)[number]["key"];

export const RADAR_SIGNAL_PRESETS: Array<{ label: string; headline: string; whyNow: string; angle: string }> = [
  {
    label: "Competitor move",
    headline: "A competitor shipped something that changes the comparison",
    whyNow: "It resets what buyers expect as standard, so the old positioning reads as behind.",
    angle: "Say plainly what it changes and what it does not, rather than reacting.",
  },
  {
    label: "Regulation shift",
    headline: "A rule changed that affects how this work has to be done",
    whyNow: "Teams have to act before it applies, so the useful thing is the practical consequence.",
    angle: "Translate the rule into what someone actually has to do differently on Monday.",
  },
  {
    label: "Pattern noticed",
    headline: "The same question keeps coming up from different clients",
    whyNow: "Repetition means it is a market signal, not one client's problem.",
    angle: "Answer it once, properly, in public.",
  },
];

/**
 * A sweep here means an in-flight draft, not a crawl of the web. The orb's
 * sweeping state is driven by that so the animation reflects real work rather
 * than decoration.
 */
export const RADAR_SWEEP_NOTICE =
  "The live sweep is not available in a hosted tenant. Locally it searches X through the operator's own xAI Grok account and writes each sweep to their Obsidian vault; neither exists here. Bring the signal and this drafts from it — nothing on this surface searches, crawls, or reads a feed.";

export const RADAR_PUBLISH_NOTICE =
  "Publishing needs its destination's approved adapter and its own audit record. No destination is contacted from this surface; every draft stays a downloadable tenant artifact you can publish through whatever route is approved.";

export function radarFormat(key: string): RadarFormat {
  return RADAR_FORMATS.find((item) => item.key === key)?.key ?? "post";
}

/** Builds the draft goal from a signal the client supplied. */
export function radarDraftGoal(input: RadarSignalInput) {
  const format = RADAR_FORMATS.find((item) => item.key === input.format) ?? RADAR_FORMATS[0];
  return [
    format.direction,
    `Signal: ${input.headline.trim()}`,
    input.whyNow.trim() ? `Why it matters now: ${input.whyNow.trim()}` : "",
    input.angle.trim() ? `The angle to take: ${input.angle.trim()}` : "",
    "This signal was supplied by the client. You did not find it, and you have not read the source, so do not quote it, attribute figures to it, or describe anything it says beyond what is written above.",
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}

export function radarSignalTitle(input: { headline: string; format: string }) {
  const format = RADAR_FORMATS.find((item) => item.key === input.format) ?? RADAR_FORMATS[0];
  return `${format.label} · ${input.headline.trim().slice(0, 110)}`;
}
