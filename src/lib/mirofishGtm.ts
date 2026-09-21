/**
 * A clean-room scenario exercise inspired by MiroFish's documented workflow:
 * seed material → personas → scenarios → report. It does not import MiroFish,
 * emulate a real population, or make predictions. The result is a bounded set
 * of GTM hypotheses that must be validated with real customer evidence.
 */
export const MIROFISH_GTM_METHOD_VERSION = "mirofish-inspired-gtm-v1";

const GTM_SIGNAL = /\b(gtm|go[- ]to[- ]market|launch|positioning|acquisition|channel|audience|icp|demand gen|growth)\b/i;

export function shouldRunMirofishGtmTest(input: { title: string; idea: string }) {
  return GTM_SIGNAL.test(`${input.title}\n${input.idea}`);
}

export function mirofishGtmMethodology(format: "hosted" | "local" = "hosted") {
  return [
    `Apply ${MIROFISH_GTM_METHOD_VERSION}, a scenario-analysis method rather than a forecast:`,
    "1. Separate supplied facts from assumptions; never invent market evidence.",
    "2. Define 2–3 buyer or user segments with a job-to-be-done, adoption trigger, and friction.",
    "3. Compare a base, upside, and downside adoption scenario; name the signal that would distinguish them.",
    "4. Turn the highest-value uncertainty into a small, consent-based validation experiment.",
    "5. State a kill, iterate, or scale decision rule before recommending execution.",
    `In ${format === "local" ? "the Approach section" : "the PLAN section"}, include a bold **GTM scenario test** bullet that names the audience, hypothesis, test channel, success metric, and decision rule.`,
    `In ${format === "local" ? "First milestones" : "TASKS"}, include at least one evidence-gathering task and one human review task. Treat all scenario findings as hypotheses, not customer facts or forecasts.`,
  ].join("\n");
}

export function mirofishGtmFallbackPlan(title: string) {
  return `**What it is** — ${title}.

**Approach**
- **GTM scenario test** — Audience, hypothesis, test channel, success metric, and kill/iterate/scale threshold must be specified by the reviewer before running an experiment.
- Record supplied facts separately from assumptions. No customer evidence or scenario results have been generated.
- Define 2–3 candidate buyer segments and compare base, upside, and downside scenarios after collecting evidence.

**First milestones**
- [ ] Gather customer evidence with consent and record its source
- [ ] Have a human reviewer choose the audience, channel, metric, and decision threshold
- [ ] Run a bounded experiment and review results before deciding whether to kill, iterate, or scale

**Who builds it** — researcher, experiment owner, human reviewer.

_(Planning template only: model generation was unavailable. These are untested hypotheses, not forecasts.)_`;
}
