import { run, type RunResult } from "@/lib/runner";

export interface HermesQueryOptions {
  profile?: string;
  cwd?: string;
  timeoutMs?: number;
  allowTools?: boolean;
}

export interface HermesQueryResult extends RunResult {
  providerUsed: "configured" | "kimi-coding" | "openrouter";
  attempts: Array<"configured" | "kimi-coding" | "openrouter">;
}

const AUTH_OR_QUOTA_FAILURE = /(?:token refresh failed|\b401\b|no api key|invalid auth|authentication|credential[^\n]*(?:exhausted|missing)|membership benefits|rate.?limit|quota)/i;

function queryArgs(
  prompt: string,
  profile: string | undefined,
  provider?: "kimi-coding" | "openrouter",
): string[] {
  const args = profile ? ["--profile", profile] : [];
  args.push("chat");
  if (provider === "kimi-coding") {
    args.push("--provider", "kimi-coding", "-m", "kimi-k2.7-code");
  } else if (provider === "openrouter") {
    args.push("--provider", "openrouter", "-m", "openrouter/auto");
  }
  args.push("-q", prompt, "-Q", "--source", "agentos");
  return args;
}

function shouldFallback(result: RunResult): boolean {
  const output = `${result.stdout}\n${result.stderr}`;
  return !result.ok && AUTH_OR_QUOTA_FAILURE.test(output);
}

export async function runHermesQuery(prompt: string, options: HermesQueryOptions = {}): Promise<HermesQueryResult> {
  const timeoutMs = options.timeoutMs ?? 6 * 60 * 1000;
  const extra = options.allowTools ? ["--yolo", "--accept-hooks"] : [];
  const attempts: HermesQueryResult["attempts"] = ["configured"];

  let result = await run("hermes", [...queryArgs(prompt, options.profile), ...extra], {
    cwd: options.cwd,
    timeoutMs,
  });
  if (!shouldFallback(result)) return { ...result, providerUsed: "configured", attempts };

  attempts.push("kimi-coding");
  result = await run("hermes", [...queryArgs(prompt, options.profile, "kimi-coding"), ...extra], {
    cwd: options.cwd,
    timeoutMs,
  });
  if (!shouldFallback(result)) return { ...result, providerUsed: "kimi-coding", attempts };

  attempts.push("openrouter");
  result = await run("hermes", [...queryArgs(prompt, options.profile, "openrouter"), ...extra], {
    cwd: options.cwd,
    timeoutMs,
  });
  return { ...result, providerUsed: "openrouter", attempts };
}
