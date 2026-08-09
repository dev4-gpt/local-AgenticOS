// Video, Radar, and Leads as hosted surfaces.
//
// Each is a real product locally, standing on capability a tenant does not
// have: Video drives HeyGen and Hyperframes render APIs, Radar scans external
// sources and publishes to destinations, Leads calls Hunter and Apollo for
// discovery and enrichment. None of that lifts into a tenant unless that
// client's own provider is approved with its own credentials and budget.
//
// So each surface here keeps the work that is genuinely portable — the
// thinking, scripting, scoring and drafting that produces a durable tenant
// artifact — and names the rest as a blocked prerequisite. A surface with
// three real modes and one honest gate is a truer port than four controls
// where three quietly do nothing.
//
// These differ from the Batch A config in clientStudioSurfaces.ts: those are
// single-purpose screens, one input shape and one output. These have several
// distinct modes, each with its own input and its own output language.

import type { ClientWorkspaceSurface } from "@/lib/clientWorkspaceExecution";

export type DeepMode = {
  key: string;
  /** Tab label, in this surface's own language. */
  label: string;
  /** What the primary action is called. */
  action: string;
  description: string;
  /** Quick starts. Each carries real direction, never a bare label. */
  presets: Array<{ label: string; direction: string }>;
  subjectLabel: string;
  subjectPlaceholder: string;
  directionLabel: string;
  directionPlaceholder: string;
  /** Optional pasted material, labelled as client-supplied when present. */
  sourceLabel?: string;
  sourcePlaceholder?: string;
  artifactIntent: "preview" | "brief";
};

export type DeepSurface = {
  surface: ClientWorkspaceSurface;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  outputNoun: string;
  modes: DeepMode[];
  /** Named blocked capabilities. Each says what is missing and what is not done here. */
  gates: Array<{ title: string; detail: string }>;
};

const NO_RETRIEVAL =
  "Do not claim to have visited a site, run a search, contacted a service, or read anything you were not given. Where a judgement needs data you were not given, say which data is needed.";

export const DEEP_SURFACES: Record<string, DeepSurface> = {
  video: {
    surface: "video",
    eyebrow: "IV. Create · Video",
    title: "Video",
    description: "Take a video from idea to a production-ready script and shot plan. Rendering activates when this client has an approved video provider.",
    accent: "#f87171",
    outputNoun: "video briefs",
    modes: [
      {
        key: "script", label: "Script", action: "Write the script", artifactIntent: "brief",
        description: "Write the spoken script with timing, so a presenter or a render provider has something exact to work from.",
        presets: [
          { label: "Product explainer", direction: "Write an explainer script: hook in the first five seconds, the problem, how it works, the proof, and one call to action. Mark timings." },
          { label: "Launch reel", direction: "Write a launch reel script: beat by beat, with on-screen text called out and pacing notes." },
          { label: "Presenter piece", direction: "Write a presenter script with delivery notes, where to pause, and where the shot changes." },
        ],
        subjectLabel: "What the video is about", subjectPlaceholder: "The subject and the audience",
        directionLabel: "What it must land", directionPlaceholder: "The one thing a viewer should remember, the tone, and the length.",
        sourceLabel: "Source material · optional", sourcePlaceholder: "Paste notes, a transcript, or an article this should be built from.",
      },
      {
        key: "storyboard", label: "Storyboard", action: "Build the storyboard", artifactIntent: "brief",
        description: "Break the script into shots: what is on screen, how long it holds, and how it cuts to the next.",
        presets: [
          { label: "Shot list", direction: "Break this into a shot list: each shot's duration, what is on screen, the on-screen text, and the transition into the next." },
          { label: "B-roll plan", direction: "Plan the b-roll: what each cutaway shows, why it earns its place, and what it must not contradict." },
          { label: "Thumbnail direction", direction: "Work out the thumbnail direction: the single idea, the focal element, the text, and why it earns the click at small size." },
        ],
        subjectLabel: "The video", subjectPlaceholder: "Which video is this for?",
        directionLabel: "The edit", directionPlaceholder: "Target length, pacing, and any footage you already have.",
        sourceLabel: "Script · optional", sourcePlaceholder: "Paste the script this storyboard should follow.",
      },
    ],
    gates: [
      { title: "Avatar and voice rendering", detail: "Rendering a presenter video runs through an approved video provider with its own credentials and budget. No provider is contacted from this surface, and nothing here produces a video file." },
      { title: "Programmatic render", detail: "Frame-level rendering needs a dedicated render worker, which is not enabled for this tenant. This surface produces the script and the plan a render step would consume." },
    ],
  },

  radar: {
    surface: "radar",
    eyebrow: "VI. Deliver · Publishing",
    title: "Radar",
    description: "Turn what you are watching into a published point of view. Scanning sources and publishing to destinations each activate through their own approved adapter.",
    accent: "#f472b6",
    outputNoun: "drafts",
    modes: [
      {
        key: "draft", label: "Draft", action: "Write the draft", artifactIntent: "brief",
        description: "Turn a signal you have already found into a piece worth publishing.",
        presets: [
          { label: "Point of view", direction: "Write a point of view on this: what happened, why it matters to this audience, and the position we are taking. Argue it, do not summarise it." },
          { label: "Briefing note", direction: "Write a briefing note: the facts as given, what changes because of them, and what to watch next." },
          { label: "Social thread", direction: "Write a thread: one idea per post, the strongest one first, and no throat-clearing." },
        ],
        subjectLabel: "The signal", subjectPlaceholder: "What did you notice?",
        directionLabel: "The angle", directionPlaceholder: "Who this is for and the position you want to take.",
        sourceLabel: "What you found · optional", sourcePlaceholder: "Paste the article, post, or notes. This surface does not fetch them.",
      },
      {
        key: "plan", label: "Distribution", action: "Plan the distribution", artifactIntent: "brief",
        description: "Decide what goes where, in what order, and how each piece is adapted per channel.",
        presets: [
          { label: "Publish sequence", direction: "Plan a publish sequence: what goes to which channel, in what order, and how the piece is adapted for each." },
          { label: "Cadence", direction: "Plan a cadence: how often, on which days, and what to do when a piece underperforms." },
          { label: "Campaign report", direction: "Prepare a campaign report from the figures given: what ran, what it produced, and what to change." },
        ],
        subjectLabel: "What to distribute", subjectPlaceholder: "The asset or campaign",
        directionLabel: "Channels and audience", directionPlaceholder: "The channels in scope and who you are trying to reach.",
        sourceLabel: "Your figures · optional", sourcePlaceholder: "Paste performance data you already have.",
      },
    ],
    gates: [
      { title: "Source scanning", detail: "Watching external sources runs through the approved research adapter, budgeted separately. Nothing here crawls, subscribes, or fetches a feed, so drafts are written from signals you supply." },
      { title: "Publishing", detail: "Publishing to a destination requires that destination's approved adapter and its own audit record. No destination is contacted from this surface; every draft stays a downloadable tenant artifact." },
    ],
  },

  leads: {
    surface: "leads",
    eyebrow: "VI. Deliver · Lead operations",
    title: "Leads",
    description: "Work out who to reach, how to qualify them, and what to say. Discovery, enrichment and sending each stay separately gated.",
    accent: "#fbbf24",
    outputNoun: "lead plans",
    modes: [
      {
        key: "icp", label: "ICP", action: "Define the ICP", artifactIntent: "brief",
        description: "Define who is worth reaching, precisely enough that someone else could apply it.",
        presets: [
          { label: "ICP definition", direction: "Define the ideal customer profile: firmographics, the trigger that makes now the right time, the buying committee, and the disqualifiers. Be specific enough that two people would sort the same list the same way." },
          { label: "Segmentation", direction: "Segment this market into groups that need different messages, and say what distinguishes each." },
          { label: "Disqualifiers", direction: "Write the disqualification rules: who looks like a fit but is not, and the signal that gives it away." },
        ],
        subjectLabel: "The offer", subjectPlaceholder: "What are you selling, and to whom?",
        directionLabel: "What you know", directionPlaceholder: "Your best customers so far, and why they bought.",
        sourceLabel: "Existing customer data · optional", sourcePlaceholder: "Paste a list or notes about accounts that closed.",
      },
      {
        key: "score", label: "Scoring", action: "Build the rubric", artifactIntent: "brief",
        description: "Turn the ICP into a rubric that produces the same score in different hands.",
        presets: [
          { label: "Scoring rubric", direction: "Build a scoring rubric: the criteria, the weight of each, and worked examples at the top, middle and bottom of the range." },
          { label: "Routing rules", direction: "Write routing rules: which score goes to which motion, and what happens to the ones in between." },
          { label: "Score a list", direction: "Apply the rubric to the accounts supplied and show the score with the reasoning for each." },
        ],
        subjectLabel: "What you are scoring", subjectPlaceholder: "The segment or list",
        directionLabel: "What matters", directionPlaceholder: "The signals that predict a good fit, and the ones that waste time.",
        sourceLabel: "Accounts to score · optional", sourcePlaceholder: "Paste the accounts. Only what you paste is scored.",
      },
      {
        key: "outreach", label: "Outreach", action: "Write the outreach", artifactIntent: "brief",
        description: "Write the message, in the words a real buyer would answer.",
        presets: [
          { label: "Cold email", direction: "Write a cold email: an opening line that earns the next sentence, one specific reason to care, one proof point, and a single clear ask. No flattery." },
          { label: "Follow-up sequence", direction: "Write a follow-up sequence where each message adds something new rather than repeating the first." },
          { label: "Call opener", direction: "Write a call opener and the three questions that qualify fastest without interrogating." },
        ],
        subjectLabel: "Who you are writing to", subjectPlaceholder: "The role and the situation",
        directionLabel: "The offer and the trigger", directionPlaceholder: "What you want them to do, and why now.",
        sourceLabel: "Their context · optional", sourcePlaceholder: "Paste what you already know about the account.",
      },
    ],
    gates: [
      { title: "Discovery and enrichment", detail: "Finding contacts and enriching them runs through an approved data provider with its own credentials and per-record cost. No provider is contacted from this surface and no contact data is retrieved here." },
      { title: "Sending", detail: "Sending email is a separate approved action with its own record and destination allowlist. This surface writes the copy; it does not send, and no recipient is contacted." },
    ],
  },
};

export function deepSurface(key: string): DeepSurface | null {
  return DEEP_SURFACES[key] ?? null;
}

export function deepMode(surface: DeepSurface, key: string): DeepMode {
  return surface.modes.find((mode) => mode.key === key) ?? surface.modes[0];
}

/**
 * Builds the goal. Pasted material is labelled as client-supplied and the run
 * is told not to claim retrieval, because none of these surfaces fetch.
 */
export function deepGoal(input: { mode: DeepMode; subject: string; direction: string; source?: string }) {
  const source = input.source?.trim().slice(0, 6_000);
  return [
    input.direction.trim(),
    `Subject: ${input.subject.trim()}`,
    source ? `Material supplied by the client (you did not retrieve this):\n${source}` : "",
    NO_RETRIEVAL,
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}
