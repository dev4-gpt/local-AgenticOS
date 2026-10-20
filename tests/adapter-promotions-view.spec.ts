import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { loadReviewModule } from "./helpers/load-review-module";

const contracts = loadReviewModule("src/lib/adapterContracts.ts", {});
const view = loadReviewModule("src/lib/adapterPromotionsView.ts", { "./adapterContracts": contracts });

const ME = "00000000-0000-4000-8000-0000000000a2";
const OTHER = "00000000-0000-4000-8000-0000000000a3";
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const NOTE = "Refunds are processed in 5 days.";
const id = (n: number) => `00000000-0000-4000-8000-0000000000c${n}`;

function scan(verdict = "clean", content = NOTE, findings: unknown[] = []) {
  return { scanner: "memory-scan-h1", content_sha256: sha(content), verdict, findings, scanned_chars: content.length };
}
function promo(extra: Record<string, unknown> = {}) {
  return {
    id: id(1), source_item_id: id(2), origin_adapter_id: "forge", content_sha256: sha(NOTE), status: "quarantined", scan_result: scan(),
    requested_by: OTHER, reviewed_by: null, reviewed_at: null, decision_note: null, created_at: "2026-10-20T10:00:00Z",
    source_content: NOTE, provenance: [{ item_id: id(2), adapter_id: "forge", adapter_version: "1.2", agent_principal: "writer", source_task_id: "t-17", source_url: "https://example.test/policy", source_sha256: sha("src"), confidence: 0.8, created_at: "2026-10-20T09:00:00Z" }],
    already_shared_item_id: null, ...extra,
  };
}
const body = (promotions: unknown[], extra: Record<string, unknown> = {}) => ({ ok: true, viewerId: ME, canDecide: true, promotions, sharedNotes: [], ...extra });
const cardsFor = (promotions: unknown[], extra: Record<string, unknown> = {}) => view.buildPromotionCards(view.parsePromotionsResponse(body(promotions, extra)));

test("a waiting clean promotion from someone else shows the note, its scan and its source, and can be approved or rejected", () => {
  const [card] = cardsFor([promo()]);
  expect(card).toMatchObject({ adapterId: "forge", statusLabel: "Waiting for review", open: true, requestedByLabel: "Another member", content: NOTE, verdict: "clean", canApprove: true, canReject: true, noteMinChars: 0, blockedReason: null, alreadyShared: false });
  expect(card.verdictSummary).toMatch(/tripwire, not a guarantee/);
  expect(card.provenanceLines).toEqual([expect.stringContaining("forge 1.2 · agent writer · task t-17 · confidence 80% · source https://example.test/policy")]);
  expect(card.shortHash).toBe(sha(NOTE).slice(0, 12));
});

test("a flagged promotion can be approved only with a written reason, a blocked one only rejected", () => {
  const finding = { rule: "markdown_image", severity: "medium", count: 1, sample: "![chart](https://x.test/c.png)" };
  const [flagged] = cardsFor([promo({ scan_result: scan("flagged", NOTE, [finding]) })]);
  expect(flagged).toMatchObject({ verdict: "flagged", canApprove: true, canReject: true, noteMinChars: 20 });
  expect(flagged.findings).toEqual([{ ...finding, label: "Embeds an image from the web" }]);
  expect(view.reasonIsEnough(flagged, "short")).toBe(false);
  expect(view.reasonIsEnough(flagged, "x".repeat(19))).toBe(false);
  expect(view.reasonIsEnough(flagged, `   ${"x".repeat(19)}   `)).toBe(false);
  expect(view.reasonIsEnough(flagged, "x".repeat(20))).toBe(true);
  const [clean] = cardsFor([promo()]);
  expect(view.reasonIsEnough(clean, "")).toBe(true);
  const [blocked] = cardsFor([promo({ scan_result: scan("blocked", NOTE, [{ rule: "instruction_override", severity: "high", count: 1, sample: "ignore" }]) })]);
  expect(blocked).toMatchObject({ verdict: "blocked", canApprove: false, canReject: true });
  expect(blocked.blockedReason).toMatch(/can only be rejected/);
});

test("your own promotion, and any promotion for a plain member, offers no decision", () => {
  const [own] = cardsFor([promo({ requested_by: ME })]);
  expect(own).toMatchObject({ requestedByLabel: "You", canApprove: false, canReject: false });
  expect(own.blockedReason).toMatch(/different owner or admin/);
  const [member] = cardsFor([promo({ source_content: null })], { canDecide: false });
  expect(member).toMatchObject({ canApprove: false, canReject: false, content: null, contentUnavailable: "Only owners and admins can read the note itself." });
  expect(member.blockedReason).toMatch(/Only owners and admins/);
});

test("approval needs a scan of exactly this note, a readable note, and a fact that is not already shared", () => {
  const [wrongScan] = cardsFor([promo({ scan_result: scan("clean", "some other text") })]);
  expect(wrongScan).toMatchObject({ canApprove: false, canReject: true });
  expect(wrongScan.blockedReason).toMatch(/no scan of exactly this note/);
  const [noScan] = cardsFor([promo({ scan_result: {} })]);
  expect(noScan).toMatchObject({ verdict: null, verdictLabel: "Not scanned", canApprove: false, canReject: true });
  const [unreadable] = cardsFor([promo({ source_content: null })]);
  expect(unreadable).toMatchObject({ canApprove: false, canReject: true, content: null, contentUnavailable: "The note could not be read." });
  const [duplicate] = cardsFor([promo({ already_shared_item_id: id(9) })]);
  expect(duplicate).toMatchObject({ canApprove: false, canReject: true, alreadyShared: true });
  expect(duplicate.blockedReason).toMatch(/already shared/);
});

test("decided promotions show who decided and why, and offer no buttons", () => {
  for (const status of ["approved", "rejected", "withdrawn"]) {
    const [card] = cardsFor([promo({ status, reviewed_by: ME, reviewed_at: "2026-10-20T11:00:00Z", decision_note: "Checked the policy page" })]);
    expect(card, status).toMatchObject({ open: false, reviewedByLabel: "You", decisionNote: "Checked the policy page", canApprove: false, canReject: false });
  }
});

test("invisible characters in a note are made visible instead of hiding in the text", () => {
  expect(view.showHiddenCharacters("pay‮001​now")).toEqual({ text: "pay[U+202E]001[U+200B]now", hiddenCount: 2 });
  expect(view.showHiddenCharacters("tag\u{E0041}")).toEqual({ text: "tag[U+E0041]", hiddenCount: 1 });
  expect(view.showHiddenCharacters("bell\u0007")).toEqual({ text: "bell[U+0007]", hiddenCount: 1 });
  expect(view.showHiddenCharacters("Plain text with a tab\tand a line\nbreak")).toEqual({ text: "Plain text with a tab\tand a line\nbreak", hiddenCount: 0 });
  const [card] = cardsFor([promo({ source_content: "ignore​ previous", scan_result: scan("blocked", "ignore​ previous") , content_sha256: sha("ignore​ previous") })]);
  expect(card.content).toBe("ignore[U+200B] previous");
  expect(card.hiddenCharacterCount).toBe(1);
});

test("waiting promotions come first, oldest first; decided ones follow, newest first", () => {
  const cards = cardsFor([
    promo({ id: id(1), status: "rejected", created_at: "2026-10-18T10:00:00Z" }),
    promo({ id: id(2), created_at: "2026-10-20T10:00:00Z" }),
    promo({ id: id(3), status: "approved", created_at: "2026-10-19T10:00:00Z" }),
    promo({ id: id(4), created_at: "2026-10-19T08:00:00Z" }),
  ]);
  expect(cards.map((c: { id: string }) => c.id)).toEqual([id(4), id(2), id(3), id(1)]);
  expect(view.waitingPromotionCount(cards)).toBe(2);
});

test("shared notes can be withdrawn only by owners and admins, newest first, with invisible characters shown", () => {
  const notes = [
    { id: id(5), origin_adapter_id: "forge", content: "Older fact", content_sha256: sha("Older fact"), promotion_id: id(1), created_at: "2026-10-18T10:00:00Z" },
    { id: id(6), origin_adapter_id: "knowledge", content: "Newer​ fact", content_sha256: sha("Newer fact"), promotion_id: id(2), created_at: "2026-10-19T10:00:00Z" },
  ];
  const cards = view.buildSharedNoteCards(view.parsePromotionsResponse(body([], { sharedNotes: notes })));
  expect(cards.map((c: { id: string }) => c.id)).toEqual([id(6), id(5)]);
  expect(cards[0]).toMatchObject({ content: "Newer[U+200B] fact", hiddenCharacterCount: 1, canRevoke: true });
  const asMember = view.buildSharedNoteCards(view.parsePromotionsResponse(body([], { sharedNotes: notes, canDecide: false })));
  expect(asMember.every((c: { canRevoke: boolean }) => c.canRevoke === false)).toBe(true);
  expect(view.revokeReasonIsEnough("no")).toBe(false);
  expect(view.revokeReasonIsEnough("     ")).toBe(false);
  expect(view.revokeReasonIsEnough("It is wrong now")).toBe(true);
  expect(view.revokeReasonIsEnough("x".repeat(501))).toBe(false);
});

test("a malformed answer is rejected instead of shown", () => {
  const bad: unknown[] = [
    null, "x", { ok: false }, { ok: true, promotions: [], viewerId: ME, canDecide: true }, body("nope" as never), body([], { sharedNotes: "no" }),
    body([promo({ id: "nope" })]), body([promo({ origin_adapter_id: "BAD" })]), body([promo({ content_sha256: "abc" })]), body([promo({ status: "maybe" })]),
    body([promo({ requested_by: "x" })]), body([promo({ created_at: "soon" })]), body([promo({ decision_note: "x".repeat(2001) })]), body([promo({ source_content: "x".repeat(30_001) })]),
    body([promo({ scan_result: { verdict: "fine" } })]), body([promo({ scan_result: { verdict: "clean", findings: "no" } })]),
    body([promo({ scan_result: { verdict: "clean", findings: [{ rule: "x", severity: "weird", count: 1, sample: "" }] } })]),
    body([promo({ provenance: "no" })]), body([promo({ provenance: [{ adapter_id: "forge" }] })]), body([promo({ already_shared_item_id: "x" })]),
    body(Array.from({ length: 101 }, () => promo())), body([], { viewerId: "" }), body([], { canDecide: "yes" }),
    body([], { sharedNotes: [{ id: id(5), origin_adapter_id: "forge", content: "x", content_sha256: "bad", promotion_id: id(1), created_at: "2026-10-18T10:00:00Z" }] }),
  ];
  for (const value of bad) expect(view.parsePromotionsResponse(value), JSON.stringify(value)?.slice(0, 80)).toBeNull();
  expect(view.parsePromotionsResponse(body([]))).toMatchObject({ promotions: [], sharedNotes: [], viewerId: ME, canDecide: true });
});

test("messages for refusals are plain, and unknown errors never leak", () => {
  expect(view.promotionErrorMessage("requester_cannot_decide")).toMatch(/someone else/);
  expect(view.promotionErrorMessage("blocked_by_scan")).toMatch(/cannot be approved/);
  expect(view.promotionErrorMessage("note_required")).toMatch(/at least 20 characters/);
  expect(view.promotionErrorMessage("hash_mismatch")).toMatch(/changed/);
  expect(view.promotionErrorMessage("not_shared")).toMatch(/shared notes/);
  const generic = view.promotionErrorMessage("relation secret_table does not exist");
  expect(generic).toBe("That could not be recorded. Nothing was changed.");
  expect(view.promotionErrorMessage(undefined)).toBe(generic);
});

// QM-6a: the reviewer chooses a label when approving.
const guard = loadReviewModule("src/lib/adapterMemoryGuard.ts", {});

test("the labels on screen are the labels the server accepts, and the sensitive reason length is the same on both sides", () => {
  expect(view.LABEL_CHOICES.map((c: { value: string }) => c.value)).toEqual(guard.APPROVABLE_SENSITIVITIES);
  expect(view.SENSITIVE_NOTE_MIN_CHARS).toBe(guard.SENSITIVE_NOTE_MIN_CHARS);
  for (const choice of view.LABEL_CHOICES) {
    expect(choice.title.length).toBeGreaterThan(0);
    expect(choice.help.length).toBeGreaterThan(10);
  }
  expect(view.LABEL_CHOICES.find((c: { value: string }) => c.value === "sensitive").help).toContain("20");
});

test("approving needs a label, and a sensitive label or a flagged scan each need a written reason of 20 characters", () => {
  const [clean] = cardsFor([promo()]);
  const [flagged] = cardsFor([promo({ scan_result: scan("flagged", NOTE, [{ rule: "markdown_image", severity: "medium", count: 1, sample: "x" }]) })]);
  const long = "x".repeat(20);
  const short = "x".repeat(19);
  expect(view.minNoteChars(clean, "ordinary")).toBe(0);
  expect(view.minNoteChars(clean, "sensitive")).toBe(20);
  expect(view.minNoteChars(clean, null)).toBe(0);
  expect(view.minNoteChars(flagged, "ordinary")).toBe(20);
  expect(view.minNoteChars(flagged, "sensitive")).toBe(20);
  // no label, no approval, whatever the reason says
  for (const label of [null, undefined, "restricted", "unknown", "", "ORDINARY", "public"]) expect(view.canSubmitApproval(clean, long, label), String(label)).toBe(false);
  expect(view.canSubmitApproval(clean, "", "ordinary")).toBe(true);
  expect(view.canSubmitApproval(clean, short, "sensitive")).toBe(false);
  expect(view.canSubmitApproval(clean, `  ${long}  `, "sensitive")).toBe(true);
  expect(view.canSubmitApproval(clean, `  ${short}   `, "sensitive")).toBe(false); // padding does not count
  expect(view.canSubmitApproval(flagged, short, "ordinary")).toBe(false);
  expect(view.canSubmitApproval(flagged, long, "ordinary")).toBe(true);
  // a card that cannot be approved at all cannot be submitted, label or not
  const [blocked] = cardsFor([promo({ scan_result: scan("blocked") })]);
  const [own] = cardsFor([promo({ requested_by: ME })]);
  expect(view.canSubmitApproval(blocked, long, "ordinary")).toBe(false);
  expect(view.canSubmitApproval(own, long, "ordinary")).toBe(false);
});

test("a decided promotion shows the label it was given, and shared notes show theirs, with unlabelled ones never passing for ordinary", () => {
  const [approved] = cardsFor([promo({ status: "approved", reviewed_by: OTHER, reviewed_at: "2026-10-20T11:00:00Z", approved_sensitivity: "sensitive" })]);
  expect(approved.labelTitle).toBe("Sensitive");
  const [rejected] = cardsFor([promo({ status: "rejected", reviewed_by: OTHER, reviewed_at: "2026-10-20T11:00:00Z" })]);
  expect(rejected.labelTitle).toBeNull();
  const shared = (sensitivity?: string) => ({ id: id(5), origin_adapter_id: "forge", content: NOTE, content_sha256: sha(NOTE), promotion_id: id(1), created_at: "2026-10-20T10:00:00Z", ...(sensitivity === undefined ? {} : { sensitivity }) });
  const cards = view.buildSharedNoteCards(view.parsePromotionsResponse(body([], { sharedNotes: [shared("ordinary"), { ...shared("sensitive"), id: id(6) }, { ...shared(), id: id(7) }, { ...shared("restricted"), id: id(8) }] })));
  const titles = Object.fromEntries(cards.map((c: { id: string; sensitivityTitle: string }) => [c.id, c.sensitivityTitle]));
  expect(titles).toEqual({ [id(5)]: "Ordinary", [id(6)]: "Sensitive", [id(7)]: "Not labelled", [id(8)]: "Restricted" });
});

test("an answer with an unknown label is rejected instead of shown", () => {
  expect(view.parsePromotionsResponse(body([promo({ approved_sensitivity: "restricted" })]))).toBeNull();
  expect(view.parsePromotionsResponse(body([promo({ approved_sensitivity: "ORDINARY" })]))).toBeNull();
  expect(view.parsePromotionsResponse(body([promo({ approved_sensitivity: 5 })]))).toBeNull();
  expect(view.parsePromotionsResponse(body([promo({ approved_sensitivity: "ordinary" })]))).not.toBeNull();
  const badShared = { id: id(5), origin_adapter_id: "forge", content: NOTE, content_sha256: sha(NOTE), promotion_id: id(1), created_at: "2026-10-20T10:00:00Z", sensitivity: "public" };
  expect(view.parsePromotionsResponse(body([], { sharedNotes: [badShared] }))).toBeNull();
});

test("the label errors have plain words", () => {
  expect(view.promotionErrorMessage("sensitivity_required")).toMatch(/ordinary or sensitive/);
  expect(view.promotionErrorMessage("sensitivity_required")).toMatch(/reject/);
  expect(view.promotionErrorMessage("note_required")).toMatch(/flagged or sensitive/);
});

// Added by the mutation sweep: the limits and shapes the parser enforces on what the list route returns.
const finding = (extra: Record<string, unknown> = {}) => ({ rule: "secret", severity: "high", count: 1, sample: "key=", ...extra });
const provenanceRow = (extra: Record<string, unknown> = {}) => ({
  item_id: id(2), adapter_id: "forge", adapter_version: "1.2", agent_principal: "writer", source_task_id: "t-17",
  source_url: "https://example.test/policy", source_sha256: sha("src"), confidence: 0.8, created_at: "2026-10-20T10:00:00Z", ...extra,
});
const parsedWith = (extra: Record<string, unknown>) => view.parsePromotionsResponse(body([promo(extra)]));
const withFindings = (findings: unknown) => parsedWith({ scan_result: { ...scan("flagged"), findings } });

test("scan findings: at most 20, each an object with a short rule, a known severity, a whole non-negative count and a short sample", () => {
  expect(withFindings(Array.from({ length: 20 }, () => finding()))).not.toBeNull();
  expect(withFindings(Array.from({ length: 21 }, () => finding()))).toBeNull();
  expect(withFindings([])).not.toBeNull();
  for (const bad of [null, "x", 5, {}, [null], [5], [[]], [finding({ rule: 5 })], [finding({ rule: "r".repeat(61) })], [finding({ severity: "low" })], [finding({ severity: undefined })]]) {
    expect(withFindings(bad), JSON.stringify(bad)).toBeNull();
  }
  for (const count of [-1, 1.5, "2", null, undefined, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) expect(withFindings([finding({ count })]), String(count)).toBeNull();
  expect(withFindings([finding({ count: 0 })])).not.toBeNull();
  for (const sample of [5, null, undefined, "s".repeat(201)]) expect(withFindings([finding({ sample })]), String(sample)).toBeNull();
  expect(withFindings([finding({ sample: "s".repeat(200) })])).not.toBeNull();
  expect(withFindings([finding({ rule: "r".repeat(60) })])).not.toBeNull();
});

test("source records: at most 20, each with a valid adapter, short text fields, a confidence from 0 to 1, a date, and a link and fingerprint that are optional but valid", () => {
  const withRows = (rows: unknown) => parsedWith({ provenance: rows });
  expect(withRows(Array.from({ length: 20 }, () => provenanceRow()))).not.toBeNull();
  expect(withRows(Array.from({ length: 21 }, () => provenanceRow()))).toBeNull();
  expect(withRows([])).not.toBeNull();
  for (const bad of [null, "x", {}, [null], [5], [[]]]) expect(withRows(bad), JSON.stringify(bad)).toBeNull();
  const refused: Record<string, unknown>[] = [
    { adapter_id: "Bad Adapter" }, { adapter_id: undefined }, { adapter_version: 1 }, { adapter_version: "v".repeat(41) }, { adapter_version: undefined },
    { agent_principal: "a".repeat(121) }, { agent_principal: 5 }, { source_task_id: "t".repeat(129) }, { source_task_id: undefined },
    { confidence: "0.5" }, { confidence: -0.01 }, { confidence: 1.01 }, { confidence: Number.NaN }, { confidence: undefined },
    { created_at: "soon" }, { created_at: undefined }, { source_url: 5 }, { source_url: "u".repeat(2049) }, { source_sha256: "abc" }, { source_sha256: 5 },
  ];
  for (const over of refused) expect(withRows([provenanceRow(over)]), JSON.stringify(over)).toBeNull();
  for (const over of [{ confidence: 0 }, { confidence: 1 }, { source_url: null }, { source_sha256: null }, { source_url: undefined, source_sha256: undefined }, { source_url: "u".repeat(2048) }, { adapter_version: "v".repeat(40) }, { agent_principal: "a".repeat(120) }, { source_task_id: "t".repeat(128) }]) {
    expect(withRows([provenanceRow(over)]), JSON.stringify(over).slice(0, 60)).not.toBeNull();
  }
});
