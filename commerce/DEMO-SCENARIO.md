# Reproducible fictional service demonstration

Use `DEMO-BRIEF.md` as the exact source text. It is synthetic, contains no client data, and may be sent to the existing configured drafting service. This scenario is a rehearsal, not evidence of a paying customer. No model download or training is needed.

## Draft and review

1. Sign in as the author and add the brief as a source. Through the separate reviewer account, approve that ordinary source. One presenter operating both accounts demonstrates account separation, not two-person validation.
2. As the author, select that source and request: “Draft a narrowly scoped service proposal using only this brief. Preserve the email-link-only scope, local source-bundle delivery, optional hosting and one revision round. Ask for the missing content, email address and schedule. Do not invent dates, customer facts or extra services.”
3. For this sandbox rehearsal only, manually set USD 2.00 total and USD 1.00 deposit (API values: 200 and 100 cents). Use the configured sandbox business merchant. Terms description: “Fictional service demonstration. Sandbox deposit only; no real service contract or funds.” These are demonstration inputs, not AI-generated commercial advice.
4. Inspect the resulting source citations and the meaning of every requirement and deliverable. Refuse public-hosting promises, backend/form work, multiple pages, more than one revision round, invented content or deadlines. Missing content, inquiry address and schedule must remain open questions. An exact source ID is insufficient when the claim is unsupported.
5. If a draft is wrong, reject it with a reason. The original author can create a corrected immutable revision; check the new digest, unchanged evidence/terms and fresh separate-account review. Approve only after the actual reviewer accepts the current proposal.

## Existing-model rehearsal without PayPal

With the already installed and signed-in Claude CLI and Node 24:

```sh
node test/real-model-http-evaluation.mjs --fictional-service --out /PRIVATE/NEW/EVIDENCE-FILE.json
```

The output path must be new. This opt-in command makes one real call through the existing subscription, using the synthetic brief, then persists the result in temporary authenticated application state. It never configures PayPal, creates an order, downloads a model or automatically grants semantic/commercial approval. Evidence records the brief hash, proposal digest, returned model and elapsed time; review the actual output manually. `--keep-open` retains temporary test accounts for browser review; stop with Ctrl-C. Disposable passwords in the harness must never be used in an operator runtime.

## Actual sandbox evidence

After owner configuration, follow `SANDBOX-ACCEPTANCE.md` on the ordinary application. A rehearsal result does not authorize a different proposal, and the sandbox checker alone is not payment proof. Save a private report containing:

| Requirement | Required observation |
|---|---|
| Candidate identity | Current commit, Node version and UTC run time |
| Real AI | Returned model, duration, source hash and reviewer findings |
| Exact commitment | Approved proposal digest, USD amounts and sandbox merchant match |
| Buyer approval | Actual sandbox approval followed by provider-backed order status |
| Capture | Matched order/capture, amount, currency and merchant; unresolved states remain unresolved |
| Verified callback | Actual event delivery, signature-verification success and committed inbox disposition |
| One kickoff | Project identity/count remains one after repeated reconciliation and actual duplicate delivery |
| Evidence withdrawal | Captured payment stays reconcilable; fresh commercial work is held |

Keep tokens, credentials, buyer information and raw provider bodies out of reports and recordings. Pending, refused and untested rows stay explicitly labeled. Publication and submission are separate owner actions.
