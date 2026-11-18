import { expect, test } from "@playwright/test";
import { safeClientLoginNext } from "../src/lib/clientLoginRedirect";

const origin = "https://tenant-a.run.app";

test("client login keeps requested destinations inside the tenant origin", () => {
  expect(safeClientLoginNext("/memory?view=graph#node", origin)).toBe("/memory?view=graph#node");
  expect(safeClientLoginNext(null, origin)).toBe("/");
  for (const value of [
    "https://evil.example/path", "//evil.example/path", "/\\evil.example/path",
    "/\n/evil.example/path", "/\r/evil.example/path", "/\u0000evil.example/path",
  ]) {
    expect(safeClientLoginNext(value, origin), value).toBe("/");
  }
});
