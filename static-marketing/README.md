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

The planned Render static front serves these real files and proxies remaining dynamic paths to the existing fullstack service with an external rewrite. This directory does **not** activate that service, proxy or domain cutover. Authentication pages, `/app`, `/api`, `/auth` and `/_next` stay together on the existing backend. Use a full document navigation when crossing between marketing and the Next application.

Before attaching a public domain, verify the hosted proxy with an isolated staging origin: response cookies, original request Origin, no private CDN caching, login/logout, confirmation/recovery, authorization, 10 MiB uploads/downloads, PDF and French/English navigation. Do not weaken CSRF or place server credentials in this static build. Prove all six HTML pages, assets, robots and sitemap work with the backend asleep. The authenticated app can still have a cold start on a Free backend.

No production routing, DNS, account, database or paid resources are changed by this local build.
