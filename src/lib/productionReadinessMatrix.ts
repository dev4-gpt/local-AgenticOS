import { V96_STARRED_PORTFOLIO, type V96StarredPortfolioEntry } from "@/lib/v96StarredPortfolio";

export type ProductionReadinessStatus =
  | "end-to-end-current-revision"
  | "source-tests-cloud-evidence-stale"
  | "contract-static-only"
  | "pilot-isolated-worker"
  | "operator-only"
  | "reference-only"
  | "blocked-review";

export interface ProductionReadinessRow {
  fullName: string;
  sourceUrl: string;
  sourceCommit: string;
  license: string;
  category: V96StarredPortfolioEntry["category"];
  runtime: V96StarredPortfolioEntry["runtime"];
  permissions: readonly string[];
  activation: V96StarredPortfolioEntry["activation"];
  status: ProductionReadinessStatus;
  evidenceRevision: string;
  nextGate: string;
}

export const CURRENT_EVIDENCE_REVISION = "source-main-6f23940; cloud evidence requires refreshed named revision";

function readinessStatus(entry: V96StarredPortfolioEntry): ProductionReadinessStatus {
  if (entry.licenseStatus !== "confirmed" || /GPL|AGPL/i.test(entry.license)) return "blocked-review";
  if (entry.activation === "reference-only") return "reference-only";
  if (entry.activation === "externally-gated") return entry.runtime === "gpu-worker" || entry.runtime === "operator-worker" ? "pilot-isolated-worker" : "contract-static-only";
  if (entry.activation === "native-enabled") return "source-tests-cloud-evidence-stale";
  return "contract-static-only";
}

export const PRODUCTION_READINESS_MATRIX: readonly ProductionReadinessRow[] = V96_STARRED_PORTFOLIO.map((entry) => ({
  fullName: entry.fullName,
  sourceUrl: entry.sourceUrl,
  sourceCommit: entry.sourceCommit,
  license: entry.license,
  category: entry.category,
  runtime: entry.runtime,
  permissions: entry.executionPermissions,
  activation: entry.activation,
  status: readinessStatus(entry),
  evidenceRevision: CURRENT_EVIDENCE_REVISION,
  nextGate: entry.evidenceGate,
}));

export function productionReadinessSummary(rows: readonly ProductionReadinessRow[] = PRODUCTION_READINESS_MATRIX) {
  return rows.reduce<Record<ProductionReadinessStatus, number>>((summary, row) => {
    summary[row.status] += 1;
    return summary;
  }, {
    "end-to-end-current-revision": 0,
    "source-tests-cloud-evidence-stale": 0,
    "contract-static-only": 0,
    "pilot-isolated-worker": 0,
    "operator-only": 0,
    "reference-only": 0,
    "blocked-review": 0,
  });
}
