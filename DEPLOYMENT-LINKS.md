# Deployment Links

Last checked: 2026-07-29

## Shareable Pages

- Landing page: <https://veloce-agenticos-public.vercel.app>
- Product/front door: <https://product-experience-five.vercel.app>
- Gated runtime intake: <https://product-experience-five.vercel.app/start>
- Internal cloud client-runtime test login:
  <https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/login?next=%2F>
- Internal cloud client-runtime service:
  <https://veloce-cloud-test-1075094991117.asia-south1.run.app>

The product front door now has a `Runtime access` dropdown:

- `Request runtime` routes to `/start`.
- `Client login` routes to the approved internal Cloud Run test runtime.

The product form is safe to market for lead capture. On 2026-07-29, the Vercel
production service-role credential was replaced, the product was redeployed,
and synthetic non-personal entries through both the front-door form and
`/start` were verified in Supabase then removed. The Cloud Run site's contact
surface intentionally does not store leads, so use the product form or `/start`
when a durable submission is required.

The Cloud Run links above are for the first internal pipeline test. They prove
the client-safe runtime path works, but they are not the permanent shared
runtime for every future client.

Approved client runtimes are not Vercel links. They are GCP Cloud Run services
created from a reviewed client-safe image with:

- `app-auth` mode for the current test: Cloud Run is
  `--allow-unauthenticated` so the login page can load, then app middleware
  requires Supabase Auth.
- a per-client service account
- a per-client storage bucket
- per-client Secret Manager entries
- explicit allowed Supabase user emails
- optional explicit Cloud Run invoker emails when using `cloud-run-iam` mode

For local acceptance testing, the owner runtime remains at
`http://127.0.0.1:3939/` and the client-safe mirror runs at
`http://127.0.0.1:3940/`.

Verification:

- Production URLs return `HTTP 200`.
- Landing page content is the Veloce AgenticOS site, not legacy FDE content.
- Product page dropdown is live and points `Client login` to Cloud Run, not to
  `localhost`.
- Cloud client-runtime verification passed against:
  <https://veloce-cloud-test-mquo4bf7aq-el.a.run.app>
- Deployed product HTML contains no `localhost`, `127.0.0.1`, obvious secret
  key patterns, or service-role key strings.
- Cloud runtime redirects unauthenticated root access to `/login`.
- GCP Secret Manager contains the Supabase publishable/anon key as
  `veloce-veloce-cloud-test-supabase-anon-key`; the manifest contains only the
  secret reference.

## Do Not Share Yet

- `https://public-site-five.vercel.app`
- Any raw `3939`/operator-runtime tunnel or deployment URL
- `veloce-cloud-test` as a real external-client runtime. Use it for internal
  validation only; create a separate manifest, service account, bucket,
  service, auth membership, and secret namespace for each real client.

This URL currently serves unrelated legacy FDE content, not the Veloce 4321
landing page.
