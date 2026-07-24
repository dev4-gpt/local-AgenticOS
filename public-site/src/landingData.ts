import approvalEclipse from "./assets/approval-eclipse.jpg";
import cosmicIgnition from "./assets/cosmic-ignition.jpg";
import orbitObservatory from "./assets/orbit-observatory.jpg";

export const CHAPTERS = [
  ["Command", "Fragmented work becomes a coordinated operating view.", "Every brief, decision, research thread, and open task lives in one place instead of six tabs and a group chat."],
  ["Context", "Approved reasoning becomes reusable memory.", "Client context, prior decisions, and grounded research become a private foundation your team can build on instead of re-explaining."],
  ["Orchestrate", "Work travels through accountable lanes.", "Intake, research, positioning, and build handoff move through deliberate workflows, not a blank prompt every time."],
  ["Create", "Strategy becomes an original, production-ready asset direction.", "Approved positioning turns into web, content, and creative direction, ready for a human to finish and ship."],
  ["Govern", "Automation operates within explicit human and cost boundaries.", "Every external action has an owner, an approval state, a reason, and a spending cap. No surprise publishing, ever."],
  ["Deliver", "Approved work becomes visible outcomes and reusable playbooks.", "Delivery progress, approval speed, and model spend resolve into one operating rhythm your team can repeat."],
] as const;

export const COSMIC_WORLDS = [
  cosmicIgnition,
  orbitObservatory,
  orbitObservatory,
  orbitObservatory,
  approvalEclipse,
  cosmicIgnition,
] as const;

export { cosmicIgnition };
