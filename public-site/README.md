# Veloce AgenticOS Public Site

This Vite/React folder is intentionally independent from the private Veloce AgenticOS dashboard. It has no private API routes, provider credentials, agent controls, analytics key, filesystem access, or lead database.

Previous Cloud Run beta: <https://veloce-agenticos-site-mquo4bf7aq-ew.a.run.app>

Current production link: <https://veloce-agenticos-public.vercel.app>

## Configure before publishing

Edit `public/config.js` and set exactly one contact route:

- `bookingUrl`: a real Cal.com or other scheduling URL; preferred.
- `contactEmail`: a monitored business email; used if no booking link exists.
- `contactUrl`: a safe external destination. The repository is the default fallback.

The fallback copies the visitor's brief and opens the repository. It does not submit or retain form data. Replace it with a monitored booking URL before running paid acquisition.

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
`public/config.js` free of secrets; the Supabase anon key is public-safe only
when the `signups` table has insert-only RLS.

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

1. The repository fallback is safe for launch; configure booking or monitored email routing before paid acquisition.
2. Add a custom domain and HTTPS.
3. Add privacy policy, terms, and a consent-aware analytics tool if you begin tracking visitors.
4. Confirm no source folder exposes secrets with `rg -n --hidden '(API_KEY|sk-[A-Za-z0-9_-]{20,})' .`.
5. Use the client portal only after real identity access is configured; a static password page is not security.
