# Public website and search discovery

The permanent public address is **https://ecarteo.fr/**. Marketing pages and the authenticated application use this origin. `www.ecarteo.fr` redirects to the root. `app.ecarteo.fr` was retired during the [root-domain migration](ROOT-DOMAIN-MIGRATION.md) and is not a required service or redirect.

## Published routes

The application generates `/robots.txt` and `/sitemap.xml` from runtime configuration. Public indexing is enabled only with production mode, `APP_URL=https://ecarteo.fr` (an optional trailing slash is accepted), and a deployment target other than `backend`. Staging and local deployments return `Disallow: /`, an empty sitemap and `noindex` on public pages.

The production sitemap contains these canonical URLs:

- `https://ecarteo.fr/`
- `https://ecarteo.fr/methode`
- `https://ecarteo.fr/offres`
- `https://ecarteo.fr/mentions-legales`
- `https://ecarteo.fr/confidentialite`
- `https://ecarteo.fr/conditions`

Each page declares its matching canonical URL. The sitemap does not invent modification dates or language-specific URLs: language selection currently uses a cookie on these same routes.

The application's production robots response allows public pages and assets, excludes `/app`, `/api/` and `/auth/`, and references `https://ecarteo.fr/sitemap.xml`. Login, signup and recovery forms are omitted from the sitemap and retain `noindex`; they are crawlable so search engines can read that directive. Authentication and authorization continue to protect private data independently of robots rules.

## Remaining Render Free limitation

Render automatically returns a blocking robots response while a Free web service is asleep. A `/robots.txt` request neither reaches the application nor wakes it. When the service is active, Render serves the application's robots response. This is documented in [Render's Free service limitations](https://render.com/docs/free#automatic-robotstxt-responses).

Therefore, a successful check while the application is awake does **not** prove consistently available crawling. Application code cannot override this sleeping-service response. The owner's free-only constraint remains in force: no compute upgrade or artificial keepalive is authorized by this change. Reliable crawling needs an explicitly approved always-on hosting change, or a separately planned static marketing deployment. Do not describe the cold-state restriction as resolved until that hosting work is complete.

The old `app` CNAME still points at Render, but Render no longer registers that hostname. A DNS manager may delete only the obsolete `app` CNAME; no replacement is required. Preserve apex, `www` and mail records. Removing this CNAME does not create a redirect for old links. Do not add a third Render hostname under the current free-only constraint.

## Google Search Console next step

1. Resolve the sleeping-service crawl restriction before relying on sitemap submission for discovery.
2. Use the approved Écartéo Google account to add the Domain property `ecarteo.fr` in [Google Search Console](https://search.google.com/search-console/).
3. Give the exact Google-generated verification TXT record to the one.com DNS manager. Add it alongside existing TXT records; do not overwrite mail verification/SPF records. The token is property-specific and must come from Search Console.
4. Verify ownership, then submit `https://ecarteo.fr/sitemap.xml` in the Sitemaps screen.
5. Inspect `https://ecarteo.fr/`, run the live URL test, and check that crawling is allowed and the declared canonical is the root URL. Monitor sitemap processing and indexing reports afterward; sitemap submission does not guarantee indexing.

Search Console ownership verification and submission are not performed by the application deployment. Blocking staging crawling also does not prove removal of any previously indexed staging URLs.

## Verification

The SEO unit tests cover public/private discovery, exact canonical URLs, preview rejection and runtime configuration. The production build was also started twice with different `APP_URL` values supplied **after** build: production returned six sitemap URLs and indexable marketing metadata, while staging returned a blocking robots response, an empty sitemap and `noindex`. Login and signup remained `noindex` in both cases.

Before accepting a deployment, check robots, sitemap XML, all six public pages and their canonical/robots metadata on the live service. Verify staging separately, and distinguish the application's active response from Render's sleeping-service response.
