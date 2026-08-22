export type CostRoute = "native" | "free-worker" | "byok" | "veloce-managed" | "blocked";

export interface CostRouteInput {
  nativeAvailable?: boolean;
  freeWorkerAvailable?: boolean;
  byokConnected?: boolean;
  managedEnabled?: boolean;
  managedBudgetAllowed?: boolean;
  providerApproved?: boolean;
}

export function resolveCostRoute(input: CostRouteInput): { route: CostRoute; reason: string } {
  if (input.nativeAvailable) return { route: "native", reason: "native Veloce contract is preferred" };
  if (input.freeWorkerAvailable) return { route: "free-worker", reason: "approved free/open-source worker is preferred" };
  if (input.byokConnected && input.providerApproved !== false) return { route: "byok", reason: "customer-owned provider credential is connected" };
  if (input.managedEnabled && input.managedBudgetAllowed && input.providerApproved !== false) return { route: "veloce-managed", reason: "managed credential is explicitly enabled and budget-approved" };
  return { route: "blocked", reason: "no permitted route remains; execution fails closed" };
}

export interface FreeTierLimit { provider: string; dailyRequests: number; monthlyUnits: number; maxConcurrency: number; }
export const FREE_TIER_LIMITS: readonly FreeTierLimit[] = [
  { provider: "brave", dailyRequests: 10, monthlyUnits: 1000, maxConcurrency: 1 },
  { provider: "jina-reader", dailyRequests: 100, monthlyUnits: 5000, maxConcurrency: 2 },
  { provider: "firecrawl", dailyRequests: 25, monthlyUnits: 1000, maxConcurrency: 1 },
  { provider: "openrouter-free", dailyRequests: 25, monthlyUnits: 750, maxConcurrency: 1 },
];

export function freeTierWithinLimit(provider: string, input: { dailyRequests: number; monthlyUnits: number; concurrent: number }) {
  const limit = FREE_TIER_LIMITS.find((item) => item.provider === provider);
  return Boolean(limit && input.dailyRequests < limit.dailyRequests && input.monthlyUnits < limit.monthlyUnits && input.concurrent < limit.maxConcurrency);
}
