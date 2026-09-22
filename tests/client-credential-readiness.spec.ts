import { expect, test } from "@playwright/test";
import { clientCredentialReadiness } from "../src/lib/clientCredentialReadiness";

const base = { configured: true, connectionStatus: "connected", credentialMode: "byok", callsEnabled: true };

test("a loaded key without activation is not a usable connection", () => {
  expect(clientCredentialReadiness({ ...base, connectionStatus: null }).code).toBe("activation-required");
  expect(clientCredentialReadiness({ ...base, configured: false }).code).toBe("key-missing");
});

test("revocation and review take precedence over a bound key", () => {
  expect(clientCredentialReadiness({ ...base, connectionStatus: "revoked" }).code).toBe("revoked");
  expect(clientCredentialReadiness({ ...base, connectionStatus: "submitted" }).code).toBe("pending-review");
});

test("runtime approval and managed execution remain separate", () => {
  expect(clientCredentialReadiness({ ...base, callsEnabled: false }).code).toBe("execution-disabled");
  expect(clientCredentialReadiness({ ...base, credentialMode: "managed" }).code).toBe("managed-lane");
  expect(clientCredentialReadiness(base).detail).toContain("successful run still determine availability");
});

test("database runtime configuration does not require a provider connection", () => {
  expect(clientCredentialReadiness({ ...base, connectionStatus: null, runtimeConfiguration: true }).code).toBe("runtime-configured");
  expect(clientCredentialReadiness({ ...base, configured: false, runtimeConfiguration: true }).code).toBe("runtime-missing");
});
