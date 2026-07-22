import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DESIGN_PROFILES, getDesignProfile, type DesignProfileId } from "./designIntelligence";
import { IMMERSIVE_SCROLL_PROVIDER_PROMPT, immersiveScrollSkillApplies } from "./immersiveScrollSkill";
import { VAULT_ROOT } from "./vault";

export type FlowReferenceType = "website" | "repository" | "screen-recording" | "video";
export type FlowAssetMode = "interactive-scene" | "svg-sequence" | "frame-sequence" | "motion-study";
export type FlowWorkflow = "original-study" | "owned-site-recovery";
export type RecoveryTemplate = "modernize" | "faithful-rebuild" | "component-extraction";

export interface FlowSequencePlan {
  frameCount?: number;
  frameFormat?: "webp" | "avif";
  aspectRatio?: "16:9" | "4:3" | "1:1" | "9:16";
  scrollScreens?: number;
}

export interface FlowLabRequest {
  sourceUrl: string;
  referenceType: FlowReferenceType;
  permission: "owned" | "authorized" | "public-reference";
  notes?: string;
  projectName?: string;
  assetMode?: FlowAssetMode;
  designProfile?: DesignProfileId;
  workflow?: FlowWorkflow;
  recoveryTemplate?: RecoveryTemplate;
  ownershipAttestation?: boolean;
  sequencePlan?: FlowSequencePlan;
}

export interface FlowLabBrief {
  title: string;
  markdown: string;
  guardrails: string[];
  source: Pick<FlowLabRequest, "sourceUrl" | "referenceType" | "permission">;
}

const ALLOWED_TYPES = new Set<FlowReferenceType>(["website", "repository", "screen-recording", "video"]);
const ALLOWED_PERMISSIONS = new Set<FlowLabRequest["permission"]>(["owned", "authorized", "public-reference"]);
const ALLOWED_ASSET_MODES = new Set<FlowAssetMode>(["interactive-scene", "svg-sequence", "frame-sequence", "motion-study"]);
const ALLOWED_DESIGN_PROFILES = new Set<DesignProfileId>(DESIGN_PROFILES.map((profile) => profile.id));
const ALLOWED_WORKFLOWS = new Set<FlowWorkflow>(["original-study", "owned-site-recovery"]);
const ALLOWED_RECOVERY_TEMPLATES = new Set<RecoveryTemplate>(["modernize", "faithful-rebuild", "component-extraction"]);

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function titleCase(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function createFlowBrief(input: FlowLabRequest): FlowLabBrief {
  const sourceUrl = clean(input.sourceUrl, 2048);
  const referenceType = input.referenceType;
  const permission = input.permission;
  const notes = clean(input.notes, 4000);
  const projectName = clean(input.projectName, 100) || "Untitled Veloce project";
  const assetMode = input.assetMode || "interactive-scene";
  const designProfile = input.designProfile || "conversion-editorial";
  const workflow = input.workflow || "original-study";
  const recoveryTemplate = input.recoveryTemplate || "modernize";
  const sequencePlan = {
    frameCount: Math.min(120, Math.max(24, Number(input.sequencePlan?.frameCount) || 96)),
    frameFormat: input.sequencePlan?.frameFormat === "avif" ? "avif" : "webp",
    aspectRatio: ["16:9", "4:3", "1:1", "9:16"].includes(input.sequencePlan?.aspectRatio || "") ? input.sequencePlan?.aspectRatio : "16:9",
    scrollScreens: Math.min(8, Math.max(2, Number(input.sequencePlan?.scrollScreens) || 4)),
  };

  if (!sourceUrl) throw new Error("Add a reference URL or local-file description.");
  if (!ALLOWED_TYPES.has(referenceType)) throw new Error("Unsupported reference type.");
  if (!ALLOWED_PERMISSIONS.has(permission)) throw new Error("Choose the reference permission basis.");
  if (!ALLOWED_ASSET_MODES.has(assetMode)) throw new Error("Choose an approved asset implementation mode.");
  if (!ALLOWED_DESIGN_PROFILES.has(designProfile)) throw new Error("Choose an approved Veloce design profile.");
  if (!ALLOWED_WORKFLOWS.has(workflow)) throw new Error("Choose an approved Flow Lab workflow.");
  if (!ALLOWED_RECOVERY_TEMPLATES.has(recoveryTemplate)) throw new Error("Choose an approved recovery template.");
  if (permission === "public-reference" && !/^https?:\/\//i.test(sourceUrl)) {
    throw new Error("Public references must use a public http(s) URL.");
  }
  if (workflow === "owned-site-recovery" && permission === "public-reference") {
    throw new Error("Owned Site Recovery requires a site you own or written owner authorization.");
  }
  if (workflow === "owned-site-recovery" && input.ownershipAttestation !== true) {
    throw new Error("Confirm that you own the site or have written authorization before preparing a recovery template.");
  }

  const sourceName = (() => {
    try { return titleCase(new URL(sourceUrl).hostname.replace(/^www\./, "")); }
    catch { return titleCase(sourceUrl.split("/").filter(Boolean).at(-1) || "Reference"); }
  })();
  const base = workflow === "owned-site-recovery" ? `${projectName} owned site recovery` : `${projectName} flow study`;
  const profile = getDesignProfile(designProfile);
  const guardrails = [
    "Use the reference for high-level interaction and narrative patterns only.",
    workflow === "owned-site-recovery"
      ? "Use only materials supplied by the verified owner or authorized client. Record provenance before reusing any source, asset, copy, or layout."
      : "Do not copy logos, images, text, source code, proprietary data, or distinctive page layouts.",
    workflow === "owned-site-recovery"
      ? "Document substitutions and create a maintainable client-owned implementation rather than a scraped replica."
      : "Create original copy, visual tokens, components, and motion for the client project.",
    "Keep all external publishing, outreach, and delivery behind human approval.",
  ];
  const recoveryRecipes: Record<RecoveryTemplate, string> = {
    modernize: "Preserve approved information architecture and business meaning while replacing the implementation with an accessible, responsive, maintainable Veloce-owned system.",
    "faithful-rebuild": "Recreate only the client-owned or explicitly authorized experience from supplied exports, screenshots, assets, and source material. Preserve attribution, document every substituted asset, and do not pull anything from a live public URL.",
    "component-extraction": "Inventory the supplied client-owned system, identify reusable primitives and tokens, then build a clean component library with explicit provenance for every imported asset or snippet.",
  };
  const assetRecipe: Record<FlowAssetMode, string> = {
    "interactive-scene": "Build an original procedural Three.js node-and-connection scene. Keep the active state, labels, and CTA in DOM. Use a static non-WebGL fallback.",
    "svg-sequence": "Draw original SVG paths between original nodes. Use stroke-dashoffset or a reviewed animation library. Never trace a reference illustration or logo.",
    "frame-sequence": "Use only owned or authorized frames. Compress responsive frames, preload a small lead window, cap the first release at 120 frames, and include a poster fallback.",
    "motion-study": "Use only owned or licensed video. Keep it decorative rather than essential, provide poster and reduced-motion fallbacks, and avoid embedding reference footage.",
  };
  const sequenceSection = assetMode === "frame-sequence" ? `### Owned frame-sequence production contract
- **Frames:** ${sequencePlan.frameCount} numbered ${sequencePlan.frameFormat.toUpperCase()} files
- **Composition:** ${sequencePlan.aspectRatio}; camera, lighting, subject scale, and background remain locked
- **Scroll distance:** ${sequencePlan.scrollScreens} viewport heights with natural scrub in both directions
- **Loading:** load the first and final frames first, then a moving lead window; never block the entire page on all frames
- **Rendering:** use a correctly sized sticky canvas and preserve contain/cover behavior across breakpoints
- **Fallbacks:** poster image, visible loading state, reduced-motion state, and semantic DOM copy/CTA
- **Source rule:** every frame must be owned, generated for this project, or explicitly licensed
- **Reusable implementation:** start from \`skills/veloce-asset-sequencing/assets/ScrollFrameSequence.tsx\`

` : "";
  const markdown = `---\ntags: [veloce-agenticos, flow-lab, website-strategy]\nreference: ${sourceUrl}\nreference_type: ${referenceType}\npermission: ${permission}\nasset_mode: ${assetMode}\ncreated: ${new Date().toISOString()}\n---\n\n# ${base}\n\n## Reference record\n- **Reference:** ${sourceUrl}\n- **Type:** ${referenceType}\n- **Permission basis:** ${permission}\n- **Study intent:** Extract narrative and interaction principles, then create an original Veloce-ready direction.\n\n## Source signal\n${notes || `Study ${sourceName} for its pacing, hierarchy, evidence, and interaction rhythm. No reference content is copied into this brief.`}\n\n## Original experience direction\n### Story arc\n1. **Command:** show the audience's fragmented work and the cost of lost context.\n2. **Context:** reveal how approved knowledge becomes a private, usable foundation.\n3. **Orchestrate:** show a clear sequence from intake to strategy to build handoff.\n4. **Create:** turn the strategy into a bounded, original asset direction.\n5. **Govern:** make human approval and cost boundaries visible before action is taken.\n6. **Deliver:** show progress, reusable outcomes, and one qualified next step.\n\n### Scene map\n- Start with one decisive visual object, not a dashboard collage.\n- Use a sticky depth scene to move through six named Veloce operating lenses.\n- Reveal real but fictionalized artifacts: a client signal card, knowledge node, workflow map, original asset brief, approval state, and spend meter.\n- Make every transition support the next decision; motion should clarify causality, never decorate empty space.\n\n### Approved asset recipe\n- **Mode:** ${assetMode}\n- ${assetRecipe[assetMode]}\n- Record source ownership, fallback state, expected asset weight, and approval owner before production.\n\n${sequenceSection}### Interaction inventory\n- Scroll-linked chapter progression with a visible progress rail.\n- One primary CTA per chapter, with keyboard-visible focus states.\n- Reduced-motion and non-WebGL fallbacks that retain the same story.\n- Responsive layout that replaces depth effects with clear vertical reading order on mobile.\n\n### Conversion narrative\n- Promise a managed operating system, not unrestricted agent access.\n- Prove human approval, private knowledge boundaries, and budget control before pricing.\n- Ask prospects to describe one broken handoff, then qualify the engagement.\n\n## Build handoff\nBuild an original, responsive Veloce AgenticOS service experience from this brief. Use a deep operational visual system, restrained warm signal accents, editorial hierarchy, scroll-linked depth, and clear service proof. Do not reproduce reference branding, copy, assets, code, or layout. Use controlled components only and preserve reduced-motion, keyboard, mobile, and performance fallbacks.\n\n## Guardrails\n${guardrails.map((item) => `- ${item}`).join("\n")}\n`;

  const recoverySection = workflow === "owned-site-recovery"
    ? `## Operator-only owned site recovery\n- **Recovery template:** ${recoveryTemplate}\n- **Execution rule:** ${recoveryRecipes[recoveryTemplate]}\n- **Required inputs:** client-provided repository, export, asset archive, or written owner-authorized source package.\n- **Prohibited inputs:** public-page scraping, copied third-party assets, extracted logos, or material without documented permission.\n- **Approval gate:** an operator must review ownership, supplied materials, and the output before a build starts.\n\n`
    : "";
  const enrichedMarkdown = markdown.replace(
    "## Original experience direction",
    `## Veloce Design Intelligence\n- **Profile:** ${profile.label}\n- **Intent:** ${profile.intent}\n- **Composition:** ${profile.composition}\n- **Motion:** ${profile.motion}\n- **Constraints:** ${profile.constraints}\n\n${immersiveScrollSkillApplies({ designProfile }) ? `${IMMERSIVE_SCROLL_PROVIDER_PROMPT}\n\n` : ""}${recoverySection}## Original experience direction`,
  );

  return { title: base, markdown: enrichedMarkdown, guardrails, source: { sourceUrl, referenceType, permission } };
}

export async function saveFlowBrief(brief: FlowLabBrief) {
  if (!VAULT_ROOT) throw new Error("Configure an Obsidian vault before saving a Flow Lab brief.");
  const directory = path.join(VAULT_ROOT, "Veloce AgenticOS", "Flow Lab");
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = brief.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "flow-study";
  const file = path.join(directory, `${stamp}-${slug}.md`);
  await mkdir(directory, { recursive: true });
  await writeFile(file, brief.markdown, "utf8");
  return path.relative(VAULT_ROOT, file);
}
