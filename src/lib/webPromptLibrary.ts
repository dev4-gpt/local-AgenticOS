export type WebPromptTemplateId = "golden" | "saas" | "agency" | "personal";

export interface WebPromptTemplate {
  id: WebPromptTemplateId;
  label: string;
  description: string;
  type: "SaaS" | "Agency" | "Personal brand";
  goal: string;
  pages: string;
  style: string;
  story: string;
  cta: string;
  prompt: string;
}

export const ADVANCED_WEBSITE_STANDARD = `## Mandatory Website System
- Use the Website Structure Framework: Hero → social proof → problem → solution → features → testimonials/proof → CTA → footer. Add pricing, FAQ, comparison, case study, or contact sections only where they improve the buyer journey.
- Use the selected Storyline Framework to create a narrative, not a stack of unrelated sections.
- Make every section answer: Why should I care? Why should I trust this? Why act now?
- Build the Animation Framework intentionally: hero entrance; staggered feature reveals; stable testimonial/card hover feedback; CTA micro-interactions; smooth-scroll navigation. Use transform/opacity, 150–300ms micro-interactions, and respect prefers-reduced-motion. Do not add continuous decorative animation.
- Run UI UX Pro Max before implementation when available: \`python3 "$HOME/.codex/skills/ui-ux-pro-max/scripts/search.py" "<product> <industry> <style>" --design-system -p "<project>" -f markdown\`, then use the relevant Next.js/UX guidance.
- Use 21st.dev selectively, never blindly: \`21st search "<needed component>" --type c --limit 8\`, inspect candidates with \`21st get <id>\`, then install only a component that serves the brief. Keep dependencies minimal and review imported code.
- Use Framer Motion for the motion plan if the stack supports it. Keep interaction states accessible, keyboard-friendly, responsive at 375px/768px/1024px/1440px, and visually stable.
- Use real, inspectable media or carefully generated assets where imagery matters; never leave empty decorative placeholders.
- Do not expose secrets, add keys to source, or publish/deploy without explicit approval.

## Delivery Standard
Run the relevant build and tests. Check desktop and mobile layouts, all CTAs/forms, visible focus states, semantic structure, image alt text, contrast, and the primary conversion flow before handoff.`;

export const WEB_PROMPT_LIBRARY: WebPromptTemplate[] = [
  {
    id: "golden",
    label: "Golden Website Prompt",
    description: "A complete client-specific brief for premium conversion sites.",
    type: "Agency",
    goal: "Lead generation",
    pages: "Home, Services, Case Studies, About, Contact",
    style: "Premium, modern, confident, editorial; original system inspired by high-quality SaaS clarity",
    story: "Problem → why existing solutions fail → our solution → benefits → proof → CTA",
    cta: "Book a strategy call",
    prompt: `Create a premium website for a clearly defined audience and conversion goal. Establish the offer, proof, message hierarchy, and next action in the first viewport. Build a distinct design system rather than imitating another brand.`,
  },
  {
    id: "saas",
    label: "SaaS Website",
    description: "Product-led landing page with proof, product clarity, pricing, and FAQ.",
    type: "SaaS",
    goal: "Drive qualified demos or trials",
    pages: "Home, Product, Pricing, Customers, Security, Contact",
    style: "Clear, product-led, high-trust B2B SaaS; precise typography and calm interactive product moments",
    story: "Dream outcome → current workflow struggle → product transformation → customer case study → offer → CTA",
    cta: "Start a free trial",
    prompt: `Create a premium SaaS website for an AI automation platform. Explain the product outcome before features, use real product states where possible, include pricing, FAQ, and a conversion path to demo or trial. The site should feel clear, credible, and fast rather than decorative.`,
  },
  {
    id: "agency",
    label: "Agency Website",
    description: "Authority-led service site for lead generation and trust building.",
    type: "Agency",
    goal: "Generate qualified strategy calls",
    pages: "Home, Services, Work, Process, Insights, Contact",
    style: "Minimal luxury with bold typography, strong contrast, disciplined motion, and tangible proof",
    story: "The problem → why typical agencies underperform → our method → work/results → engagement offer → CTA",
    cta: "Book a strategy call",
    prompt: `Create a premium agency website for a team offering UGC content, performance marketing, and creative strategy. Lead with a sharp point of view and outcomes, then prove it through work, process, metrics, and testimonials. Prioritize authority, trust, and an easy path to a qualified conversation.`,
  },
  {
    id: "personal",
    label: "Personal Brand Website",
    description: "Founder-led site that turns credibility, perspective, and work into conversations.",
    type: "Personal brand",
    goal: "Build trust and create speaking, advisory, or client opportunities",
    pages: "Home, About, Work, Writing, Testimonials, Contact",
    style: "Modern founder editorial; cinematic restraint, personal proof, readable long-form content",
    story: "Founder challenge → journey → point of view → solutions/work → results → invitation",
    cta: "Start a conversation",
    prompt: `Create a personal brand website for an entrepreneur. Make the person, their perspective, achievements, case studies, testimonials, and contact path feel coherent. It should be intimate but business-useful: a visitor understands who this person helps, why they are credible, and how to work with them.`,
  },
];

export function promptLibraryMarkdown(): string {
  return `---\ntags: [agentic-os, web-studio, prompts, website-agency]\n---\n\n# Website Prompt Library\n\nThis library turns a website brief into a repeatable production workflow: research → message → structure → build → review → delivery.\n\n${WEB_PROMPT_LIBRARY.map((item) => `## ${item.label}\n\n${item.description}\n\n### Starting Prompt\n\n${item.prompt}\n\n### Default Storyline\n\n${item.story}\n\n### Default Direction\n\n- Goal: ${item.goal}\n- Pages: ${item.pages}\n- Style: ${item.style}\n- CTA: ${item.cta}\n\n`).join("\n")}# Advanced Standard For Every Website\n\n${ADVANCED_WEBSITE_STANDARD}\n\n# Repeatable Workflow\n\n1. Capture the client brief and success metric.\n2. Research audience language, alternatives, proof, and objections.\n3. Choose a prompt template and storyline.\n4. Run the UI UX Pro Max design-system pass and inspect 21st.dev components only where a component is genuinely useful.\n5. Build with the Website Structure Framework, the Animation Framework, and conversion checkpoints.\n6. Test, review, deliver, then save reusable learnings back into the library.\n`;
}
