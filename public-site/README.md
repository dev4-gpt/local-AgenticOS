# Veloce AgenticOS Public Site

This Vite/React folder is intentionally independent from the private Veloce AgenticOS dashboard. It has no private API routes, provider credentials, agent controls, analytics key, filesystem access, or browser-accessible lead database credential.

Previous Cloud Run beta: <https://veloce-agenticos-site-mquo4bf7aq-ew.a.run.app>

Current production link: <https://veloce-agenticos-public.vercel.app>

## Configure before publishing

Edit `public/config.js` and set exactly one contact route:

- `bookingUrl`: a real Cal.com or other scheduling URL; preferred.
- `contactEmail`: a monitored business email; used if no booking link exists.
- `contactUrl`: a safe external destination. The repository is the default fallback.

The engagement form posts to the configured Veloce server-side intake endpoint.
That endpoint validates and rate-limits requests before inserting into Supabase;
the service-role credential remains in Vercel, never in this static site. The
default production endpoint allows requests only from this Cloud Run origin and
labels them `landing-cloud-run`. If it is unreachable, the fallback copies the
visitor's brief and opens the configured contact route.

Production verification on 2026-07-29: the exact-origin preflight returned
HTTP 204, a synthetic `landing-cloud-run` submission returned HTTP 200, and
the one matching Supabase row was removed with HTTP 204. This proves database
capture. Resend then verified the `veloceos.cloud` sender domain; a synthetic
lead produced an accepted notification, confirmed inbox delivery, and a deleted
test row.

The shared Vercel intake is configured with its optional Resend variables, so
this landing receives the same operator notification as the Product Experience
and `/start` forms. The static Cloud Run site still holds no email or database
credential.

Do not place API keys, private dashboard URLs, local machine paths, or client information in this folder.

## Preview locally

Run `npm install` once, then use `npm run dev`. Build with `npm run build`; the deployable output is `dist/`.

## Deploy to Vercel

From this folder:

```bash
npm install
npm run build
vercel deploy --prod
```

`vercel.json` sets the Vite build and `dist/` output directory. Keep
`public/config.js` free of secrets. Its `leadCaptureUrl` is a public API URL,
not a Supabase key.

## Deploy to Cloud Run

From this folder, after Google Cloud CLI authentication and selecting a project:

```bash
gcloud run deploy veloce-agenticos-site \
  --source . \
  --project veloce-agenticos-2026 \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 0 \
  --max-instances 2 \
  --memory 256Mi \
  --cpu 1
```

This deployment is public only because the site is static. Do **not** deploy the main Veloce AgenticOS dashboard this way. The dashboard has local-agent and private-data capabilities that require a separately designed, authenticated product boundary.

The container exposes `/status` for deployment verification. Cloud Run reserves the exact `/healthz` path in this environment, so it is not used as the application endpoint.

## Production checklist

1. Verify the configured server-side intake with a non-personal test lead and
   delete that row before paid acquisition.
2. Add a custom domain and HTTPS.
3. Add privacy policy, terms, and a consent-aware analytics tool if you begin tracking visitors.
4. Confirm no source folder exposes secrets with `rg -n --hidden '(API_KEY|sk-[A-Za-z0-9_-]{20,})' .`.
5. Use the client portal only after real identity access is configured; a static password page is not security.
