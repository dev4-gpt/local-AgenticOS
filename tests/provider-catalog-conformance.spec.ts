import { expect, test } from "@playwright/test";
import { publicCatalogEntryForCredential, publicCatalogProviderOptions } from "../src/lib/publicProviderCatalog";

const providerKeys = [
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY", "MOONSHOT_API_KEY",
  "GLM_API_KEY", "XAI_API_KEY", "SAKANA_API_KEY", "GROQ_API_KEY", "ELEVENLABS_API_KEY",
  "ELEVENLABS_MUSIC_API_KEY", "HEYGEN_API_KEY", "SUNO_API_KEY", "FIRECRAWL_API_KEY",
  "BRAVE_API_KEY", "HUNTER_API_KEY",
] as const;
const currentPricingKeys = new Set([
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY",
  "FIRECRAWL_API_KEY", "BRAVE_API_KEY", "ELEVENLABS_API_KEY",
]);

test("every public BYOK provider has an explicit catalog row", () => {
  for (const key of providerKeys) {
    const entry = publicCatalogEntryForCredential(key);
    expect(entry, key).not.toBeNull();
    expect(entry?.credentialMode, key).toBe("BYOK");
    expect(entry?.status, key).toBe("client-key");
  }
});

test("providers without current pricing evidence are visible but not selectable", () => {
  const selectable = new Set(publicCatalogProviderOptions().map((entry) => entry.credentialKey));
  for (const key of providerKeys) {
    const entry = publicCatalogEntryForCredential(key);
    expect(entry?.selectionAllowed).toBe(currentPricingKeys.has(key));
    expect(selectable.has(key)).toBe(currentPricingKeys.has(key));
    if (!currentPricingKeys.has(key)) {
      expect(entry?.approval).toContain("Current pricing evidence is required");
      expect(entry?.pricingSnapshotId).toBeUndefined();
    }
  }
});
