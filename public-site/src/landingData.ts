import approvalEclipse from "./assets/approval-eclipse.jpg";
import cosmicIgnition from "./assets/cosmic-ignition.jpg";
import orbitObservatory from "./assets/orbit-observatory.jpg";

export const CHAPTERS = [
  ["Signal", "The work is valuable. The handoffs are leaking it.", "Capture the fragments: client context, proof, decisions, constraints, and the questions that usually reset every project."],
  ["Memory", "Keep the reasoning, not just the final deck.", "Approved knowledge becomes a private project foundation that strategy, web, content, and delivery can use without starting blind."],
  ["Workflows", "Make excellent judgment repeatable without making it generic.", "Turn your best delivery moves into deliberate workflows: intake, research, positioning, build handoff, review, and reusable playbooks."],
  ["Human approval", "Agents can prepare. People remain accountable.", "Every external action has an owner, an approval state, and a clear reason. No autonomous publishing, outreach, or surprise decisions."],
  ["Measured delivery", "A better system should make its value visible.", "Track delivery progress, approval speed, reusable templates, qualified conversations, and model spending in one operating rhythm."],
  ["Engage", "Start with one broken handoff.", "We build the operating layer around the work your team already sells, then prove it through a focused 90-day engagement."],
] as const;

export const COSMIC_WORLDS = [
  cosmicIgnition,
  orbitObservatory,
  orbitObservatory,
  approvalEclipse,
  orbitObservatory,
  cosmicIgnition,
] as const;

export { cosmicIgnition };
