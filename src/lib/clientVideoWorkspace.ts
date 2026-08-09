// The hosted Video studio.
//
// Local Video has three tabs. Create drives Hyperframes for programmatic
// renders and keeps a render history; Avatar drives HeyGen with a script, a
// voice and an avatar, and keeps an avatar history; Workspace previews the
// generated HTML. Both render lanes are external providers with their own
// credentials and per-second cost, so neither lifts into a tenant.
//
// What carries over is the part that has to be right before any render is worth
// paying for: the script with its timings, and the shot plan. What does not is
// named as the specific provider it needs, so nobody is left wondering whether
// they clicked the wrong thing.
//
// The Library exists because the local studio has one. Render history and
// avatar history are how the local product shows a body of work, and dropping
// them was the difference between "correct" and "the same product".

export type VideoTab = "script" | "storyboard" | "library";

export const VIDEO_TABS: Array<{ key: VideoTab; label: string }> = [
  { key: "script", label: "Script" },
  { key: "storyboard", label: "Storyboard" },
  { key: "library", label: "Library" },
];

export const VIDEO_LENGTHS = [
  { key: "short", label: "30 seconds", direction: "Keep it to roughly 30 seconds of spoken word. One idea only." },
  { key: "standard", label: "60 seconds", direction: "Keep it to roughly 60 seconds of spoken word: one idea, one proof, one ask." },
  { key: "long", label: "2 minutes", direction: "Around two minutes of spoken word. There is room for a second proof point, but not for a second idea." },
] as const;

export type VideoLength = (typeof VIDEO_LENGTHS)[number]["key"];

export const VIDEO_SCRIPT_PRESETS = [
  { label: "Product explainer", direction: "Write an explainer script: earn attention in the first five seconds, state the problem, show how it works, give one piece of proof, and close on a single action. Mark timings for each beat." },
  { label: "Launch announcement", direction: "Write a launch script: lead with what is now possible rather than what was built, then who it is for, then how to start. Mark timings." },
  { label: "Presenter piece", direction: "Write a presenter script with delivery notes: where to pause, where to slow down, and where the shot changes. Mark timings." },
] as const;

export const VIDEO_STORYBOARD_PRESETS = [
  { label: "Shot list", direction: "Break this into a shot list. For each shot: duration, what is on screen, any on-screen text, and the cut into the next shot." },
  { label: "B-roll plan", direction: "Plan the b-roll: what each cutaway shows, why it earns its place, and what it must not contradict in the voiceover." },
  { label: "Title and end card", direction: "Design the title and end card: what appears, when, for how long, and what the viewer should do at the end." },
] as const;

/**
 * Named precisely. "Video generation is unavailable" tells a client nothing;
 * naming the provider tells them what to approve if they want it.
 */
export const VIDEO_GATES = [
  {
    title: "Presenter and voice rendering",
    detail: "Locally this drives HeyGen with a chosen avatar and voice. It needs that provider's own credentials and per-render budget, approved for this client. No provider is contacted from this surface and nothing here produces a video or audio file.",
  },
  {
    title: "Programmatic render",
    detail: "Locally this drives Hyperframes to render frames into a finished file. It needs a dedicated render worker, which is not enabled for this tenant. This surface produces the script and shot plan that a render step consumes.",
  },
] as const;

export function videoLength(key: string): VideoLength {
  return VIDEO_LENGTHS.find((item) => item.key === key)?.key ?? "standard";
}

export function videoScriptGoal(input: { subject: string; direction: string; length: string; source?: string }) {
  const length = VIDEO_LENGTHS.find((item) => item.key === input.length) ?? VIDEO_LENGTHS[1];
  const source = input.source?.trim().slice(0, 6_000);
  return [
    input.direction.trim(),
    `Subject: ${input.subject.trim()}`,
    length.direction,
    source ? `Material supplied by the client (you did not retrieve this):\n${source}` : "",
    "Write words a person will say out loud, not prose to be read. Do not invent statistics, customer names, or quotes. Do not describe footage you were not told exists.",
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}

export function videoStoryboardGoal(input: { subject: string; direction: string; source?: string }) {
  const source = input.source?.trim().slice(0, 6_000);
  return [
    input.direction.trim(),
    `Video: ${input.subject.trim()}`,
    source ? `Script supplied by the client (you did not retrieve this):\n${source}` : "",
    "Plan only what the available footage and the script can support. Do not assume access to stock libraries, brand assets, or footage you were not told exists.",
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}

export function videoTitle(input: { tab: VideoTab; subject: string }) {
  const label = input.tab === "storyboard" ? "Storyboard" : "Script";
  return `${label} · ${input.subject.trim().slice(0, 110)}`;
}
