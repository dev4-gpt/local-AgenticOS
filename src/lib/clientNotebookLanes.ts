// Real lanes behind the four Notebook tabs.
//
// Research, chat, studio, and assets each used to render one paragraph of
// description with no input and no action behind it, which broke the rule that
// no visible control may be decorative. Every one of them already had a lane in
// the hosted runtime: research is the verified memory-import path, chat is the
// text-agent lane grounded in selected records, studio is the workspace
// execution lane, and assets is the tenant artifacts API. This module supplies
// the grounding and prompt shape those lanes need, so the tabs do real work.

export type NotebookTab = "library" | "research" | "chat" | "studio" | "assets";

export const NOTEBOOK_TABS: NotebookTab[] = ["library", "research", "chat", "studio", "assets"];

export type NotebookSource = { id: string; title: string; content: string };

/**
 * Studio outputs mirror the local notebook's, minus the ones that need a media
 * provider. Audio and presentation generation are deliberately absent: naming
 * them here would promise an output this lane cannot produce.
 */
export const NOTEBOOK_STUDIO_OUTPUTS = [
  { key: "outline", label: "Outline", goal: "Write a structured outline of the source material: the sections, what each one must establish, and the order that makes the argument land." },
  { key: "summary", label: "Summary", goal: "Write a faithful summary of the source material: the claims it makes, the evidence it offers, and what it leaves unresolved." },
  { key: "briefing", label: "Briefing", goal: "Write a briefing document from the source material: what a reader must know, the decisions it implies, and the questions still open." },
  { key: "questions", label: "Study questions", goal: "Write study questions that test genuine understanding of the source material, each with an answer drawn only from the sources." },
] as const;

export type NotebookStudioOutput = (typeof NOTEBOOK_STUDIO_OUTPUTS)[number]["key"];

const MAX_SOURCE_CHARS = 6_000;
const CHAT_SOURCE_BUDGET = 14_000;
const STUDIO_SOURCE_BUDGET = 7_000;

/**
 * The one rule both grounded lanes share. It is stated to the model rather than
 * assumed, because nothing in this lane crawls, searches, or opens a link — an
 * answer that implied otherwise would be a claim the runtime cannot support.
 */
export const NOTEBOOK_GROUNDING_RULE =
  "Answer only from the sources above. Where they do not settle the question, say so plainly instead of filling the gap. Do not claim to have opened a link, run a search, or read anything that is not included here.";

/**
 * Renders selected tenant records as labelled source blocks within a budget.
 * Truncation is marked in the text so a shortened source is never passed to the
 * model as though it were whole.
 */
export function notebookSourceBlock(sources: NotebookSource[], budget: number) {
  let remaining = budget;
  const blocks: string[] = [];
  for (const [index, source] of sources.entries()) {
    if (remaining <= 0) break;
    const body = source.content.trim();
    const allowance = Math.min(MAX_SOURCE_CHARS, remaining);
    const text = body.length > allowance ? `${body.slice(0, allowance)}\n[source truncated]` : body;
    remaining -= text.length;
    blocks.push(`### Source ${index + 1}: ${source.title.trim() || "Untitled source"}\n${text}`);
  }
  return blocks.join("\n\n");
}

export function notebookChatPrompt(input: { question: string; sources: NotebookSource[] }) {
  const question = input.question.trim();
  if (!question) return "";
  const block = notebookSourceBlock(input.sources, CHAT_SOURCE_BUDGET);
  return [
    "You are answering questions about a client's own notebook sources inside the Veloce hosted runtime.",
    `## Sources\n\n${block || "No sources were selected for this question."}`,
    NOTEBOOK_GROUNDING_RULE,
    `## Question\n\n${question}`,
  ].join("\n\n").slice(0, 20_000);
}

export function notebookStudioGoal(input: { output: NotebookStudioOutput; instruction?: string; sources: NotebookSource[] }) {
  const preset = NOTEBOOK_STUDIO_OUTPUTS.find((item) => item.key === input.output) ?? NOTEBOOK_STUDIO_OUTPUTS[0];
  const instruction = input.instruction?.trim();
  const block = notebookSourceBlock(input.sources, STUDIO_SOURCE_BUDGET);
  return [
    preset.goal,
    instruction ? `Additional direction: ${instruction}` : "",
    block ? `## Sources\n\n${block}` : "",
    NOTEBOOK_GROUNDING_RULE,
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}

export function notebookStudioOutput(key: string): NotebookStudioOutput {
  return NOTEBOOK_STUDIO_OUTPUTS.find((item) => item.key === key)?.key ?? "outline";
}
