# Static marketing preview

This optional build reuses the existing marketing and legal React components, styles and fonts. It emits six real French HTML pages, including headings, text, navigation and footer before JavaScript runs. The browser hydrates that markup and restores the existing French/English preference cookie. Language switching also updates the document language, title, description and footer locally.

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

The hosted candidate is [ecarteo-public-preview.onrender.com](https://ecarteo-public-preview.onrender.com), service `srv-dc247ilg1s2s73esu650`. On 23 November 2026, all six canonical public pages and their assets passed static-serving checks. This candidate has no custom domains or configured environment values; indexing is blocked. Production remains on the fullstack service at release `2a27a67`. The candidate source `3a665a13` passed [quality gates 45187270254](https://github.com/adminecarteo/ecarteo/actions/runs/45187270254). This records public-file acceptance only, not complete hosted authentication, upload, cache or cold-origin acceptance.

**Explicit clean-path rewrites are required.** In the hosted preview, the external `/*` fallback ran before Render resolved `/methode` to the existing `methode.html`. Place all five clean-path-to-HTML rewrites ahead of the backend fallback. Otherwise a marketing page can reach the sleeping backend even though its HTML file was published. The exact ordered routes, cutover and rollback are in [Static marketing deployment](../docs/STATIC-MARKETING-DEPLOYMENT.md).

Static-site header rules must not be assumed to apply to externally proxied responses. The backend must emit its own private cache controls and authentication security headers; verify them through the public proxy with separate identities before cutover.

Before attaching a public domain, verify the hosted proxy with an isolated staging origin: response cookies, original request Origin, no private CDN caching, login/logout, confirmation/recovery, authorization, 10 MiB uploads/downloads, PDF and French/English navigation. Do not weaken CSRF or place server credentials in this static build. Prove all six HTML pages, assets, robots and sitemap work with the backend asleep. The authenticated app can still have a cold start on a Free backend.

Running the local build does not change routing, DNS, accounts, databases or paid resources. Production has not been moved to this hosted candidate.
