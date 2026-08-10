// The multi-mode hosted surfaces.
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
  /**
   * The hosted generation lane behind this surface, when one exists. The
   * control only appears once the capability and provider are approved for the
   * tenant, so the same build is a planning surface for one client and a
   * generating one for another without a code change.
   *
   * `costHint` is shown before the button is pressed. These providers are
   * metered per run rather than per token, and a client should know that a
   * single render is a visible fraction of a small monthly cap.
   */
  generation?: {
    provider: "elevenlabs" | "openai" | "suno" | "heygen";
    capability: "media";
    action: string;
    inputKind: "text" | "image";
    costHint: string;
  };
};

const NO_RETRIEVAL =
  "Do not claim to have visited a site, run a search, contacted a service, or read anything you were not given. Where a judgement needs data you were not given, say which data is needed.";

export const DEEP_SURFACES: Record<string, DeepSurface> = {
  studio: {
    surface: "studio",
    eyebrow: "IV. Create · Media",
    title: "Agent Studio",
    description: "Set the creative direction a media run needs before anyone spends on generation. Image, speech and video each activate with their own approved provider.",
    accent: "#c4b5fd",
    outputNoun: "directions",
    modes: [
      {
        key: "direction", label: "Direction", action: "Set the direction", artifactIntent: "brief",
        description: "Decide what every asset in this campaign has to have in common before any of them exist.",
        presets: [
          { label: "Campaign direction", direction: "Set the creative direction: the single idea, the visual language, the tone, and what must be true in every asset for it to belong to this campaign." },
          { label: "Brand rules", direction: "Write the rules a generated asset must follow to look like it came from this brand, and the ones that would make it obviously off-brand." },
          { label: "Reference brief", direction: "Describe the references worth matching and, more usefully, exactly what about each one is worth matching." },
        ],
        subjectLabel: "What this is for", subjectPlaceholder: "The campaign or launch",
        directionLabel: "The audience and the message", directionPlaceholder: "Who sees this, where, and what they should feel.",
        sourceLabel: "Existing brand notes · optional", sourcePlaceholder: "Paste guidelines or notes you already have.",
      },
      {
        key: "assets", label: "Asset list", action: "List the assets", artifactIntent: "brief",
        description: "Turn the direction into the specific list of assets someone has to produce.",
        presets: [
          { label: "Asset list", direction: "List every asset this campaign needs: what each one is, where it runs, its dimensions or duration, and the one job it does." },
          { label: "Prompt set", direction: "Write the generation prompt for each asset, specific enough that two people would get comparable results from it." },
          { label: "Review checklist", direction: "Write the checklist for accepting or rejecting a generated asset, with the failure modes to look for." },
        ],
        subjectLabel: "The campaign", subjectPlaceholder: "Which campaign is this for?",
        directionLabel: "Channels and constraints", directionPlaceholder: "Where these run, and any hard limits on size or length.",
        sourceLabel: "The direction · optional", sourcePlaceholder: "Paste the creative direction these assets must follow.",
      },
    ],
    generation: { provider: "elevenlabs", capability: "media", action: "Generate the voiceover", inputKind: "text", costHint: "Speech is billed per character, roughly $0.003 per thousand." },
    gates: [
      { title: "Image, speech and video generation", detail: "Locally this runs through the operator's own media pipeline. Each generator needs its own approved provider, credentials and per-asset budget for this client. No provider is contacted from this surface and no asset file is produced here." },
      { title: "Asset storage and rehydration", detail: "Reprocessing stored media needs the media worker, which is not enabled for this tenant. Directions and asset lists are kept as tenant artifacts you can act on elsewhere." },
    ],
  },

  music: {
    surface: "music",
    eyebrow: "IV. Create · Audio",
    title: "Music Studio",
    description: "Work out how it should sound and where it will be used. Generation activates with an approved music provider.",
    accent: "#22d3ee",
    outputNoun: "compositions",
    modes: [
      {
        key: "track", label: "Track", action: "Brief the track", artifactIntent: "brief",
        description: "Describe the piece precisely enough that a composer or a generator could produce it.",
        presets: [
          { label: "Brand theme", direction: "Brief a brand theme: mood, tempo, instrumentation, length, and the moment it plays. Say what it must not sound like." },
          { label: "Podcast intro", direction: "Brief a podcast intro: length, feel, and how it hands off to the host without stepping on the first line." },
          { label: "Background score", direction: "Brief a background score that supports narration without competing with it: dynamics, where it recedes, where it lifts." },
        ],
        subjectLabel: "What the music is for", subjectPlaceholder: "The piece and where it plays",
        directionLabel: "The feeling", directionPlaceholder: "Mood, tempo, instruments, length, and any reference feel.",
        sourceLabel: "Script or timing · optional", sourcePlaceholder: "Paste the narration or cue timings this has to fit.",
      },
      {
        key: "identity", label: "Sonic identity", action: "Define the identity", artifactIntent: "brief",
        description: "Decide what this brand consistently sounds like, so separate pieces feel related.",
        presets: [
          { label: "Sonic identity", direction: "Define the sonic identity: the palette, the tempo range, the instruments that recur, and the rules that keep separate pieces recognisably related." },
          { label: "Cue library", direction: "Plan a cue library: each cue's purpose, length, and where it is used, so a team can pick without asking." },
          { label: "Voice direction", direction: "Write the voice direction: pace, register, warmth, and the delivery notes that keep reads consistent between sessions." },
        ],
        subjectLabel: "The brand", subjectPlaceholder: "Whose sound is this?",
        directionLabel: "How it should feel", directionPlaceholder: "The impression you want, and what would feel wrong.",
        sourceLabel: "Existing audio notes · optional", sourcePlaceholder: "Paste anything already decided about the sound.",
      },
    ],
    generation: { provider: "suno", capability: "media", action: "Generate the track", inputKind: "text", costHint: "Each track is about $0.10, so ten runs consume a $1 monthly cap." },
    gates: [
      { title: "Music and voice generation", detail: "Locally this runs through ElevenLabs and Suno. Each needs its own approved credentials and per-generation budget for this client. No provider is contacted from this surface and no audio file is produced here." },
    ],
  },

  openmontage: {
    surface: "openmontage",
    eyebrow: "IV. Create · Video assembly",
    title: "OpenMontage",
    description: "Plan the edit: what appears, in what order, and how it cuts. Assembly activates when a render worker is approved.",
    accent: "#fb923c",
    outputNoun: "edit plans",
    modes: [
      {
        key: "edit", label: "Edit plan", action: "Plan the edit", artifactIntent: "brief",
        description: "Decide the arc and the order before anyone opens an editor.",
        presets: [
          { label: "Trailer", direction: "Plan a trailer: the arc, the scene order, the pacing, and exactly where the title lands." },
          { label: "Montage", direction: "Plan a montage: the through-line that makes it more than a sequence, the beats, and the music feel." },
          { label: "Recut", direction: "Plan a recut of existing footage: what to keep, what to cut, and what the new order argues that the old one did not." },
        ],
        subjectLabel: "What is being edited", subjectPlaceholder: "The film or sequence",
        directionLabel: "The story and the length", directionPlaceholder: "What it has to say, the target length, and the footage you have.",
        sourceLabel: "Footage notes · optional", sourcePlaceholder: "Paste your shot log or footage list.",
      },
      {
        key: "scenes", label: "Scene list", action: "Build the scene list", artifactIntent: "brief",
        description: "Break the plan into scenes with duration, purpose, and the transition into the next.",
        presets: [
          { label: "Scene list", direction: "Build a scene list: each scene's duration, its purpose, what is on screen, and the transition into the next." },
          { label: "Cut points", direction: "Identify the cut points and justify each one: what makes this the right frame to leave on." },
          { label: "Sound plan", direction: "Plan the sound: where music enters and drops, where silence does the work, and where dialogue must be clear." },
        ],
        subjectLabel: "The edit", subjectPlaceholder: "Which edit is this for?",
        directionLabel: "Pacing and constraints", directionPlaceholder: "The rhythm you want and any fixed durations.",
        sourceLabel: "The edit plan · optional", sourcePlaceholder: "Paste the plan these scenes should follow.",
      },
    ],
    gates: [
      { title: "Assembly and rendering", detail: "Locally this drives ffmpeg on the operator's own machine to assemble the cut. It needs a dedicated render worker, which is not enabled for this tenant. No footage is processed here and no video file is produced." },
    ],
  },

  thumbnails: {
    surface: "thumbnails",
    eyebrow: "IV. Create · Thumbnails",
    title: "Thumbnail Studio",
    description: "Work out the one idea a thumbnail has to carry. Image generation activates with an approved provider.",
    accent: "#fbbf24",
    outputNoun: "thumbnail directions",
    modes: [
      {
        key: "direction", label: "Direction", action: "Set the direction", artifactIntent: "brief",
        description: "Decide the single idea, the focal element, and why it earns the click at small size.",
        presets: [
          { label: "Video thumbnail", direction: "Set the thumbnail direction: the one idea, the focal element, the text if any, and why it earns the click beside the content it competes with." },
          { label: "Launch visual", direction: "Set a launch visual direction that survives being small and being surrounded by noise." },
          { label: "Social cover", direction: "Set a social cover direction with the safe areas and platform crops accounted for." },
        ],
        subjectLabel: "What it is for", subjectPlaceholder: "The video, post, or launch",
        directionLabel: "The promise and the competition", directionPlaceholder: "What the click promises, and what it sits beside.",
        sourceLabel: "Title or script · optional", sourcePlaceholder: "Paste the title or opening lines this has to match.",
      },
      {
        key: "variants", label: "Variants", action: "Plan the variants", artifactIntent: "brief",
        description: "Plan a set worth testing against each other, where each variant changes one thing.",
        presets: [
          { label: "Test set", direction: "Plan a set of thumbnail variants where each one changes exactly one variable, and say what a win on each would tell you." },
          { label: "Text treatments", direction: "Plan the text treatments: how few words, at what size, and where they can sit without covering the subject." },
          { label: "Crop plan", direction: "Plan the crops for each platform's aspect ratio, keeping the focal element intact in every one." },
        ],
        subjectLabel: "The thumbnail", subjectPlaceholder: "Which thumbnail is this for?",
        directionLabel: "What to test", directionPlaceholder: "The question you want the test to answer.",
        sourceLabel: "The direction · optional", sourcePlaceholder: "Paste the direction these variants explore.",
      },
    ],
    generation: { provider: "openai", capability: "media", action: "Generate the thumbnail", inputKind: "image", costHint: "Each image is about $0.04, and around $0.12 at high quality in a non-square size." },
    gates: [
      { title: "Image generation", detail: "Locally this calls OpenAI for the image and processes it with sharp on the operator's machine. It needs an approved image provider, credentials and per-image budget for this client. No provider is contacted from this surface and no image file is produced here." },
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
