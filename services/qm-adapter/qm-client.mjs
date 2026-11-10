// Signed client for one QM instance (ADR-011). Pure ESM with injectable fetch and clock, so it is tested without a
// server. The signing secret stays inside this module: it is never returned, logged or put in an error.
import { createHmac, randomUUID } from "node:crypto";

export const QM_TIMEOUT_MS = 10_000;
export const MAX_REPLY_CHARS = 30_000;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** QM's request signature: HMAC-SHA256 over "v0:<seconds>:<METHOD>\n<path?query>\n<body>". */
export function signQmRequest(secret, timestampSec, method, pathWithQuery, body = "") {
  const canonical = `${method}\n${pathWithQuery}\n${body}`;
  return `v0=${createHmac("sha256", secret).update(`v0:${timestampSec}:${canonical}`).digest("hex")}`;
}

/** Maps a QM run record to the h1 task state. Anything not understood is "failed", never "succeeded". */
export function mapQmRun(run) {
  const status = run && typeof run === "object" ? run.status : undefined;
  if (status === "pending") return { state: "queued" };
  if (status === "running") return { state: "running" };
  if (status === "done") {
    const result = run.result && typeof run.result === "object" ? run.result : {};
    if (result.status === "ok") return { state: "succeeded", reply: typeof result.reply === "string" ? result.reply.slice(0, MAX_REPLY_CHARS) : "" };
    if (result.status === "aborted" || result.status === "cancelled") return { state: "cancelled" };
  }
  return { state: "failed" };
}

export function createQmClient({ baseUrl, signingSecret, actorId = "veloce-qm-adapter", fetchImpl = fetch, now = Date.now, timeoutMs = QM_TIMEOUT_MS }) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error("QM base URL is not a valid URL");
  }
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || (base.pathname !== "/" && base.pathname !== "")) {
    throw new Error("QM base URL must be http(s) with no credentials and no path");
  }
  if (typeof signingSecret !== "string" || signingSecret.trim().length < 32) throw new Error("QM signing secret must be at least 32 characters");
  if (typeof actorId !== "string" || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(actorId)) throw new Error("QM actor id is not valid");

  async function call(method, pathWithQuery, payload) {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const timestamp = Math.floor(now() / 1000);
    try {
      const response = await fetchImpl(new URL(pathWithQuery, base), {
        method,
        headers: {
          "x-timestamp": String(timestamp),
          "x-signature": signQmRequest(signingSecret, timestamp, method, pathWithQuery, body),
          "x-event-id": randomUUID(),
          "content-type": "application/json",
        },
        body: body || undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { status: response.status, json };
    } catch {
      return { status: 0, json: null }; // network failure or timeout; the cause is not passed on
    }
  }

  return {
    async health() {
      return (await call("GET", "/healthz")).status === 200;
    },
    async submit({ text, threadRef }) {
      const result = await call("POST", "/v1/turns?async=1", {
        text,
        surface: "api",
        actor: { externalId: actorId },
        conversation: { kind: "dm", threadRef },
      });
      const runId = result.json?.runId;
      return result.status === 202 && typeof runId === "string" && RUN_ID.test(runId) ? { ok: true, runId } : { ok: false };
    },
    async getRun(runId) {
      if (!RUN_ID.test(runId)) return { ok: false, notFound: true };
      const result = await call("GET", `/v1/runs/${runId}`);
      if (result.status === 404) return { ok: false, notFound: true };
      return result.status === 200 && result.json ? { ok: true, ...mapQmRun(result.json) } : { ok: false };
    },
    async abort(runId) {
      if (!RUN_ID.test(runId)) return { ok: false, notFound: true };
      const result = await call("POST", `/v1/runs/${runId}/signal`, { kind: "abort" });
      if (result.status === 404) return { ok: false, notFound: true };
      if (result.status === 200 && result.json?.accepted === true) return { ok: true, accepted: true };
      if (result.status === 409 && result.json?.accepted === false) return { ok: true, accepted: false };
      return { ok: false };
    },
  };
}
