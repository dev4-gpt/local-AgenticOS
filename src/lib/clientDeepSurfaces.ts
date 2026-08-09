// Leads as a hosted multi-mode surface.
//
// Video and Radar started here and outgrew it: each needed the local product's
// own structure and, for Radar, its oracle. This config remains the right shape
// for a surface whose modes differ only in what they ask for.
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
