# Écartéo production handover

## Access

| Environment | Application                                                               | Supabase project (Paris)                                                            | Render service (Frankfurt)                                                      |
| ----------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Production  | [Sign in](https://ecarteo-production.onrender.com/login)                  | [hghlfdhzfxllcooaglzg](https://supabase.com/dashboard/project/hghlfdhzfxllcooaglzg) | [Production service](https://dashboard.render.com/web/srv-dbtfv3ec6qcc73942dng) |
| Staging     | [Test the audit journey](https://ecarteo-staging-zy4j.onrender.com/login) | [ikfxhhcxcmrgfuwxpjpr](https://supabase.com/dashboard/project/ikfxhhcxcmrgfuwxpjpr) | [Staging service](https://dashboard.render.com/web/srv-dbtdnv0ae00c73af50rg)    |

Both environments use free instances. Render may take time to wake up after inactivity. Both web services share the workspace’s free instance-hour allowance. The admin is `admin-dev@ecarteo.fr`. The setup computer holds its production password in the owner-readable, Git-ignored `.env.production-owner`. The three staging passwords are in `.env.e2e.hosted-staging`. Store production credentials in Intertrad’s private password manager. Run demo audits on staging. [Render Free limits](https://render.com/docs/free)

## Connect app.ecarteo.fr

1. In the one.com DNS panel for `ecarteo.fr`, the DNS manager creates a **CNAME** with host **app**, value **ecarteo-production.onrender.com**, and the default TTL. Preserve the domain’s existing website and mail records.
2. Check `dig +short CNAME app.ecarteo.fr`. In the production Render service, open **Settings → Custom Domains** and verify `app.ecarteo.fr`. Wait for Render’s certificate to become active and for `https://app.ecarteo.fr/api/health` to return HTTP 200. [Render custom domains](https://render.com/docs/custom-domains)
3. Coordinate the hostname switch. Change production `APP_URL` on Render to `https://app.ecarteo.fr`. Set Supabase Auth **Site URL** to that same origin. Allow exactly `https://app.ecarteo.fr/auth/callback` and `https://app.ecarteo.fr/auth/callback?next=/reset-password`. Change the GitHub Actions variable `PRODUCTION_APP_ORIGIN` and the private production configuration to the new origin, and deploy. Verify signup, recovery, sign-in and private readiness there. Use the assigned Render URL until the switch is complete.

## Enable owner-approved mail

1. Open the production project’s [SMTP settings](https://supabase.com/dashboard/project/hghlfdhzfxllcooaglzg/auth/smtp). Enable custom SMTP, enter sender name **Écartéo**, and use **admin-dev@ecarteo.fr** for the sender and SMTP username. For the one.com mailbox, use **send.one.com**, port **587**, with STARTTLS. Enter its mailbox credential directly in Supabase. [one.com SMTP settings](https://help.one.com/hc/en-us/articles/115005594305-Can-I-use-your-SMTP-server-to-send-emails)
2. Under **Authentication → Email Templates**, use the repository's [confirmation](../supabase/templates/confirmation.html) and [recovery](../supabase/templates/recovery.html) templates. They use the active Site URL and single-use token hashes on the app’s confirmation route. Set bilingual subjects. Free projects with Supabase’s default sender reject customized templates. [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
3. Use an approved test mailbox outside the Supabase team for signup and password recovery. Open each email in a fresh browser. Confirm signup opens the account, an expired signup offers a resend, password recovery opens the password form, and the new password works. Verify the From address and delivered message authentication. Record receipt times. Repeat on the custom domain after cutover.

## Customer-facing documents and operations

Intertrad supplied the name **Intertrad** and location **Paris, France**. When approved, set the full HTTPS URLs `ECARTEO_PRIVACY_URL` and `ECARTEO_TERMS_URL` on Render. The website and signup page display the configured links in French and English. Intertrad still needs to supply its complete publisher/contact details and approve the actual documents, support contact, evidence retention, erasure and legal-hold rules. The application’s restricted privacy-case process is described in [operations](OPERATIONS.md).

Daily readiness and limited expired-upload cleanup are described in [maintenance](MAINTENANCE.md). Use [operations](OPERATIONS.md) to restore the database and evidence together. The first encrypted production backup was taken on 16 November 2026 at 13:15 UTC. A local decrypt, database archive read and evidence checksum verification passed. There were no production evidence objects at the snapshot. A separate restore drill recovered a report and evidence into an isolated Supabase project. The setup machine keeps the encrypted archive in the private `backups/production/` folder and its recovery identity in `.env.production-backup-identity`. Move the recovery identity into Intertrad’s offline custody. Intertrad has not yet designated an approved off-site backup target. Keep the recovery key separately from encrypted archives and test retrieval after a destination is approved. The quote-based workflow is active. Enabling card payments is a separate commercial decision.

## Release and rollback

Deploy a reviewed Git commit to staging, run the three-role audit acceptance, then deploy the same commit to production. Verify `/api/health`, authenticated `/api/ready`, owner sign-in and the scheduled maintenance preview after deployment. Use the Render service’s **Events** to select a previously working deploy for application rollback. Check that its code supports the current database schema. Preserve data and document any coordinated recovery before changing a schema. [Launch checklist](LAUNCH-CHECKLIST.md)
