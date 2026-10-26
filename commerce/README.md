# Veloce Commerce

Turn approved knowledge into a cited proposal, an explicitly reviewed PayPal sandbox deposit, and one project kickoff. If supporting evidence changes or is withdrawn, new dependent commercial actions are blocked.

This is the standalone capability being developed for the PayPal AI Hackathon. It also provides domain/storage/provider seams for the Veloce host. It does not require a private Veloce backend or ContractorOS to run. Production Veloce binding, complete shared retention and financial policy, real sandbox acceptance and final submission evidence remain open; see [EXECUTION.md](EXECUTION.md).

## Requirements

- **Node 24.15 or later in the Node 24 series**, with its built-in SQLite module.
- Existing model access: either an already signed-in **Claude subscription** through the installed Claude CLI, or an already downloaded Ollama text model. No model downloads, creation, API-key fallback or automatic provider fallback are performed by this application.
- For real payment testing: your PayPal sandbox app, sandbox merchant ID and separate buyer account. Real payment endpoints are intentionally unavailable.

There are no npm dependencies to install. The application uses Node built-ins, native browser features and system fonts. The Claude CLI uses your existing service access; this repository does not redistribute model weights or credentials.

## Local setup

Run commands from this directory using Node 24. `data/` is private runtime state and must never be committed or included in the public source package.

```sh
node src/cli.mjs init --tenant owner-dev --merchant YOUR_SANDBOX_MERCHANT_ID
node src/cli.mjs user --tenant owner-dev --username YOUR_AUTHOR_USERNAME --role member
node src/cli.mjs user --tenant owner-dev --username YOUR_REVIEWER_USERNAME --role admin
```

The user commands prompt for passwords privately in your terminal. Do not put passwords in command arguments, source files, chat, or screenshots. Distinct authenticated accounts are required for source and commercial review. This enforces account separation; it does not establish that two accounts belong to different real-world people.

Start without any provider configured:

```sh
node src/cli.mjs serve --tenant owner-dev --port 4141
```

Open `http://127.0.0.1:4141`. The app binds only to loopback. It does not deploy, expose a public service, create example customers, or seed fake business records.

## Connect an existing model

For an existing Claude Pro/Max subscription already signed in through the official CLI:

```sh
COMMERCE_DRAFT_PROVIDER=claude-cli node src/cli.mjs serve --tenant owner-dev --port 4141
```

The adapter verifies subscription OAuth status, disables tools/MCP/hooks/slash commands and session persistence, and runs in an isolated temporary directory. It does not select a new model or pass API keys. Source text intentionally supplied for drafting is sent to your existing Claude service. Use only material you are authorized to send there. Provider model usage is recorded as subscription usage, not a claimed cash invoice or zero-cost API call.

For an **existing installed text model** served by Ollama:

```sh
COMMERCE_OLLAMA_MODEL=YOUR_EXISTING_MODEL_NAME node src/cli.mjs serve --tenant owner-dev --port 4141
```

An embedding model such as `nomic-embed-text` cannot write proposals. A manifest without its weight files is not an available model. Do not run `ollama pull` or create a model to satisfy this setup; choose an existing working model/service instead. The app calls only the local chat API; unavailable models fail explicitly. No paid provider is enabled automatically.

## Connect PayPal sandbox

In your own local runtime environment, configure these names without committing their values:

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `COMMERCE_PAYPAL_ENABLED=1`

The initialized merchant ID must match the app’s sandbox merchant. Add `COMMERCE_DRAFT_PROVIDER=claude-cli` or the existing Ollama model setting to use both integrations. The application reads its own configured credentials server-side; agents should never inspect or print their values. No `.env` file is required or read directly by this repository.

Register `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED` and `PAYMENT.CAPTURE.REVERSED` for the app webhook. Run `node src/cli.mjs sandbox-check` for a read-only OAuth/webhook configuration check. Start with `--webhook-port 4143` to add a separate loopback receiver serving only `POST /api/paypal/webhook`; the account UI remains on port 4141. Real delivery still requires separately authorized HTTPS forwarding to the webhook-only port. No tunnel or deployment is started. See [SANDBOX-ACCEPTANCE.md](SANDBOX-ACCEPTANCE.md) for the setup and real-payment evidence gates. Simulator events do not prove the real sandbox flow.

Sources: [Orders v2](https://developer.paypal.com/api/orders/v2), [webhook verification](https://developer.paypal.com/api/rest/webhooks/rest/), [idempotency](https://developer.paypal.com/api/rest/reference/idempotency/).

## The working journey

1. Sign in as the author. Add owner-controlled service/scope material. New material enters quarantine.
2. Sign in as a different authorized reviewer. Review the text and approve ordinary business material.
3. As the author, select approved sources, describe the desired scope and enter exact USD fee/deposit terms. The configured model drafts requirements, deliverables, questions and source citations. It cannot choose amount, payee or authority.
4. As the reviewer, inspect the cited passages and exact commercial terms, then approve the immutable proposal revision.
5. As the author, prepare checkout, explicitly approve in PayPal sandbox using the buyer account, check provider status and confirm sandbox capture.
6. A verified matching capture unlocks kickoff. Repeated callbacks and repeated kickoff requests return the same local project.
7. Withdraw a supporting source. New dependent actions are blocked, and paid work is held for review. This does not erase a payment fact or move funds.

Browser success redirects have no payment authority. A pending capture does not unlock delivery. An ambiguous provider result enters reconciliation, with an explicit retry using the original operation ID only inside the recovery window. No automatic refund, payout, escrow or live-money path exists.

## Verification

```sh
npm test
npm run check
```

The HTTP tests bind a temporary loopback port and use disposable accounts, SQLite databases and fixture transports. They make no real model or PayPal calls. Test fixtures exist only in temporary test stores and are removed afterwards. The browser evaluation harness is explicitly labeled fixture-backed:

```sh
node test/browser-fixture.mjs
```

Stop it with Ctrl-C to remove its temporary state. Do not present fixture output as real AI or payment evidence. Real-model evaluation is opt-in and separate from the default test suite; `test/real-model-evaluation.mjs` sends only a public hackathon requirements brief through existing subscription access and requires an explicit output path.

## Scope and contribution

The enclosing Veloce application predates this entry. This newly authored standalone module implements the knowledge-bound proposal, commercial review, sandbox provider, payment reconciliation/kickoff and focused UI contribution. The module's [MIT license](LICENSE) applies to this directory only; it does not relicense the enclosing Veloce repository or optional third-party adapters. Node and installed model/service clients retain their own licenses and terms.

Current verification is recorded per milestone. A passing fixture journey is not real PayPal interoperability, customer validation, semantic proof for every citation, complete financial retention policy, or production readiness. Those remain separate acceptance work before a real client rollout.

## Content cleanup

The standalone operator can preview and apply tenant-scoped expired content cleanup. See [LIFECYCLE.md](LIFECYCLE.md) for the commands, seven-day recovery boundary, retained financial records and remaining restore/host gaps. No cleanup runs on a schedule.

Protected local snapshot export/restore is also documented in [LIFECYCLE.md](LIFECYCLE.md). Restore preserves original clocks and financial replay identity while revoking old approvals; it is an offline recovery staging workflow, not automatic disaster failover.


## Opt-in real model through the application

`test/real-model-http-evaluation.mjs` runs the authenticated HTTP source → source review → real drafting → persisted proposal path using only the public challenge brief and the existing Claude subscription. It uses disposable test accounts and synthetic terms, disables PayPal, verifies that the author cannot approve its own proposal, and leaves semantic/commercial review pending. No real client material is sent. It is excluded from `npm test`.

```sh
node test/real-model-http-evaluation.mjs --out /PRIVATE/NEW-EVIDENCE.json
```

The output path must not exist. The evidence includes only public-text model output, test proposal/terms and verification metadata, not credentials/session tokens. `--keep-open` leaves its temporary loopback app running for browser review; stop with Ctrl-C to remove temporary accounts/state. The two disposable evaluation account names/password are in the harness source and must never be used in a real runtime. An account-separation test does not establish review by two distinct real people. Review every claim against the source before approving; a citation marker and valid JSON do not prove semantic support.


## Correct a rejected draft

A reviewer can request changes with a reason. The original author then opens **Correct this draft**, edits the title/scope while preserving `[source:…]` citations, and saves a new immutable revision. The source references, total/deposit, merchant, policy, original creation time and expiry remain fixed. The old text and rejection remain visible as superseded; the new digest needs a fresh review from a different authorized account.

Correction is available only after rejection, while sources and the original window are still current. It refuses unknown/missing citations, stale digests, different authors and duplicate successors. A proposal family with approved or payment work cannot use this path to evade that authority or an uncertain payment. Changed commercial terms or evidence need a separately prepared proposal; the editor does not silently revise an approved agreement.

`test/correction-browser-evaluation.mjs --from /PRIVATE/RETAINED-PUBLIC-MODEL-EVIDENCE.json --out /PRIVATE/NEW-REVIEW-EVIDENCE.json` can replay the prior public-challenge evaluation for browser correction without a new model call. The app is labeled fixture-backed; the harness validates the public source/hash, retains the original model proposal digest, uses synthetic accounts/terms, disables providers and saves final review state on Ctrl-C before deleting its temporary store. The disposable accounts/password are in that harness and must never be used outside the test. This is recorded-output review evidence, not a live model/payment run or two-real-person approval.
