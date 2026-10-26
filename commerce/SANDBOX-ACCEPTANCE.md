# Real sandbox acceptance

This is an operator runbook, not a passing acceptance report. Default tests use fixtures; a configured app, a real sandbox buyer approval/capture and a verified actual webhook are still required. No live-money endpoint exists.

## Configure and check

Use your PayPal developer dashboard to select your existing sandbox app and merchant, create/select a separate sandbox buyer, and configure the credential names from README in your own terminal/runtime. Keep values out of chat, command arguments, recordings and the source package. The application does not read `.env` files or download tools/models. Register the actual public HTTPS callback as `/api/paypal/webhook` for the four capture events listed below.

With Node 24 on PATH, from this directory:

```sh
node src/cli.mjs sandbox-check --tenant owner-dev
```

This command creates no database and reads no local credential files. With missing environment configuration it reports only missing variable names and exits nonzero. With configuration present it obtains a sandbox OAuth token and uses `GET /v1/notifications/webhooks/{id}`. It prints only booleans and missing event names, never the token, client credentials, full callback URL or full provider response. It does not create orders, register/update webhooks, capture money or enable paid services. A `ready: true` result means configuration checks passed; reachability, merchant identity and the payment journey are explicitly **not** proven by it.

Required capture subscriptions:

- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.PENDING`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REVERSED`

## Start the isolated callback listener

```sh
COMMERCE_DRAFT_PROVIDER=claude-cli node src/cli.mjs serve --tenant owner-dev --port 4141 --webhook-port 4143
```

`COMMERCE_PAYPAL_ENABLED=1` and the three PayPal environment names must already be configured. Without PayPal the extra callback port is refused. The account UI binds only to `127.0.0.1:4141`; the separate callback listener binds only to `127.0.0.1:4143`. Choose distinct ports. The receiver accepts only `POST /api/paypal/webhook` with JSON, the PayPal verification headers and a bounded body. It has no UI, login, asset or health route. It accepts the forwarded Host because its only authority is provider signature verification plus exact stored payment matching; it never trusts inbound tenant/account fields.

No public listener, HTTPS termination, tunnel, DNS or deployment is created by this command. Once explicitly authorized, the operator can forward an HTTPS endpoint **only to the webhook listener**, with the path preserved. Never forward the account UI port. The proxy should bound request size and rate. The receiver bounds simultaneous signature checks and returns 503 for overload so the provider can retry. Both local listeners stop with Ctrl-C.

The existing app-port callback also remains available for controlled internal setups, with the app's strict local Host check. The separate receiver removes the need to rewrite that Host or expose the app to get callbacks. Simulator events are not proof of the real flow and do not establish postback signature verification.

## Run and retain evidence

Use only synthetic or public service material and actual sandbox accounts. Keep the sandbox indicator visible. Record the candidate Git commit, UTC time, Node version and model actually returned. Do not record credentials, passwords, authorization headers, raw buyer details or unfiltered provider payloads.

1. Submit a fictional/public source as author. Review and approve it through a different reviewer account. Generate a real model draft; manually check the meaning of each cited requirement. Set the amount and merchant through the operator-controlled configuration/UI.
2. Review the exact proposal digest and fee/deposit terms through the separate reviewer account. Prepare one checkout. Confirm that the returned approval link belongs to `www.sandbox.paypal.com`.
3. The buyer explicitly approves in PayPal sandbox. Return to Commerce and check payment status. Confirm sandbox capture once. A browser redirect alone is never payment authority.
4. Confirm provider-backed order/capture amount, USD currency, merchant and intent identity. Pending or ambiguous results stay pending/reconciling and must not be called successful. The server pins the sandbox API and rejects mismatches.
5. Check the actual PayPal webhook delivery log: the configured endpoint must receive the capture event and return 200 after postback verification. The application commits its processed inbox identity, payment observation and kickoff-outbox update together. An unsigned request, failed signature, or unmatched event is not passing evidence.
6. Create kickoff; repeat the status check and kickoff action. The project ID/count must remain one. If PayPal resends the actual event, it must be treated as a duplicate with no extra project. Use the provider dashboard's explicit resend only under owner authorization; do not fake an event body as evidence.
7. Withdraw the supporting source. Payment reconciliation must retain the actual capture while new commercial actions and kickoff are held for review. An in-flight or ambiguous operation must retain its original request identity; do not create a new intent to hide an unresolved result.
8. Save a private, redacted evidence report: current commit, exact local action sequence/timestamps, synthetic proposal digest, amount, provider-reference suffixes, actual event delivery/verification status, kickoff ID/count, repeated-delivery outcome and observed limitations. Do not claim successful criteria whose evidence is missing.

This run is still pending in the current project. The setup checker cannot replace steps 1–8. A future public demo must identify what was actually performed and keep any fixture-only segment labeled.

Sources checked October 26, 2026: [PayPal Orders v2](https://developer.paypal.com/api/orders/v2), [webhook management and verification](https://developer.paypal.com/api/webhooks/v1), and [webhook overview](https://developer.paypal.com/api/rest/webhooks/rest/).
