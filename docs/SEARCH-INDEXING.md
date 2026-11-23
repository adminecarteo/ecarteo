# Public website and search discovery

The permanent public address is **https://ecarteo.fr/**. Marketing pages and the authenticated application use this origin. `www.ecarteo.fr` redirects to the root. `app.ecarteo.fr` was retired during the [root-domain migration](ROOT-DOMAIN-MIGRATION.md) and is not a required service or redirect.

## Published routes

The production [static marketing build](../static-marketing/README.md) generates `/robots.txt` and `/sitemap.xml` at build time. The Next application retains equivalent runtime discovery routes for fullstack deployments. Public indexing is enabled only with production mode, `APP_URL=https://ecarteo.fr` (an optional trailing slash is accepted), and a deployment target other than `backend`. Staging and local deployments return `Disallow: /`, an empty sitemap and `noindex` on public pages.

The production sitemap contains these canonical URLs:

- `https://ecarteo.fr/`
- `https://ecarteo.fr/methode`
- `https://ecarteo.fr/offres`
- `https://ecarteo.fr/mentions-legales`
- `https://ecarteo.fr/confidentialite`
- `https://ecarteo.fr/conditions`

Each page declares its matching canonical URL. The sitemap does not invent modification dates or language-specific URLs: language selection currently uses a cookie on these same routes.

The application's production robots response allows public pages and assets, excludes `/app`, `/api/` and `/auth/`, and references `https://ecarteo.fr/sitemap.xml`. Login, signup and recovery forms are omitted from the sitemap and retain `noindex`; they are crawlable so search engines can read that directive. Authentication and authorization continue to protect private data independently of robots rules.

## Static marketing and the Free backend

Render automatically returns a blocking robots response while a Free **web service** is asleep. A `/robots.txt` request neither reaches that web service nor wakes it. This is documented in [Render's Free service limitations](https://render.com/docs/free#automatic-robotstxt-responses). Production public discovery is now served from a separate static site; authentication and the audit application still use the Free backend and can have cold starts.

The owner selected a free static marketing frontend; no compute upgrade or artificial keepalive was introduced. On 23 November at **14:05:11 UTC**, the static preview served all six public pages, robots, sitemap and 78 assets while the staging backend had no running instance both before and after the checks. Root and `www` moved to that static service at **14:26:58 UTC**; normal HTTPS checks passed at **14:28:43 UTC**. Production's six pages and crawl files now return the static artifact, with public crawling allowed and no preview noindex header. The production backend remained active during final observation, so an additional actual production sleep-state measurement is not claimed. See the [deployment evidence and remaining checks](STATIC-MARKETING-DEPLOYMENT.md).

The manager still needs to update the `www` CNAME to `ecarteo-public-preview.onrender.com`, preserving the apex A record `216.24.57.1`. Cached HTTP homepage redirects currently drop query strings; HTTPS canonical links and the refreshed HTTPS `www` redirect preserve them. This is a separate [provider redirect-cache issue](RENDER-HTTP-REDIRECT-SUPPORT.md), not a robots or authentication failure.

The old `app` CNAME still points at Render, but Render no longer registers that hostname. A DNS manager may delete only the obsolete `app` CNAME; no replacement is required. Preserve apex, `www` and mail records. Removing this CNAME does not create a redirect for old links. Do not add a third Render hostname under the current free-only constraint.

## Google Search Console next step

Use the approved Google account belonging to `admin-dev@ecarteo.fr`. Do not use an unrelated connected personal or GFTIJ account as the owner.

1. In [Google Search Console](https://search.google.com/search-console/), select **Add property → URL prefix**, enter **`https://ecarteo.fr/`**, and choose **HTML tag**. This method verifies the canonical HTTPS prefix without a DNS change. A Domain property has broader protocol/subdomain coverage and requires DNS verification instead. [Google property types](https://support.google.com/webmasters/answer/34592?hl=en)
2. Copy the generated `google-site-verification` meta tag. It is a public verification value, not a password, access token or login code. Configure only its `content` value as `GOOGLE_SITE_VERIFICATION`; do not paste the entire HTML tag into the environment variable.
3. Set the value on the **production static frontend before its build**, then rebuild. A backend-only environment change cannot update the public homepage's static HTML. The Next helper can emit the same token for a future fullstack rollback, but the active public verification comes from the static artifact. The helper emits it only for an approved production build; staging stays unverified. Keep the tag in future deployments because Google rechecks ownership. [Google ownership verification](https://support.google.com/webmasters/answer/9008080?hl=en)
4. Confirm the exact tag appears once in the unauthenticated HTML source of `https://ecarteo.fr/`, then click **Verify** in Search Console. Record the property and successful ownership result; deploying a token alone is not a verification result.
5. After the static domain cutover and cold-state crawl checks pass, open **Sitemaps**, submit **`https://ecarteo.fr/sitemap.xml`**, and record Google's processing result.
6. Inspect `https://ecarteo.fr/`, run the live URL test, and check that crawling is allowed and the declared canonical is the root URL. Monitor sitemap processing and indexing reports afterward; sitemap submission does not guarantee indexing.

If the owner instead selects the Domain property `ecarteo.fr`, send its exact Google-generated TXT record to the one.com DNS manager and add it alongside existing TXT records. Preserve SPF, mail verification and other owners' verification records. No property-specific token has been supplied at this preparation step; ownership and sitemap submission remain pending.

Search Console ownership verification and submission are not performed by the application deployment. Blocking staging crawling also does not prove removal of any previously indexed staging URLs.

## Verification

The SEO unit tests cover public/private discovery, exact canonical URLs, preview rejection and runtime configuration. The production build was also started twice with different `APP_URL` values supplied **after** build: production returned six sitemap URLs and indexable marketing metadata, while staging returned a blocking robots response, an empty sitemap and `noindex`. Login and signup remained `noindex` in both cases.

Before accepting a deployment, check robots, sitemap XML, all six public pages and their canonical/robots metadata on the live service. Verify staging separately, and distinguish the application's active response from Render's sleeping-service response.

Application commit `3394ae6` passed these hosted checks on 23 November 2026: staging at **10:45:11 UTC** and production at **10:53:26 UTC**. The [handover](PRODUCTION-HANDOVER.md) records deployment IDs, CI and rollback. Sanitized response receipts are retained locally under `ecarteo-seo-20261123`.
