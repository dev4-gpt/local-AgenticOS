import { expect, test } from "@playwright/test";
import { loadReviewModule } from "./helpers/load-review-module";
import * as adapter from "../src/lib/clientRoomAdapter";
import * as network from "../src/lib/clientNetworkSafety";

for (const width of [1280, 390]) {
  test(`Room proposal review through real handlers at ${width}px`, async ({ page, context, baseURL }, testInfo) => {
    const conversationId = "00000000-0000-4000-8000-000000000098";
    const jobId = "00000000-0000-4000-8000-000000000099";
    const userId = "00000000-0000-4000-8000-000000000010";
    const note = { kind: "note", label: "Synthetic decision", body: "Approve only this exact synthetic decision.", agentId: "claude", agentName: "Claude" };
    const idea = { ...note, kind: "pipeline", label: "Synthetic plan", body: "Prepare a synthetic plan." };
    const reviews: Record<string, unknown> = {};
    const posted: Record<string, unknown>[] = [];
    const errors: string[] = [];
    const conversation = { id: conversationId, title: "Synthetic conversation", presentAgents: ["claude"], status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), retentionExpiresAt: new Date(Date.now()+86400000).toISOString() };
    const otherConversation = { ...conversation, id: "00000000-0000-4000-8000-000000000097", title: "Other synthetic conversation", presentAgents: [] };
    let finishSend: () => void = () => undefined;
    const pendingSend = new Promise<void>((resolve) => { finishSend = resolve; });
    let expired = false;
    const route = loadReviewModule("src/app/api/client-runtime/room/proposals/route.ts", {
      "@/lib/clientRoomAdapter": adapter, "@/lib/clientNetworkSafety": network,
      "@/lib/clientInputSafety": { containsClientSecretLike: () => false },
      "@/lib/clientRuntimePolicy": { clientCapabilityEnabled: () => true },
      "@/lib/clientRoomData": { ROOM_UUID_RE: /^[a-f0-9-]{36}$/, roomSession: async () => ({ tenantSlug: "tenant-a", userId }),
        roomReadLimit: async () => ({ ok: true, allowed: true }), roomWriteLimit: async () => ({ ok: true, allowed: true }),
        readRoomConversation: async (_tenant: string, id: string) => id === conversationId ? conversation : otherConversation, roomJson: (body: object) => Response.json({ ok: true, ...body }),
        roomError: (error: string, status: number) => Response.json({ error }, { status }) },
      "@/lib/clientDataPlane": {
        selectClientRecords: async (_table: string, filters: Record<string, string>) => ({ ok: true, records: filters["input_metadata->>conversationId"] === `eq.${conversationId}` ? [{ id: jobId, output_metadata: { roomDirectives: [note, idea], roomDirectiveReviews: reviews } }] : [] }),
        clientRpc: async (_name: string, args: Record<string, unknown>) => {
          expect(args.p_expected).toEqual(args.p_index === 0 ? note : idea);
          const value = { decision: args.p_decision, recordId: args.p_decision === "approved" ? jobId : null };
          reviews[String(args.p_index)] = value; return { ok: true, value };
        },
      },
    });
    await page.setViewportSize({ width, height: 844 });
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route("**/*", async (requestRoute) => {
      const request = requestRoute.request(); const url = new URL(request.url());
      if (url.origin !== baseURL) return requestRoute.abort();
      if (!url.pathname.startsWith("/api/")) return requestRoute.continue();
      if (url.pathname === "/api/client-auth/session") return requestRoute.fulfill({ json: { authenticated: true, workspaceAuthorized: true, accessError: null, user: { id: userId } } });
      if (url.pathname === "/api/client-runtime/room/conversations") return requestRoute.fulfill({ json: { ok: true, configured: true, conversations: [conversation, otherConversation], roster: [] } });
      if (url.pathname === "/api/client-runtime/room/messages") {
        if (request.method() === "POST") { await pendingSend; return requestRoute.fulfill({ json: { ok: true } }); }
        if (expired) return requestRoute.fulfill({ status: 404, json: { ok: false, error: "room_conversation_not_found" } });
        return requestRoute.fulfill({ json: { ok: true, configured: true, conversation: url.searchParams.get("conversationId") === conversationId ? conversation : otherConversation, messages: [], activeRound: null, lastRound: null } });
      }
      if (url.pathname === "/api/client-runtime/room/proposals") {
        const body = request.postDataBuffer();
        if (body) posted.push(request.postDataJSON());
        const response = await route[request.method()](new Request(request.url(), { method: request.method(), headers: request.headers(), ...(body ? { body: new Uint8Array(body) } : {}) }));
        return requestRoute.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
      }
      errors.push(`Unexpected API path: ${url.pathname}`);
      return requestRoute.fulfill({ status: 500, json: { error: "unexpected_fixture_request" } });
    });
    await context.addCookies([{ name: "veloce_access_token", value: "synthetic-room-review", url: baseURL! }]);
    await page.goto("/room");
    const section = page.getByRole("region", { name: "Room proposals" });
    await expect(section).toBeVisible();
    await expect(page.locator(`time[datetime="${conversation.retentionExpiresAt}"]`)).toContainText("Expires");
    const heading = await page.getByRole("heading", { name: "AI Agent Mastermind", exact: true }).last().boundingBox();
    expect(heading!.height).toBeLessThanOrEqual(80);
    expect(heading!.width).toBeGreaterThanOrEqual(200);
    await page.screenshot({ path: testInfo.outputPath(`room-header-${width}.png`), fullPage: true });
    await expect(section.getByText(note.body)).toBeVisible();
    const approve = page.getByRole("button", { name: "Approve Synthetic decision", exact: true });
    const reject = page.getByRole("button", { name: "Reject Synthetic plan", exact: true });
    await approve.scrollIntoViewIfNeeded();
    const bounds = await approve.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`room-pending-${width}.png`), fullPage: true });
    expect(posted).toHaveLength(0);
    await approve.click();
    await expect(page.getByRole("link", { name: "Open Synthetic decision", exact: true })).toHaveAttribute("href", "/memory");
    await reject.click();
    await expect(section.getByText(/Pipeline idea · rejected/)).toBeVisible();
    expect(posted).toEqual([{ jobId, index: 0, proposal: note, decision: "approved" }, { jobId, index: 1, proposal: idea, decision: "rejected" }]);
    await page.reload();
    await expect(page.getByRole("link", { name: "Open Synthetic decision", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approve / })).toHaveCount(0);
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`room-reviewed-${width}.png`), fullPage: true });
    // A late send completion from the old chat must not switch the review UI back.
    await page.getByPlaceholder(/^Message the room/).fill("Synthetic delayed send");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sending", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^History/ }).click();
    await page.getByText("Other synthetic conversation", { exact: true }).click();
    await expect(page.getByPlaceholder(/^Add an agent/)).toBeDisabled();
    finishSend();
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await expect(page.getByPlaceholder(/^Add an agent/)).toBeDisabled();
    await expect(section).toHaveCount(0);
    expired = true;
    await page.getByRole("button", { name: /^History/ }).click();
    await page.getByText("Other synthetic conversation", { exact: true }).click();
    await expect(page.getByPlaceholder(/^Start a new chat/)).toBeDisabled();
    await expect(page.locator("time[datetime]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
