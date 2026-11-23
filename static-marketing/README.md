# Static marketing frontend

The production public frontend at **https://ecarteo.fr/** uses this build. It reuses the existing marketing and legal React components, styles and fonts and emits six real French HTML pages, including headings, text, navigation and footer before JavaScript runs. The browser hydrates that markup and restores the existing French/English preference cookie. Language switching also updates the document language, title, description and footer locally.

```sh
npm ci --include=dev
npm run build:marketing
npm run test:marketing
```

Publish **only `out/marketing/public`**. The SSR renderer and build receipt are outside that directory. The default artifact blocks indexing and has an empty sitemap. The build does not load `.env` files or require Supabase/database credentials.

For an approved production build, explicitly supply `NODE_ENV=production` and `APP_URL=https://ecarteo.fr`. An optional `GOOGLE_SITE_VERIFICATION` content token is validated by the same helper used by the main app; it is a public verification value, not a secret. Unknown origins, development and backend-only targets stay blocked. Changing a build setting requires rebuilding these static files.

```sh
NODE_ENV=production APP_URL=https://ecarteo.fr npm run build:marketing
```

All static assets use `/marketing-assets/`. `next/link` is replaced only for this build with ordinary anchors; the static locale provider does not import Next routing. The build rejects client bundles containing Next, auth components, Supabase or backend modules. HTML output is not captured from a running Next application and contains no Next/RSC payload. The verification script also checks complete page content, CSS class consistency, asset existence, discovery rules, token validation and environment isolation across six build configurations; it leaves a blocked preview artifact afterward.

## Hosting boundary

The Render static front serves these real files and proxies remaining dynamic paths to the existing fullstack service with an external rewrite. Authentication pages, `/app`, `/api`, `/auth` and `/_next` stay together on the existing backend. Use a full document navigation when crossing between marketing and the Next application.

Service `srv-dc247ilg1s2s73esu650`, originally named `ecarteo-public-preview`, now owns production `ecarteo.fr` and `www.ecarteo.fr`. Both domains passed normal TLS validation at **14:28:43 UTC on 23 November 2026**. Its `main` source is `09ca7c0`, with [successful CI 45192954565](https://github.com/adminecarteo/ecarteo/actions/runs/45192954565), `NODE_ENV=production`, `APP_URL=https://ecarteo.fr` and automatic deployment disabled. The global preview noindex header has been removed. Direct browsing at `ecarteo-public-preview.onrender.com` is disabled and returns 404; the hostname remains the DNS CNAME target. The production backend's provider URL remains enabled for the external rewrite.

Production API and browser checks passed for admin, operator and client, including mobile French/English navigation, without writing production data. The same application code previously passed staging 10 MiB upload/download, PDF, authentication and cache-isolation checks. Staging's temporary origin override has been removed and its original origin verified. The DNS manager still needs to replace the authoritative `www` CNAME with `ecarteo-public-preview.onrender.com`. Cached HTTP apex/www and HTTPS `www` redirects at `/` drop query parameters; the HTTPS `www` issue recurred at **14:59:32 UTC**, so the earlier post-redeploy pass was temporary. Canonical `https://ecarteo.fr/` campaign links avoid the affected redirects. The production cold-backend independence check remains pending; the earlier staging version passed that check.

**Explicit clean-path rewrites are required.** In the hosted preview, the external `/*` fallback ran before Render resolved `/methode` to the existing `methode.html`. Place all five clean-path-to-HTML rewrites ahead of the backend fallback. Otherwise a marketing page can reach the sleeping backend even though its HTML file was published. The exact ordered routes, cutover and rollback are in [Static marketing deployment](../docs/STATIC-MARKETING-DEPLOYMENT.md).

Static-site header rules must not be assumed to apply to externally proxied responses. The backend must emit its own private cache controls and authentication security headers; verify them through the public proxy with separate identities before cutover.

For future changes, verify the hosted proxy on a **separate preview** with an isolated staging origin: response cookies, original request Origin, no private CDN caching, login/logout, confirmation/recovery, authorization, 10 MiB uploads/downloads, PDF and French/English navigation. Do not repoint the live frontend to staging, weaken CSRF or place server credentials in this static build. Prove all six HTML pages, assets, robots and sitemap work with the backend asleep. The authenticated app can still have a cold start on a Free backend.

Running the local build does not change routing, DNS, accounts, databases or paid resources. Deployment IDs, historical acceptance, open items and rollback instructions are recorded in [Static marketing deployment](../docs/STATIC-MARKETING-DEPLOYMENT.md).
