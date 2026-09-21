import { expect, test } from "@playwright/test";
import { clientProviderContract } from "../src/lib/clientProviderContracts";
import { clientProviderRequestAllowed } from "../src/lib/clientProviderAdapter";

const ENV_NAMES = [
  "VELOCE_CLIENT_EDITION",
  "CLIENT_PROVIDER_ALLOWLIST",
  "CLIENT_MODEL_ALLOWLIST",
  "CLIENT_PROVIDER_MODEL_ALLOWLIST_JSON",
] as const;

test("the Groq free-tier lane remains tenant-allowlisted and model-bound", () => {
  const previous = new Map(ENV_NAMES.map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, {
      VELOCE_CLIENT_EDITION: "1",
      CLIENT_PROVIDER_ALLOWLIST: "GROQ_API_KEY",
      CLIENT_MODEL_ALLOWLIST: "openai/gpt-oss-120b",
      CLIENT_PROVIDER_MODEL_ALLOWLIST_JSON: '{"groq":["openai/gpt-oss-120b"]}',
    });
    expect(clientProviderContract("groq")).toMatchObject({ protocol: "openai", workspace: "tenant-workflow" });
    expect(clientProviderRequestAllowed("groq")).toMatchObject({ ok: true, model: "openai/gpt-oss-120b", key: "GROQ_API_KEY" });
    expect(clientProviderRequestAllowed("groq", "unreviewed-model")).toMatchObject({ ok: false, error: "model_not_allowlisted" });
  } finally {
    for (const name of ENV_NAMES) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
