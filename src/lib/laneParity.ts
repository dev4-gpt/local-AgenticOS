/**
 * The declared local↔hosted lane map.
 *
 * Local and cloud are one OS shipped in one image; only a tenant's content and
 * their GCP secrets differ. But a capability is usually implemented twice —
 * once as an operator lane that reads the machine (`os.homedir()`, `~/.hermes`)
 * and once as a tenant-scoped hosted lane that must not. Before this file the
 * pairing existed only implicitly across roughly 55 filesystem-backed libs and
 * 39 `client*` libs, with **no name-matched pairs**, so nothing recorded which
 * hosted lane was supposed to keep up with which local one.
 *
 * This map is documentation as code. It does not execute anything; it exists so
 * that "is this capability at parity?" has an answer that can be read and
 * tested rather than remembered.
 *
 * @see docs/V96-EXTERNAL-CORPUS-INTEGRATION.md — Wave 2, parity spine
 * @see docs/local-to-cloud-client-product-model.md — graduation contract
 */

export type LaneParityStatus =
  /** Both lanes exist. The hosted lane is the one a tenant reaches. */
  | "paired"
  /** Operator-only by design. There is no tenant equivalent and none is owed. */
  | "local-only"
  /** Hosted-only. Nothing local backs it; usually a cloud-native concern. */
  | "hosted-only";

export interface LaneParityEntry {
  /** Capability or surface family this pair serves. */
  capability: string;
  /** Operator lane module under `src/lib`, without extension. */
  localLane: string | null;
  /** Tenant-scoped lane module under `src/lib`, without extension. */
  hostedLane: string | null;
  status: LaneParityStatus;
  /** Why, when the status is not a plain pairing. */
  note?: string;
}

export const LANE_PARITY: readonly LaneParityEntry[] = [
  { capability: "loop", localLane: "loopEngine", hostedLane: "clientLoopAdapter", status: "paired", note: "loopEngine reads ~/.hermes and is not tenant-safe; the hosted lane is the typed contract." },
  { capability: "hermes-content-factory", localLane: "hermesContentFactoryLocal", hostedLane: "clientHermesContentFactory", status: "paired" },
  { capability: "pipeline", localLane: "pipeline", hostedLane: "clientPipelineAdapter", status: "paired" },
  { capability: "ruflo", localLane: "rufloExec", hostedLane: "clientRufloAdapter", status: "paired" },
  { capability: "room", localLane: "agentRoom", hostedLane: "clientRoomAdapter", status: "paired" },
  { capability: "boards", localLane: "kanbanWorkspace", hostedLane: "clientBoardAdapter", status: "paired" },
  { capability: "seo", localLane: "seoPipeline", hostedLane: "clientSeoAdapter", status: "paired" },
  { capability: "video", localLane: "videoWorkspace", hostedLane: "clientVideoWorkspace", status: "paired" },
  { capability: "notebook", localLane: "notebooklmStorage", hostedLane: "clientNotebookLanes", status: "paired" },
  { capability: "media", localLane: "musicStudio", hostedLane: "clientMediaAdapter", status: "paired", note: "One hosted adapter serves several local studio lanes." },

  // Cloud-native concerns with nothing local behind them.
  { capability: "intent-routing", localLane: null, hostedLane: "clientIntentRouter", status: "hosted-only", note: "Same code runs locally; there is no separate operator implementation." },
  { capability: "playbooks", localLane: null, hostedLane: "clientPlaybooks", status: "hosted-only" },
  { capability: "traits", localLane: null, hostedLane: "capabilityTraits", status: "hosted-only" },
  { capability: "data-plane", localLane: null, hostedLane: "clientDataPlane", status: "hosted-only", note: "Queue and rate limits are cloud infrastructure. Their absence locally is why a local provider smoke stops at model_not_allowlisted." },
];

/**
 * Modules that must never appear in a hosted lane's import graph. These are the
 * markers of an operator-machine dependency: a lane carrying one of them works
 * on the author's laptop and fails for every tenant.
 */
export const FILESYSTEM_LANE_MARKERS = ["os.homedir()", "~/.hermes", "process.env.HOME"] as const;

/**
 * The shared registries a playbook can reach. If any of these transitively
 * imports a filesystem-backed lane, a playbook can be selected in cloud and
 * fail there while passing locally — the exact asymmetry this wave exists to
 * prevent. `tests/lane-parity.spec.ts` asserts it.
 */
export const PARITY_PROTECTED_MODULES = [
  "src/lib/clientPlaybooks.ts",
  "src/lib/clientIntentRouter.ts",
  "src/lib/capabilityTraits.ts",
  "src/lib/v96SkillPack.ts",
  "src/lib/v96Contracts.ts",
  "src/lib/v96RepositoryCatalog.ts",
] as const;

export function pairedLanes() {
  return LANE_PARITY.filter((entry) => entry.status === "paired");
}

export function laneParityFor(capability: string) {
  return LANE_PARITY.find((entry) => entry.capability === capability) ?? null;
}
