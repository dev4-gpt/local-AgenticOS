#!/usr/bin/env node
import assert from "node:assert/strict";

// Run against a local server with an isolated AGENTIC_OS_VAULT. This never
// invokes a model: the execution requests must be rejected before generation.
const base = new URL(process.argv[2] || "http://127.0.0.1:3942");
assert(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Local acceptance requires a loopback server");
assert(base.protocol === "http:" && !base.username && !base.password, "Expected a local HTTP URL");
let slug;
async function api(action, body) {
  const response = await fetch(new URL(`/api/pipeline${action ? `/${action}` : ""}`, base), body ? {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  return { status: response.status, data: await response.json() };
}
try {
  const listed = await api("");
  assert.equal(listed.status, 200);
  assert.equal(listed.data.available, true, "Configure an isolated test vault first");
  const captured = await api("capture", { idea: `Pipeline acceptance ${crypto.randomUUID()}` });
  assert.equal(captured.status, 200);
  slug = captured.data.slug;
  assert.equal(typeof slug, "string");
  assert.equal((await api("build", { slug })).status, 409, "Unreviewed capture must not execute");
  assert.equal((await api("decide", { slug, approve: true })).status, 409, "Unshaped capture must not be approved");
  const pinned = await api("pin", { slug, pinned: true });
  assert.equal(pinned.status, 200);
  assert.equal(pinned.data.item.pinned, true);
  const reloaded = await api("");
  assert(reloaded.data.items.some((item) => item.slug === slug && item.stage === "inbox" && item.pinned));
  console.log("PASS: capture, persisted reload, pin, and server-enforced approval gates; no model calls.");
} finally {
  if (slug) {
    const removed = await api("delete", { slug });
    assert.equal(removed.data.ok, true, "Acceptance item cleanup failed");
    assert(!(await api("")).data.items.some((item) => item.slug === slug), "Acceptance item remained after cleanup");
    console.log("PASS: acceptance item removed and absence verified.");
  }
}
