import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("Room roster checks tenant execution credentials before offering an agent", () => {
  const source = readFileSync("src/lib/clientRoomData.ts", "utf8");
  expect(source).toContain('clientExecutionCredential');
  expect(source).toContain('provider_not_configured');
  expect(source).toMatch(/export async function roomRoster\(/);
});

test("Room reads the current roster before creating, changing, or dispatching a round", () => {
  const conversations = readFileSync("src/app/api/client-runtime/room/conversations/route.ts", "utf8");
  const messages = readFileSync("src/app/api/client-runtime/room/messages/route.ts", "utf8");
  expect(conversations.match(/await roomRoster\(\)/g)?.length).toBeGreaterThanOrEqual(4);
  expect(messages).toContain("await roomRoster()");
});
