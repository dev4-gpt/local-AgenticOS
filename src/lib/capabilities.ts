export type CapabilityAudience = "built-in" | "operator";
export type CapabilityKind = "skill" | "connector" | "policy";
export type CapabilityStatus = "active" | "reviewed" | "planned";

export interface Capability {
  id: string;
  name: string;
  kind: CapabilityKind;
  audience: CapabilityAudience;
  status: CapabilityStatus;
  destination?: string;
  description: string;
  dataScope: string;
  actionBoundary: string;
}

// This registry is deliberately explicit. A listed capability is a reviewed
// product contract, not an unrestricted ability for a client to run arbitrary tools.
export const CAPABILITIES: Capability[] = [
  {
    id: "web-studio", name: "Veloce Web Studio", kind: "skill", audience: "built-in", status: "active", destination: "/web-studio",
    description: "Original conversion structure, responsive UI direction, controlled components, and implementation handoff.",
    dataScope: "Approved project brief and client-provided brand material.", actionBoundary: "Creates briefs and builds for human review; never publishes by itself.",
  },
  {
    id: "design-intelligence", name: "Veloce Design Intelligence", kind: "skill", audience: "built-in", status: "active", destination: "/web-studio",
    description: "Curated conversion, immersive-operational, and product-clarity profiles for hierarchy, motion, accessibility, and component review.",
    dataScope: "Approved project brief and selected visual direction.", actionBoundary: "Applies reviewed standards only; external components and MCPs remain operator-reviewed.",
  },
  {
    id: "immersive-scroll-site", name: "Immersive Scroll Site", kind: "skill", audience: "built-in", status: "active", destination: "/web-studio",
    description: "Provider-neutral original scroll-story system with bounded procedural depth, real operating artifacts, and mandatory WebGL/reduced-motion fallbacks.",
    dataScope: "Approved project brief, selected design profile, and owned or licensed visual material.", actionBoundary: "Creates a reviewable design/build handoff only; never copies references, publishes, or configures external services by itself.",
  },
  {
    id: "asset-sequencing", name: "Scroll Asset Sequencing", kind: "skill", audience: "built-in", status: "active", destination: "/flow-lab",
    description: "Turns owned start/end visuals into a capped, compressed, scroll-linked frame sequence with selective preload and static fallbacks.",
    dataScope: "Owned, generated, or explicitly licensed frames and an approved motion brief.", actionBoundary: "Creates a reviewed implementation handoff; never ingests third-party reference frames or publishes by itself.",
  },
  {
    id: "flow-lab", name: "Flow Lab", kind: "skill", audience: "built-in", status: "active", destination: "/flow-lab",
    description: "Permission-first study of websites, repositories, videos, and recordings to produce an original scene and motion brief.",
    dataScope: "Declared source and approved observations only.", actionBoundary: "Rejects clone requests and records originality guardrails.",
  },
  {
    id: "owned-site-recovery", name: "Authorized Site Replication", kind: "skill", audience: "operator", status: "active", destination: "/flow-lab",
    description: "Provenance-tracked modernization, authorized rebuild, or component extraction plan for a client-owned site.",
    dataScope: "Client-provided repository, export, asset archive, or written owner-authorized source package.", actionBoundary: "Requires ownership attestation and operator review; never scrapes or downloads public sites.",
  },
  {
    id: "knowledge", name: "Veloce Knowledge", kind: "skill", audience: "built-in", status: "active", destination: "/memory",
    description: "Grounded retrieval across the private vault, Graphify, approved notes, and project decisions.",
    dataScope: "Client-scoped vault content only.", actionBoundary: "Never reveals another client area, raw credentials, or unapproved source material.",
  },
  {
    id: "delivery", name: "Veloce Delivery", kind: "skill", audience: "built-in", status: "active", destination: "/pipeline",
    description: "Moves work from intake through task design, review, approval, and reusable delivery records.",
    dataScope: "The selected project and its approved deliverables.", actionBoundary: "Every external result remains human-approved.",
  },
  {
    id: "quality", name: "Veloce Quality Review", kind: "skill", audience: "built-in", status: "reviewed", destination: "/guide",
    description: "Responsive, accessibility, visual-regression, source-attribution, and secret-leakage review guidance.",
    dataScope: "Veloce-owned or authorized preview environments.", actionBoundary: "Read-only checks before release; no unattended fixes or deployments.",
  },
  {
    id: "security-release-review", name: "Veloce Security Release Review", kind: "skill", audience: "operator", status: "active", destination: "/capabilities",
    description: "Authorization, release-gate, finding, remediation, and retest workflow informed by PentAGI and HexStrike AI.",
    dataScope: "Veloce-owned loopback or explicitly authorized staging environments and private assessment reports.", actionBoundary: "Manual, isolated, human-supervised assessment only; neither pentest framework is exposed as a product MCP or client tool.",
  },
  {
    id: "single-tenant-client-deployment", name: "Veloce Client Deployment", kind: "skill", audience: "operator", status: "reviewed", destination: "/capabilities",
    description: "Produces isolated client cloud environments from one versioned product image, with tenant-scoped identity, storage, secrets, workers, budgets, and updates.",
    dataScope: "Approved client configuration, infrastructure metadata, capability allowlist, and non-secret deployment evidence.", actionBoundary: "Never deploys the private operator OS, personal subscription credentials, arbitrary shell access, or cross-client data surfaces.",
  },
  {
    id: "obsidian", name: "Obsidian Vault", kind: "connector", audience: "built-in", status: "active", destination: "/memory",
    description: "Local-first project memory, decisions, journals, and approved Flow Lab briefs.",
    dataScope: "Configured local vault and client namespace.", actionBoundary: "Local-only; no public exposure or cross-client access.",
  },
  {
    id: "graphify", name: "Graphify", kind: "connector", audience: "built-in", status: "active", destination: "/memory",
    description: "Relationship mapping for approved project knowledge and source-linked notes.",
    dataScope: "Selected vault collections.", actionBoundary: "Rebuilds and queries stay inside the configured vault boundary.",
  },
  {
    id: "agent-reach", name: "AgentReach Research", kind: "connector", audience: "operator", status: "active", destination: "/integrations",
    description: "Routes read-only research through reviewed web, GitHub, video, RSS, and optional authenticated social-source tools.",
    dataScope: "Public sources and content the operator is already authorized to access, with source attribution retained.", actionBoundary: "No paywall bypass, credential sharing, posting, liking, commenting, or unattended account automation; cookie-backed channels require a dedicated account and operator approval.",
  },
  {
    id: "hermes-mcp", name: "Hermes MCP Catalog", kind: "connector", audience: "operator", status: "active", destination: "/hermes",
    description: "Operator-managed MCP tools for the established Hermes environment.",
    dataScope: "Explicitly configured provider and tool scopes.", actionBoundary: "Clients consume approved outcomes, not raw connector administration.",
  },
  {
    id: "provider-routing", name: "Provider Routing", kind: "policy", audience: "operator", status: "active", destination: "/integrations",
    description: "Routes work between local, value-cloud, and premium-cloud models with spend and approval rules.",
    dataScope: "Per-provider configuration and per-client budget records.", actionBoundary: "No shared personal keys; overages require approval.",
  },
];
