import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { NextResponse } from "next/server";
import { NO_STORE, readJsonObject } from "@/lib/adapterRouteGate";
import { handleModelCall, type ModelCallDeps, type ModelMessage } from "@/lib/adapterModelCall";
import { workerRpc } from "@/lib/clientDataPlane";
import { containsClientSecretLike } from "@/lib/clientInputSafety";
import {
  callClientTextProvider, clientProviderRequestAllowed, clientTextUsageCostMicros, estimateClientTextCostMicros, safeClientProviderOutput,
} from "@/lib/clientProviderAdapter";
import { clientProviderContract } from "@/lib/clientProviderContracts";
import { clientProviderCallsEnabled } from "@/lib/clientRuntimePolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Big enough for the largest prompt any provider contract allows; anything larger is refused unread. */
const MAX_BODY_BYTES = 512 * 1024;

const answer = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE });

/** The host's public key, derived from its signing key; the grant credentials it signed verify against it. */
function hostPublicKey(): KeyObject | null {
  const pem = process.env.ADAPTER_TOKEN_SIGNING_KEY_PEM?.trim();
  if (!pem) return null;
  try {
    const privateKey = createPrivateKey(pem);
    return privateKey.asymmetricKeyType === "ed25519" ? createPublicKey(privateKey) : null;
  } catch {
    return null;
  }
}

function optionalWhole(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  return raw ? Number(raw) : undefined;
}

// An adapter asks for one model answer (ADR-020). There is no member session here: the caller is an adapter, and its
// grant credential is the only way in. Off unless both the adapter host and model calls are switched on.
export async function POST(request: Request) {
  if (process.env.ADAPTER_HOST_ENABLED !== "true" || process.env.ADAPTER_MODEL_CALLS_ENABLED !== "true") {
    return answer(403, { ok: false, error: "model_calls_disabled" });
  }
  const publicKey = hostPublicKey();
  const tenantSlug = process.env.CLIENT_SLUG?.trim() ?? "";
  const workerToken = process.env.CLIENT_WORKER_TOKEN?.trim() ?? "";
  const capUsd = Number(process.env.CLIENT_BUDGET_CAP ?? 0);
  if (!publicKey || !Number.isFinite(capUsd) || capUsd < 0) return answer(503, { ok: false, error: "host_not_configured" });

  const body = await readJsonObject(request, MAX_BODY_BYTES);
  const deps: ModelCallDeps = {
    tenantSlug,
    workerToken,
    publicKeys: publicKey,
    tenantMonthlyCapMicros: Math.round(capUsd * 1_000_000),
    rpc: workerRpc,
    adapterPerMinute: optionalWhole("ADAPTER_MODEL_CALLS_PER_MINUTE"),
    tenantPerMinute: optionalWhole("CLIENT_MODEL_CALLS_PER_MINUTE"),
    policy: {
      clientAllows: (provider, model) => {
        if (!clientProviderCallsEnabled()) return false;
        const allowed = clientProviderRequestAllowed(provider, model);
        return allowed.ok && allowed.model === model;
      },
      maxPromptChars: (provider) => clientProviderContract(provider)?.maxPromptChars ?? null,
      secretLike: (messages) => containsClientSecretLike(...messages.map((message) => message.content)),
      estimateMicros: (model, messages, maxOutputTokens) => estimateClientTextCostMicros(model, [...messages], maxOutputTokens),
      usageMicros: (model, usage) => clientTextUsageCostMicros(model, usage),
      safeOutput: safeClientProviderOutput,
    },
    callProvider: (provider, model, messages: ModelMessage[], maxOutputTokens) => callClientTextProvider(provider, model, messages, maxOutputTokens),
  };
  let result;
  try {
    result = await handleModelCall(request.headers.get("authorization"), body, deps);
  } catch {
    // a deployment mistake (tenant, worker token or limits not set); the message names no value
    return answer(503, { ok: false, error: "host_not_configured" });
  }
  return answer(result.status, result.body);
}
