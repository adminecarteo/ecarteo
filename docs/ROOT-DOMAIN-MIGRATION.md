# Production root-domain cutover

The selected production address is `https://ecarteo.fr`. The user chose the simplified DNS migration and strictly free resources: the old `app.ecarteo.fr` hostname is retired rather than redirected through one.com hosting. This supersedes both the earlier root-to-app redirect and the proposed one.com subdomain/`.htaccess` preparation.

## Verified cutover on 18 November 2026

- The manager's DNS changes were confirmed by both one.com nameservers and public resolvers. Root and `www` are verified custom domains on production Render service `srv-dbtfv3ec6qcc73942dng`; both had valid TLS at **14:32 Paris time**.
- The old `app.ecarteo.fr` hostname was removed before adding the pair. The service remains free with two custom domains. A residual `app` CNAME does not provide a redirect.
- Runtime commit `067f6f003df2550ba53a7a279ee5f6f58539db81`, whose GitHub quality gates passed, is live as deployment `dep-dbuqibbrjlhs73b35hj0`.
- Render `APP_URL` and Supabase Site URL now use `https://ecarteo.fr`. Supabase allows only the two exact root callbacks listed below. SMTP settings were unchanged.
- GitHub `PRODUCTION_APP_ORIGIN` and the private production handoff URLs were updated. The blank `APP_URL` in `.env.production` was left blank. The read-only [maintenance preview](https://github.com/adminecarteo/ecarteo/actions/runs/44315814516) passed from GitHub's network with normal DNS.

## Final DNS and hosting

| Type  | Host in one.com | Value                             | Purpose                                |
| ----- | --------------- | --------------------------------- | -------------------------------------- |
| A     | blank / apex    | `216.24.57.1`                     | Root website and application on Render |
| CNAME | `www`           | `ecarteo-production.onrender.com` | Render redirect to the root            |

Remove conflicting A/CNAME records for these exact hosts and old apex/www AAAA records. Preserve mail MX/SPF/DKIM/DMARC, nameservers and unrelated records. No new domain purchase, paid hosting upgrade or database migration is required. Do not install the obsolete root-to-app redirect.

The old `app` CNAME can be removed by the DNS manager after confirming it is no longer required; it does not need a replacement. Do not re-add `app` to Render alongside the root/www pair, because that could exceed the two included domains.

## Applied origin configuration

The verified production configuration is:

- Render `APP_URL=https://ecarteo.fr`.
- Supabase production `hghlfdhzfxllcooaglzg`: Site URL `https://ecarteo.fr`; exact allowed callbacks `https://ecarteo.fr/auth/callback` and `https://ecarteo.fr/auth/callback?next=/reset-password`.
- GitHub repository variable `PRODUCTION_APP_ORIGIN=https://ecarteo.fr`.

The Supabase change was scoped to the site/callback URLs. Do not push the repository's local `supabase/config.toml`. SMTP, confirmation requirements, database settings and staging were left unchanged. Existing confirmation/recovery templates derive their links from `.SiteURL`. Private production handoff changes affected URL fields, not secrets.

## Acceptance and user impact

All four root/www HTTP and HTTPS cases reached `https://ecarteo.fr` with final HTTP 200, equivalent UTM values and no masking or loop. HTTP `www` takes two 301 hops (HTTPS upgrade, then root); HTTPS `www` takes one 301 hop.

Certificate-validating live requests passed root `/api/health`, authenticated `/api/ready`, client `zain@intertrad.fr` and administrator `admin-dev@ecarteo.fr` login, identity and dashboard checks, and sign-out. A real recovery email was received in the approved client inbox at **14:35 Paris time**, from `admin-dev@ecarteo.fr`, with a root `/auth/confirm` URL. Redeeming it returned 303 to root `/reset-password`; the form returned 200, the session matched the approved client, and signing out returned the session to 401. Passwords were not changed.

**Coverage limits:** no new signup confirmation email was issued after cutover. Its template and configured route use the root, but that is not a fresh delivery test. During these checks, the setup computer's upstream resolver still held the old one.com address `46.30.215.246` (about 20 minutes of cache remaining at 14:35; apex TTL 3600 seconds). Its acceptance requests explicitly resolved the root to `216.24.57.1` with normal TLS validation. Manual browser acceptance on that computer remained blocked by the local DNS cache. The successful GitHub maintenance preview independently confirms root readiness through normal DNS from another network.

Accounts, passwords and audit data stay in the same production Supabase project. Cookies from `app.ecarteo.fr` cannot establish a session on the root, so existing users must sign in again. Old bookmarks and previously sent `app.ecarteo.fr` confirmation/recovery/invitation links are no longer supported. Request fresh confirmation or recovery emails from the root, and have an administrator reissue any still-needed invitation.

## Rollback

Coordinate all affected layers if the cutover fails. Restore the saved origin settings on Render and Supabase, restore the prior maintenance origin, and restore the saved web DNS with the manager. To reactivate the old hostname without exceeding the free domain allowance, remove the new root/www pair before re-adding `app.ecarteo.fr` to Render and verify its TLS/routing. This may require a maintenance window and DNS propagation. Never delete the service, database, accounts or evidence as part of a domain rollback.

## References

- [Render custom domains](https://render.com/docs/custom-domains)
- [Render DNS records](https://render.com/docs/configure-other-dns)
- [Production maintenance](MAINTENANCE.md)
