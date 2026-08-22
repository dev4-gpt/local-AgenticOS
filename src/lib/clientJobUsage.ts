import { microsToUsageCredits } from "@/lib/usageCredits";

type RecordLike = Record<string, unknown>;

export type ClientJobUsage = {
  estimatedMicros: number | null;
  estimatedCredits: number | null;
  settledMicros: number | null;
  settledCredits: number | null;
  status: "not-estimated" | "estimated" | "settled" | "refunded";
  providerOwnership: "client-byok" | "veloce-managed" | "native";
  auditEvidence: {
    reservationLedger: boolean;
    settlementLedger: boolean;
    provider: string | null;
  };
};

export function presentClientJobUsage(input: {
  provider?: unknown;
  inputMetadata?: unknown;
  outputMetadata?: unknown;
  ledgerRecords?: readonly RecordLike[];
}): ClientJobUsage {
  const inputMetadata = asRecord(input.inputMetadata);
  const outputMetadata = asRecord(input.outputMetadata);
  const estimatedMicros = firstMicros(
    inputMetadata.estimatedCostMicros,
    asRecord(inputMetadata.usage).estimatedCostMicros,
    outputMetadata.estimatedCostMicros,
    asRecord(outputMetadata.usageMetadata).estimatedCostMicros,
  );
  const ledger = (input.ledgerRecords ?? []).filter((record) => Number.isSafeInteger(Number(record.amount_micros)) && Number(record.amount_micros) >= 0);
  const settledMicros = ledger.length ? ledger.reduce((sum, record) => sum + Math.round(Number(record.amount_micros)), 0) : null;
  const status = settledMicros === null
    ? estimatedMicros === null ? "not-estimated" : "estimated"
    : settledMicros === 0 && (outputMetadata.refunded === true || outputMetadata.failureDisposition === "refunded") ? "refunded"
      : "settled";
  const provider = typeof input.provider === "string" && input.provider.trim() ? input.provider.trim() : null;
  return {
    estimatedMicros,
    estimatedCredits: estimatedMicros === null ? null : microsToUsageCredits(estimatedMicros),
    settledMicros,
    settledCredits: settledMicros === null ? null : microsToUsageCredits(settledMicros),
    status,
    providerOwnership: provider ? "client-byok" : "native",
    auditEvidence: {
      reservationLedger: ledger.length > 0,
      settlementLedger: ledger.length > 0,
      provider,
    },
  };
}

function asRecord(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
}

function firstMicros(...values: unknown[]) {
  for (const value of values) {
    const number = typeof value === "number" ? value : Number(value);
    if (Number.isSafeInteger(number) && number >= 0) return Math.round(number);
  }
  return null;
}
