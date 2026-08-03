export type ClientRuntimeNoticeTone = "info" | "success" | "warning" | "danger";

export type ClientRuntimeNotice = {
  tone: ClientRuntimeNoticeTone;
  title: string;
  body: string;
  next?: string;
};

const NOTICES: Record<string, ClientRuntimeNotice> = {
  provider_request_failed: {
    tone: "danger",
    title: "Provider request failed",
    body: "The upstream model provider rejected the request. The job was captured safely, but the adapter needs a key, model access, billing, or schema fix before this tab can complete.",
    next: "Try again after the provider adapter has been redeployed, or check the runtime logs for the provider status code.",
  },
  provider_rate_limited: {
    tone: "warning",
    title: "Provider rate limit reached",
    body: "The provider is temporarily limiting requests for this tenant. Nothing local or private was used as a fallback.",
    next: "Wait a few minutes, then retry the same prompt.",
  },
  provider_calls_require_approval: {
    tone: "warning",
    title: "Provider approval required",
    body: "This client runtime is not allowed to call external model providers until Veloce approves the provider boundary.",
    next: "Approve the provider, budget, and model allowlist before sending live prompts.",
  },
  provider_not_configured: {
    tone: "warning",
    title: "Provider key missing",
    body: "This provider is visible in the workspace, but its approved server-side credential has not been connected for this tenant.",
    next: "Open Credentials and add the tenant-scoped key for this provider.",
  },
  provider_not_allowlisted: {
    tone: "warning",
    title: "Provider not allowlisted",
    body: "The manifest does not currently allow this provider for the client runtime.",
    next: "Add the provider to the reviewed manifest only after its key, budget, and policy are approved.",
  },
  model_not_allowlisted: {
    tone: "warning",
    title: "Model not allowlisted",
    body: "The selected model is not part of the tenant model allowlist.",
    next: "Use an approved model or update the manifest after a pricing and safety review.",
  },
  provider_model_not_allowlisted: {
    tone: "warning",
    title: "Provider model not allowlisted",
    body: "This provider cannot use the selected model for this tenant.",
    next: "Use a provider-model pair that is explicitly approved in the manifest.",
  },
  budget_exceeded: {
    tone: "warning",
    title: "Runtime budget reached",
    body: "The job was blocked before the provider call because the tenant budget guard would be exceeded.",
    next: "Raise the budget intentionally or wait for the current budget window to reset.",
  },
  runtime_rate_limited: {
    tone: "warning",
    title: "Runtime rate limit reached",
    body: "This tenant hit a short-term runtime limit. The guard is working and no provider work was started.",
    next: "Wait about 15 minutes before retrying.",
  },
  runtime_limit_unavailable: {
    tone: "danger",
    title: "Runtime limiter unavailable",
    body: "The runtime could not confirm the tenant limit, so it failed closed instead of starting unsafe work.",
    next: "Retry shortly, then check Supabase/runtime health if it repeats.",
  },
  task_enqueue_failed: {
    tone: "danger",
    title: "Queue dispatch failed",
    body: "The request was accepted by the app but could not be placed onto the durable tenant queue.",
    next: "Check Cloud Tasks and the runtime service account before retrying.",
  },
  capability_not_enabled: {
    tone: "warning",
    title: "Capability not enabled",
    body: "This tab is part of the product shell, but the matching hosted capability is not enabled for this tenant yet.",
    next: "Enable the capability only after its providers, data scope, and budget are reviewed.",
  },
  secret_like_input_rejected: {
    tone: "danger",
    title: "Secret-like input rejected",
    body: "The runtime detected text that looks like a credential and blocked it before saving or sending it.",
    next: "Remove keys, tokens, passwords, and private secrets from the prompt.",
  },
};

export function clientRuntimeNotice(code: string, fallback?: string): ClientRuntimeNotice {
  const normalized = code.trim();
  if (normalized && NOTICES[normalized]) return NOTICES[normalized];
  return {
    tone: "danger",
    title: "Runtime issue",
    body: fallback?.trim() && fallback.trim() !== normalized
      ? fallback.trim()
      : "The runtime returned an unrecognized issue. The code is shown below so it can be traced in logs.",
    next: normalized ? `Trace code: ${normalized}` : "Retry once, then check the runtime logs if it repeats.",
  };
}
