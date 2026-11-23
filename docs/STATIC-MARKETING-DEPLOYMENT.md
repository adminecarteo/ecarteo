# Static marketing deployment and rollback

The owner selected a free static marketing frontend, and production was promoted on 23 November 2026. The permanent public address stays **https://ecarteo.fr/**; the existing Next.js fullstack service remains the dynamic backend. Root and `www` are the only two custom hostnames. `app.ecarteo.fr` remains retired.

## Current production state and open items

All times below are UTC on **23 November 2026**.

| Item                      | Recorded state                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public frontend           | `srv-dc247ilg1s2s73esu650` (service name `ecarteo-public-preview`) serves https://ecarteo.fr/                                                             |
| Source                    | `main`, `09ca7c03eaceecebc4ac2a3c0e7035b41a217c7c`; [successful CI 45192954565](https://github.com/adminecarteo/ecarteo/actions/runs/45192954565)         |
| Current static deployment | `dep-dc24tah7lnhs7394dlt0`, live **14:33:42**; same-commit redeploy invalidated the stale HTTPS `www` redirect cache                                      |
| Backend deployment        | `srv-dbtfv3ec6qcc73942dng`, `dep-dc24ng3m8hqs73b638g0`, live **14:22:48**, same source                                                                    |
| Publish directory         | `out/marketing/public`                                                                                                                                    |
| Static configuration      | `NODE_ENV=production`, `APP_URL=https://ecarteo.fr`, automatic deployment off; global preview noindex header removed                                      |
| Production fallback       | External rewrite to https://ecarteo-production.onrender.com/*; backend provider hostname remains enabled                                                  |
| Static provider hostname  | Direct browsing at `ecarteo-public-preview.onrender.com` is disabled (404); it remains the custom-domain DNS target                                       |
| Domain attachment         | Root `cdm-dc24qcmq1p3s73bpbklg` and `www` `cdm-dc24qcmq1p3s73bpbkm0` attached to static at **14:26:58**; both verified and normal TLS passed **14:28:43** |
| Production acceptance     | Admin/operator/client API and browser journeys, mobile French/English navigation and private response checks passed; no production data writes            |
| Staging restoration       | Temporary `APP_URL` override removed; `dep-dc24mbbm8hqs73b5vr80` live **14:18:37**, original staging origin validated                                     |

Remaining cutover checks:

- **DNS manager action:** authoritative `www` CNAME still points to `ecarteo-production.onrender.com`; replace it with `ecarteo-public-preview.onrender.com`. Current HTTPS success does not complete this DNS action. Keep apex A `216.24.57.1` and mail/verification records unchanged.
- **HTTP redirect query preservation:** cached HTTP apex and HTTP `www` redirects at `/` still drop query parameters. The successful static redeploy fixed HTTPS `www` redirects, and distinct HTTPS query strings now survive. The HTTP issue remains open at the provider edge; do not report all four query-bearing redirect cases as passed. The backend is Free with `cache.profile=no-cache`, so Render's documented web-service-cache purge does not apply. No automatic HTTP redirect expiry is promised by the published documentation. Use the canonical HTTPS address for campaign links while this is investigated.
- **Production cold-backend proof:** still pending. The last recorded private request was **14:30:46**; allow natural sleep and confirm the instance state through Render before checking public files. Earlier staging evidence below demonstrates the architecture but is not the final production measurement.
- **Search Console:** ownership verification and sitemap submission remain separate from deployment.

The public frontend uses real prerendered HTML and its own `/marketing-assets/`, not captured Next HTML/RSC output. The production application code is unchanged from the accepted `6f88fe7`; `09ca7c0` added deployment documentation. The 10 MiB upload/PDF acceptance below was performed in staging, not repeated by creating production records.

## Historical staging acceptance

Before promotion, this service was a blocked, domainless preview. Hosted transport acceptance used backend revision `6f88fe7`, deployment `dep-dc24gheq1p3s73bogpgg`, live at **14:07:55**, with the preview as the temporary staging `APP_URL`. [Exact backend revision CI](https://github.com/adminecarteo/ecarteo/actions/runs/45189932608)

Completed staging checks on 23 November:

- At **14:05:11 UTC**, all six public pages, robots, sitemap and 78 published assets returned 200 while Render reported no staging instance both before and after the requests. No backend data endpoint was requested. This proves the candidate's public pages can work independently of the sleeping Free backend.
- All five trailing-slash public variants also returned static HTML, retained query parameters and declared their clean canonical URLs. No additional redirect rules were needed.
- Three existing staging roles passed real login, secure cookies, scoped workspaces, anonymous denial and wrong-origin CSRF rejection. Regular private responses retained `private, no-store`, `Vary: Cookie`, and bypassed the shared cache.
- An existing published **10 MiB** QA evidence download matched Storage and database SHA-256. A temporary **10 MiB** multipart upload matched Storage bytes and digest; owner deletion succeeded. Only this run's temporary mission, staged rows and objects were removed, with no immutable evidence/events/reports created.
- A genuine recovery token for the existing QA client passed through the preview, redirected to its `/reset-password` route and established the exact expected session. Reuse was rejected. No email was sent and no password was changed during this proxy test; actual staging email delivery is recorded separately in [launch status](LAUNCH-STATUS-2026-11-23.md).
- Admin, operator and client browser journeys passed, completing at **14:15:20 UTC**. Real sign-in/sign-out, secure host-only cookies, protected data, 320/390-pixel French/English mobile menus and full-document navigation back to marketing passed with no captured browser errors, warnings or failed requests. The client downloaded an actual 5,956-byte PDF from an existing published QA report. The temporary PDF was removed and every browser/session closed. This is viewport emulation and a PDF signature/size check, not physical-device acceptance or a new visual PDF review. The empty-client Offers link was inspected in code but not exercised because the test client has reports.

The proxy removes `Cookie` from `Vary` on bodyless **GET 303/304** responses; the direct backend retains it. This difference was investigated rather than treated as full header preservation: those responses still had `private, no-store`, `CF-Cache-Status: BYPASS` and no `Age`. Reusing a client's ETag anonymously returned 401; using it as the operator returned that operator's own 200 response with a different ETag. The application authenticates and loads the current actor's workspace before computing/comparing ETags. No shared caching or cross-role response was observed. Keep this regression check when changing proxy/cache configuration.

Sanitized local evidence is retained under `/private/tmp/ecarteo-static-preview-20261123`: `cold-static-acceptance.json`, `trailing-paths.json`, `proxy-transport-result.json`, `proxy-header-recovery-result.json` and `hosted-ui-all-roles.json`. The initial strict header check records its failure; the follow-up records the specific header behavior and successful functional checks. These receipts contain no credentials, cookies or used recovery links. Production domain/TLS evidence is recorded separately in `https-cutover-monitor.json`; provider cache settings are in `cache-profiles-after-cutover.json`.

## Required route ordering

The hosted preview established a significant ordering detail: an external catch-all rewrite can run **before** clean-URL `.html` resolution. A published `methode.html` alone did not keep `/methode` on the static service. Use explicit mappings for all five extensionless non-root pages before the external fallback.

This is the current **production** `routes` block, not a complete Blueprint or a request to create another service. Its array order corresponds to priorities **0 through 5**:

```yaml
routes:
  - type: rewrite
    source: /methode
    destination: /methode.html
  - type: rewrite
    source: /offres
    destination: /offres.html
  - type: rewrite
    source: /mentions-legales
    destination: /mentions-legales.html
  - type: rewrite
    source: /confidentialite
    destination: /confidentialite.html
  - type: rewrite
    source: /conditions
    destination: /conditions.html
  - type: rewrite
    source: /*
    destination: https://ecarteo-production.onrender.com/*
```

`/` is served from the real `index.html`; `/robots.txt`, `/sitemap.xml`, `/icon.svg` and `/marketing-assets/*` are real published files. Authentication screens, `/app`, `/api`, `/auth` and `/_next` fall through to the same Next backend. Marketing/app boundary links must perform a full document navigation. Do not replace the fallback with `/index.html`, which would return marketing HTML for private handlers and API requests.

The historical staging preview used `https://ecarteo-staging-zy4j.onrender.com/*` as the final destination. Future staging acceptance must use a separate preview service without production domains; do not repoint the live frontend to staging. [Render rewrite rules](https://render.com/docs/redirects-rewrites)

## Acceptance procedure for future changes

1. Build with `npm ci --include=dev && npm run build:marketing`; publish only `out/marketing/public`. Run `npm run test:marketing` in CI, not after the final production build: the test intentionally leaves a blocked preview artifact. The SSR renderer, receipt and all backend secrets stay outside the publish directory.
2. Use a separate static preview as the staging browser origin, keeping its robots/noindex policy blocked and production domains detached. A controlled staging `APP_URL`/Supabase callback change may be needed for real authentication because the current CSRF check requires the exact expected origin. Following the completed acceptance, staging `APP_URL` is again **absent**; the application uses `RENDER_EXTERNAL_URL`. Inspect its actual setting before another test. If absent, record that absence, temporarily add only the new preview `APP_URL` if required, and restore it by deleting that added setting afterward. Capture any callback configuration before a separate change, use exact preview callback URLs and restore it after acceptance. Do not add arbitrary origins or change production SMTP, passwords or callbacks for this preview.
3. Check that login and refresh preserve every required `Set-Cookie` header and its security attributes, including chunked sessions. Verify sign-out and rejected session replay, confirmation/recovery, admin/operator/client authorization and cross-tenant denial through the frontend. Keep tokens and cookie values out of evidence files.
4. Verify backend-emitted `Cache-Control: private, no-store` on private responses, including sessions, protected HTML, API results and sensitive auth redirects. Static-site header rules may not apply to externally rewritten responses. Check actual proxy responses, original-origin enforcement, and repeated requests from separate identities; a private response must not be served as a shared CDN cache hit. The backend's no-referrer auth-link policy must also survive the proxy.
5. Verify the actual 10 MiB evidence upload/download, PDF access, French/English persistence, mobile menu and both directions of navigation across the static/Next boundary. Static marketing must use its own asset namespace; Next assets remain with the backend.
6. After the staging backend naturally sleeps, observe its state through Render's control plane. Request all six canonical marketing URLs, their stylesheet/script/fonts, robots and sitemap, then confirm the backend is still asleep. A preceding data-plane health request would wake it and invalidate this particular independence check. Do not disable production monitoring or artificially keep a Free service awake to obtain a pass.

Render documents external rewrite forwarding of method/body/query and request cookies, but this is not a substitute for Écartéo's response-cookie, cache and upload acceptance above. [Render proxy behavior](https://render.com/articles/how-to-proxy-analytics-through-your-own-domain)

## Coordinated production cutover

The domain promotion below has been performed; the DNS and HTTP-query items listed above remain open. Retain this procedure for future moves. Complete candidate/proxy acceptance first, arrange the DNS manager's availability and allow a short cutover window: removal/re-attachment can interrupt routing or certificate readiness. Save the current public Render routes/headers/domain records and DNS values as the rollback record, without exporting secrets.

1. Merge and deploy the accepted source revision to the production Next service, including the full-document links back to marketing. Verify production readiness and root login while the current domain routing still works. The existing provider URL must remain enabled because the static frontend will proxy to it.
2. Prepare the static service with the same reviewed source, production fallback target, `NODE_ENV=production` and `APP_URL=https://ecarteo.fr`. Add only a verified public `GOOGLE_SITE_VERIFICATION` content token if available. Remove the preview's global `X-Robots-Tag: noindex, nofollow` header before attaching the public domain; authentication and private paths retain the backend's own indexing restrictions. Build once and check the six indexable canonical pages, nonempty sitemap and public robots response. The candidate's provider hostname is not a replacement production origin for authentication.
3. Keep the backend's `APP_URL=https://ecarteo.fr`, production Supabase Site URL/callbacks and GitHub monitoring origin unchanged. No database, customer-account, SMTP or production-session migration is required because the public hostname remains the same.
4. In the agreed window, remove the root/`www` custom-domain pair from the fullstack service and attach `ecarteo.fr` to the static service. Confirm Render's added `www` hostname redirects to the root and that the workspace still has only these **two** custom hostnames. Do not leave duplicate registrations or add `app` as a third hostname.
5. Have the one.com DNS manager apply the following scoped change and confirm it. **The `www` change remains pending in authoritative DNS at the time of this record.** Use Render's displayed records if the platform requests a different value at cutover; do not guess a replacement address.

| Record             | Previous / still-observed value   | Required production static destination                                 |
| ------------------ | --------------------------------- | ---------------------------------------------------------------------- |
| Apex A, blank host | `216.24.57.1`                     | Keep `216.24.57.1` unless Render explicitly provides a different value |
| `www` CNAME        | `ecarteo-production.onrender.com` | `ecarteo-public-preview.onrender.com`                                  |

Preserve MX, mail A/CNAME, SPF, DKIM, DMARC, verification TXT records, nameservers and unrelated records. The retired `app` CNAME can be removed separately; that deletion does not create a redirect.

6. Verify Render domain ownership and both TLS certificates normally. Test all four root/`www` HTTP/HTTPS cases, path/UTM preservation, the six public pages/assets, robots, sitemap and an actual root-domain login/session/sign-out. Check backend readiness and private cache/authorization behavior through the new frontend. Do not bypass certificate validation.
7. Disable the static service's provider browsing URL after custom-domain validation, keeping the backend provider URL enabled for rewrites. This is now configured. Record the static/backend revisions, domains, DNS and acceptance evidence. Complete the cold-origin independence check for the deployed arrangement before calling the public crawl restriction fully verified. Search Console verification/submission remains a separate action. The Free dynamic backend can still have login/app cold starts.

## Rollback

Keep the existing fullstack service and its working deployment available. Its provider URL is currently enabled and must remain accessible. If routing, TLS, authentication, private caching or uploads fail:

1. Remove root/`www` from the static service and restore them to production fullstack service `srv-dbtfv3ec6qcc73942dng`, keeping the custom-domain count at two. Verify `www` redirects to `https://ecarteo.fr`.
2. Have the DNS manager restore `www` CNAME to `ecarteo-production.onrender.com` and any apex change to the saved value. Verify DNS propagation and TLS without bypasses. A brief interruption may occur during domain restoration.
3. Backend `APP_URL`, Supabase root callbacks and monitoring origin should still be unchanged. If a candidate backend code change caused the failure, redeploy the captured working revision through Render; do not restore or delete the database to roll back frontend routing.
4. Confirm root public pages, protected readiness, a normal login/session/sign-out and private cache behavior again. Preserve accounts, audit records, evidence and backups.
5. Only after production recovery and both domain removals are verified, the former static frontend may become a preview again: restore blocked robots/noindex settings, select an isolated staging fallback and rebuild. Its provider browsing URL is currently disabled; explicitly re-enable it if preview access is needed. Never point the live production-domain frontend at staging. Restore any temporary staging origin/callback settings and record the failed acceptance item before another attempt.

[Render custom domains](https://render.com/docs/custom-domains), [Render DNS configuration](https://render.com/docs/configure-other-dns)
