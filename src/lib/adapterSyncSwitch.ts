// The sync switch (ADR-019): parsing, error codes and plain words for the control on the Adapters page. No I/O here.
// The database functions decide who may change it and what is allowed; this only turns their answers into something safe
// to show. Anything unrecognised becomes "unavailable" and is never echoed.

export const SYNC_MODES = ["off", "1h", "4h", "24h", "always"] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

export type SyncSwitchStatus = {
  mode: "off" | "timed" | "always";
  onUntil: string | null;
  alwaysAllowed: boolean;
  syncNowPending: boolean;
  now: string;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v));

/** Reads the status the database gives. Anything that does not fit exactly is null, so a page never shows a guess. */
export function parseSyncSwitchStatus(value: unknown): SyncSwitchStatus | null {
  if (!isObject(value)) return null;
  const { mode, on_until, always_on_allowed, sync_now_pending, now } = value;
  if (mode !== "off" && mode !== "timed" && mode !== "always") return null;
  if (typeof always_on_allowed !== "boolean" || typeof sync_now_pending !== "boolean" || !isIso(now)) return null;
  if (on_until !== null && !isIso(on_until)) return null;
  if (mode === "timed" && on_until === null) return null;
  if (mode !== "timed" && on_until !== null) return null;
  return { mode, onUntil: on_until, alwaysAllowed: always_on_allowed, syncNowPending: sync_now_pending, now };
}

export type SyncSwitchErrorCode = "not_allowed" | "not_found" | "invalid_input" | "always_not_allowed" | "adapter_not_active" | "unavailable";

export const SYNC_SWITCH_HTTP_STATUS: Record<SyncSwitchErrorCode, number> = {
  not_allowed: 403,
  not_found: 404,
  invalid_input: 400,
  always_not_allowed: 403,
  adapter_not_active: 409,
  unavailable: 503,
};

const MESSAGE_CODES: Array<[string, SyncSwitchErrorCode]> = [
  ["adapter_sync_switch_always_not_allowed", "always_not_allowed"],
  ["adapter_sync_switch_adapter_not_active", "adapter_not_active"],
  ["adapter_sync_switch_bad_mode", "invalid_input"],
  ["adapter_sync_switch_not_found", "not_found"],
];

/** Turns a database refusal into a stable code. */
export function syncSwitchErrorFrom(result: { status: number; value: unknown }): SyncSwitchErrorCode {
  const body = isObject(result.value) ? result.value : {};
  const message = typeof body.message === "string" ? body.message : "";
  for (const [needle, code] of MESSAGE_CODES) if (message.includes(needle)) return code;
  if (result.status === 401 || result.status === 403) return "not_allowed";
  return "unavailable";
}

/** Whole minutes left, never negative. Pure: the clock is passed in, so the server's "now" is what counts. */
export function minutesLeft(onUntil: string, now: string): number {
  return Math.max(0, Math.ceil((Date.parse(onUntil) - Date.parse(now)) / 60_000));
}

/** "2 h 5 min left", "45 min left", "less than a minute left". */
export function timeLeftWords(minutes: number): string {
  if (minutes < 1) return "less than a minute left";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min left`;
  return rest === 0 ? `${hours} h left` : `${hours} h ${rest} min left`;
}

/** What each state means for the bill, in plain words. The figure is a rough guide for one adapter service kept warm. */
export function describeSyncSwitch(status: SyncSwitchStatus): { headline: string; detail: string } {
  if (status.mode === "always") {
    return { headline: "Always on", detail: "Syncing every few minutes with no end. This keeps the adapter's service running all day, which costs roughly $50 a month." };
  }
  if (status.mode === "timed" && status.onUntil) {
    return { headline: `On, ${timeLeftWords(minutesLeft(status.onUntil, status.now))}`, detail: "Syncing every few minutes while the adapter's service stays running. It switches itself off at the end." };
  }
  return { headline: "Off", detail: "Nothing calls the adapter, so its service can stop and costs nothing. Deletions still go out on their own, and Sync now runs one sync." };
}
