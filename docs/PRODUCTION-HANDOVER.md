# Écartéo production handover

## Access

| Environment | Application                                                               | Supabase project (Paris)                                                            | Render service (Frankfurt)                                                      |
| ----------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Production  | [Sign in](https://ecarteo.fr/login)                                       | [hghlfdhzfxllcooaglzg](https://supabase.com/dashboard/project/hghlfdhzfxllcooaglzg) | [Production service](https://dashboard.render.com/web/srv-dbtfv3ec6qcc73942dng) |
| Staging     | [Test the audit journey](https://ecarteo-staging-zy4j.onrender.com/login) | [ikfxhhcxcmrgfuwxpjpr](https://supabase.com/dashboard/project/ikfxhhcxcmrgfuwxpjpr) | [Staging service](https://dashboard.render.com/web/srv-dbtdnv0ae00c73af50rg)    |

Both environments use free instances. Render may take time to wake up after inactivity. Both web services share the workspace’s free instance-hour allowance. The admin is `admin-dev@ecarteo.fr`. The setup computer holds its production password in the owner-readable, Git-ignored `.env.production-owner`. The three staging passwords are in `.env.e2e.hosted-staging`. Store production credentials in Intertrad’s private password manager. Run demo audits on staging. [Render Free limits](https://render.com/docs/free)

## Verified release on 16 November 2026

Application commit `313c8bf29083355daf7bed85b2bcc9f717c57429` was deployed first to staging (`dep-dbtg5ac9v7es73ahtkag`) and then to production (`dep-dbtg6urm8hqs73ardqfg`). The previous working production deploy is `dep-dbtg40jbc2fs73f3o9v0` at commit `2f617e0`. Both use the same seven migrations. [GitHub quality gates](https://github.com/adminecarteo/ecarteo/actions/runs/43874490557)

- The release passed 231 database-backed and other automated tests and 35 distinct browser cases across their applicable configurations. All 14 steps of a fresh hosted staging audit passed. The assigned operator and the customer downloaded a byte-identical 10 MiB file. A different customer and an unassigned operator could not open the same report or evidence. The client PDF and corrective action persisted. Use the staging test credentials to revisit the [sample audit](https://ecarteo-staging-zy4j.onrender.com/app?view=rapport&id=8e5c3474-eb35-40fa-9400-17e607cbfc27).
- Production owner sign-in through the app returned an active quality profile. Database, schema and private Storage readiness passed. French and English public pages, signup and the confirmation resend route returned HTTP 200. A small warm public smoke test completed nine requests at concurrency three. Higher-volume capacity acceptance requires Intertrad’s traffic target.
- The daily GitHub workflow is registered for 04:37 UTC. Its first live manual run authenticated to production, checked readiness and previewed expired uploads successfully. [Maintenance run](https://github.com/adminecarteo/ecarteo/actions/runs/43875347838)

## Production root-domain cutover

The approved production address is **https://ecarteo.fr**; `www.ecarteo.fr` redirects to it. On 18 November 2026, the manager applied the root A record `216.24.57.1` and `www` CNAME `ecarteo-production.onrender.com`, with no conflicting apex/www IPv6 address. Both hostnames are verified on the existing production Render service. The previous `app.ecarteo.fr` custom hostname has been retired, keeping the Render total at two domains and within the free allowance. No one.com redirect hosting is being installed.

The root cutover passed certificate-validating HTTP checks on 18 November 2026. TLS was valid for both hostnames at 14:32 Paris time. Commit `067f6f003df2550ba53a7a279ee5f6f58539db81` is live as Render deployment `dep-dbuqibbrjlhs73b35hj0`. Render `APP_URL`, Supabase Site URL and its two exact root callback URLs are configured for `https://ecarteo.fr`; SMTP was left unchanged.

Root/www HTTP and HTTPS requests reached the root with UTM values retained. Client and administrator login, identity, dashboard, sign-out, health and private readiness passed. An actual recovery email arrived at `zain@intertrad.fr` from `admin-dev@ecarteo.fr` at 14:35 Paris time; its root-domain link opened the correct client's reset form. Passwords were not changed. A fresh signup confirmation email was not issued after this cutover. The root-origin [maintenance preview](https://github.com/adminecarteo/ecarteo/actions/runs/44315814516) also passed from GitHub's network using normal DNS.

The setup computer's upstream resolver still cached the old one.com IP during testing, so its HTTP acceptance requests explicitly resolved the root to Render's IP while validating the certificate normally. Manual browser acceptance on that computer remained blocked by this local DNS cache. See the precise coverage and propagation note in [Root-domain migration](ROOT-DOMAIN-MIGRATION.md).

Existing accounts, passwords and production data stay in the same Supabase project. Users need to sign in again at the new address. Old `app.ecarteo.fr` bookmarks and email links no longer work; request fresh confirmation/recovery emails from the root.

## Enable owner-approved mail

1. Open the production project’s [SMTP settings](https://supabase.com/dashboard/project/hghlfdhzfxllcooaglzg/auth/smtp). Enable custom SMTP, enter sender name **Écartéo**, and use **admin-dev@ecarteo.fr** for the sender and SMTP username. For the one.com mailbox, use **send.one.com**, port **587**, with STARTTLS. Enter its mailbox credential directly in Supabase. [one.com SMTP settings](https://help.one.com/hc/en-us/articles/115005594305-Can-I-use-your-SMTP-server-to-send-emails)
2. Under **Authentication → Email Templates**, use the repository's [confirmation](../supabase/templates/confirmation.html) and [recovery](../supabase/templates/recovery.html) templates. They use the active Site URL and single-use token hashes on the app’s confirmation route. Set bilingual subjects. Free projects with Supabase’s default sender reject customized templates. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
3. Use an approved test mailbox outside the Supabase team for signup and password recovery. Open each email in a fresh browser. Confirm signup opens the account, an expired signup offers a resend, password recovery opens the password form, and the new password works. Verify the From address and delivered message authentication. Record receipt times. Repeat on the custom domain after cutover.

## Customer-facing documents and operations

Intertrad supplied the name **Intertrad** and location **Paris, France**. When approved, set the full HTTPS URLs `ECARTEO_PRIVACY_URL` and `ECARTEO_TERMS_URL` on Render. The website and signup page display the configured links in French and English. Intertrad still needs to supply its complete publisher/contact details and approve the actual documents, support contact, evidence retention, erasure and legal-hold rules. The application’s restricted privacy-case process is described in [operations](OPERATIONS.md).

Daily readiness and limited expired-upload cleanup are described in [maintenance](MAINTENANCE.md). Use [operations](OPERATIONS.md) to restore the database and evidence together. The first encrypted production backup was taken on 16 November 2026 at 13:15 UTC. A local decrypt, database archive read and evidence checksum verification passed. There were no production evidence objects at the snapshot. A separate restore drill recovered a report and evidence into an isolated Supabase project. The setup machine keeps the encrypted archive in the private `backups/production/` folder and its recovery identity in `.env.production-backup-identity`. Move the recovery identity into Intertrad’s offline custody. Intertrad has not yet designated an approved off-site backup target. Keep the recovery key separately from encrypted archives and test retrieval after a destination is approved. The quote-based workflow is active. Enabling card payments is a separate commercial decision.

## Release and rollback

Deploy a reviewed Git commit to staging, run the three-role audit acceptance, then deploy the same commit to production. Verify `/api/health`, authenticated `/api/ready`, owner sign-in and the scheduled maintenance preview after deployment. Use the Render service’s **Events** to select a previously working deploy for application rollback. Check that its code supports the current database schema. Preserve data and document any coordinated recovery before changing a schema. [Launch checklist](LAUNCH-CHECKLIST.md)
