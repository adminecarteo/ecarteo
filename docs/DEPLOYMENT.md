# Supabase and deployment: step by step

**Staging uses one Render Docker web service for the frontend, API and authentication routes.** The existing Supabase project in Paris provides PostgreSQL, Auth and private Storage.

## Deploy staging on Render

1. Use the public Git URL `https://github.com/adminecarteo/ecarteo` and the reviewed commit on `main` in the Écartéo Render workspace. Create one web service named `ecarteo-staging` with the Free instance in Frankfurt. The repository Blueprint records the service settings. [render.yaml](../render.yaml)
2. Choose the Docker runtime, repository root as the context, and `./Dockerfile`. The final image starts the standalone Next.js server. Set `ECARTEO_DEPLOYMENT_TARGET=fullstack`, `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=10000`, health path `/api/health` and manual deployments. Leave `ECARTEO_BACKEND_ORIGIN` blank so pages and APIs use the same origin. [Render web services](https://render.com/docs/web-services)
3. Before the initial build, copy the staging values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_CA_CERT` and `OPS_HEALTH_TOKEN` from the owner-readable `.env.hosted-staging` into Render’s environment settings. Preserve the PEM certificate’s line breaks. Next.js embeds the two public values during compilation. The app reads the other values at runtime. Leave optional Stripe settings empty for quote-based billing. [Docker on Render](https://render.com/docs/docker)
4. Deploy and copy the HTTPS URL Render assigns. On its first start the app uses Render’s `RENDER_EXTERNAL_URL` as its canonical origin. A verified custom domain can later override it with an explicit `APP_URL`. Record the active origin in the private staging configuration and use it for the Supabase Site URL, confirmation and recovery redirects, and email templates. Use the existing project `ikfxhhcxcmrgfuwxpjpr`, which already has all six migrations. [Render environment variables](https://render.com/docs/environment-variables) · [Configure account emails and redirects](#4-configure-account-emails-and-redirects)
5. Check the landing page, sign-in page and `/api/health` over HTTPS. Call `/api/ready` with the monitoring bearer token from a secret store and confirm configuration, schema, database and private storage are ready. Test signup confirmation, sign-in, recovery, session refresh and sign-out through the Render origin. Verify the confirmed administrator’s email and UUID before granting the quality role. [Bootstrap staff and verify hosted workflows](#7-bootstrap-staff-and-verify-hosted-workflows)
6. Complete a staging audit with the intended roles. Upload and download an allowed file of exactly 10 MiB, compare the bytes, and verify an oversized file is rejected. Record the tested origin, Git SHA and Render deployment ID. [Launch checklist](LAUNCH-CHECKLIST.md)

The November 12 baseline includes 208 passing tests, all six migration and isolation checks, and 13 browser cases against the earlier split deployment. GitHub’s quality workflow passed for `c7e7f36`. [CI run](https://github.com/adminecarteo/ecarteo/actions/runs/43289298941)

The numbered sections below cover Supabase activation, staff provisioning, operations and an alternative Docker Compose deployment on a VPS. The November 12 Vercel/Render configuration is documented in the [historical split deployment guide](VERCEL-RENDER.md).

Use **admin-dev@ecarteo.fr** as the owner/contact for new Supabase, hosting and email-service accounts and as the first Écartéo administrator in each environment. This mailbox is working; another person manages `ecarteo.fr` DNS. Provide that person with the exact app and email-verification records after the host and email provider are selected. Keep the existing GitHub repository under `adminecarteo`. Operator and client users require their own email identities.

### Staging checkpoint — 2026-11-12

- Supabase CLI is authorized as `admin-dev@ecarteo.fr` and linked to `ikfxhhcxcmrgfuwxpjpr` in Paris (`eu-west-3`). Its current dashboard display name is `adminecarteo's Project`; this project is being used for Écartéo staging. The CLI's `production` target label refers to the Supabase project's main branch, not Écartéo's production environment.
- All six repository migrations were applied to the initially empty project; local and remote migration history match. All 85 read-only schema, RLS and privilege checks passed. The 21 application tables have RLS enabled; `ecarteo-evidence` is private with a 10 MiB limit. The dashboard confirms `app_private` is excluded from exposed Data API schemas.
- The ignored, owner-readable `.env.hosted-staging` contains the project URL, publishable key, server secret key and monitoring token. Read-only hosted Auth and Storage API checks passed; email sign-in and email confirmation are enabled.
- `DATABASE_URL` is saved privately with URL-encoded credentials. A read-only database connection succeeded with TLS certificate and hostname verification enabled and confirmed all six migrations. The project dashboard's official root CA is saved as actual multiline PEM in `SUPABASE_DB_CA_CERT`. The pooler is `aws-0-eu-west-3.pooler.supabase.com:5432`, user `postgres.ikfxhhcxcmrgfuwxpjpr`, database `postgres`. `APP_URL` remains unset until the hosting and hostname choices are complete.
- Local split-deployment preflight passed: the frontend production build, Render-mode Docker build/runtime checks, 208 tests with zero skipped, six-migration replay/SQL isolation and 13 browser cases. The bootstrap reload fix clears stale protected content. See the [local preflight checkpoint](VERCEL-RENDER.md#local-preflight-checkpoint--2026-11-12); these checks do not prove hosted 10 MiB uploads or email delivery.
- Hosted SMTP, authentication redirects, staff accounts, Vercel/Render deployment, DNS, HTTPS and hosted end-to-end acceptance remain pending. Vercel email verification is pending for the intended owner. Render CLI authentication/workspace have been verified as `admin-dev@ecarteo.fr`, and its one-service staging Blueprint passed provider validation. Render's GitHub App installation remains pending with only `adminecarteo/ecarteo` selected. No Vercel project or Render service has been created/deployed for this setup. No production Supabase project or public application deployment exists yet. The running local app continues using `.env.local`.

## 1. Prepare your computer and repository

1. Install Node.js 22.13+ and npm. Use the lockfile: `npm ci`.
2. The commands below pin the Supabase CLI to `3.0.0` using `npx`; Node/npm must be installed first. See the [CLI installation guide](https://supabase.com/docs/guides/local-development/cli/getting-started). The deployment host also needs Docker Engine with Docker Compose; the supplied deployment uses a Linux server and Caddy for HTTPS.
3. Initialize Git if this directory is not a repository: `git init`. Review `.gitignore`, then create your private repository and push your reviewed source. Do not add any `.env` files or backups. The included GitHub workflow runs quality, database and browser checks, and builds both containers; it needs to run in your connected repository before release.
4. Create a separate, ignored file for hosted staging credentials. `cp -n` preserves an existing file:

   ```sh
   cp -n .env.example .env.hosted-staging
   chmod 600 .env.hosted-staging
   ```

5. Fill `.env.hosted-staging` in your editor after the next step. This file is a separate configuration record; the running local app continues using `.env.local`. Do not paste service credentials into terminal arguments or print the file. When preparing production, create `.env.hosted-production` the same way with that project's own values. Both filenames are ignored by Git.
6. Choose the staging hostname before configuring its authentication URLs, for example `staging-audit.your-company.example`. Choose the final production hostname separately. The domain names throughout this guide are placeholders.

## 2. Create separate Supabase projects

1. In your Supabase organization, create `ecarteo-staging` and later `ecarteo-production`. Choose the hosting region according to your customer commitments.
2. Save each database password and project reference in your password manager.
3. Open the project's connection/API settings. Collect the project URL, publishable API key, server secret/service-role key, and PostgreSQL connection URI. Use the session pooler for long-running Node/Docker deployments; the application also disables prepared statements for transaction poolers.
4. Populate `.env.hosted-staging` for the hosted staging deployment:

   | Variable                               | What to enter                                                                         |
   | -------------------------------------- | ------------------------------------------------------------------------------------- |
   | `APP_URL`                              | Exact hosted staging origin, for example `https://staging-audit.your-company.example` |
   | `NEXT_PUBLIC_SUPABASE_URL`             | Staging project URL                                                                   |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public/publishable key, never service role                                            |
   | `DATABASE_URL`                         | Session pooler URI from Supabase Connect; URL-encode special password characters      |
   | `SUPABASE_SERVICE_ROLE_KEY`            | Server-only secret/service-role API key                                               |
   | `SUPABASE_DB_CA_CERT`                  | Optional actual multiline PEM CA chain, if needed for PostgreSQL TLS                  |
   | `OPS_HEALTH_TOKEN`                     | At least 32 random characters from your password manager                              |

5. Once the hostname and all required values have been filled, run `node --env-file=.env.hosted-staging scripts/validate-config.mjs --production`. Do not enter the example hostname as though it were a real domain you own. This validates configuration shape and secret placement, not remote connectivity.

The application verifies remote database certificates. If a CA certificate is needed, store the actual PEM content with real line breaks; a certificate file path or literal backslash-`n` characters are not the app's expected value. Resolve an incorrect CA/hostname rather than disabling TLS verification. The database pool uses at most five connections per application process. Do not expose `app_private` in the Supabase Data API.

## 3. Apply database migrations

Run from the project root. This repository already contains `supabase/config.toml` and the migrations; do not initialize or reset it again. The config file is **for local development only**: its localhost URLs, Mailpit settings and local limits must not be pushed to a hosted project. Configure hosted Auth settings in the dashboard as described in step 4; do not run `supabase config push` with this file.

```sh
npx --yes supabase@3.0.0 login
npx --yes supabase@3.0.0 link --project-ref YOUR_STAGING_PROJECT_REFERENCE
npx --yes supabase@3.0.0 migration list --remote
npx --yes supabase@3.0.0 db push --dry-run --remote
npx --yes supabase@3.0.0 db push --remote
```

Use the CLI's interactive login/password prompts; do not supply secrets as flags. Review the printed target project and proposed migrations before confirming. Apply every file in `supabase/migrations/` in filename order; there are six migrations in this release. Never run `supabase/tests/bootstrap.sql` or a remote database reset against a real project. The bootstrap is a vanilla PostgreSQL test stand-in. The pinned CLI uses the explicit `--remote` target documented in the [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push). Use the pinned commands consistently; do not substitute flags from an older CLI version.

Confirm in the dashboard:

- The application tables have RLS enabled and authenticated users have read-only grants.
- `ecarteo-evidence` exists, is **private**, and has a 10 MiB object limit.
- There are no pre-existing broad Storage policies granting uploads/downloads to everyone.
- `app_private` remains outside exposed schemas. No sample customer or production staff account is inserted by migrations.

## 4. Configure account emails and redirects

1. Enable email/password sign-in and **require email confirmation**.
2. Set Authentication → URL configuration → Site URL to the exact `APP_URL`.
3. For hosted staging, allow `https://staging-audit.your-company.example/auth/callback` and `https://staging-audit.your-company.example/auth/callback?next=/reset-password`, substituting your hostname. For production, use only the equivalent final HTTPS URLs. Do not use wildcard production origins. Keep the existing local project's localhost settings separate.
4. Set password minimum length to 12; review provider password and abuse protections. CAPTCHA is not implemented in this app, so do not require a CAPTCHA token until that integration is added.
5. Set up a transactional email provider for the domain you control. Configure its SMTP host, port, username/password and verified sender in Supabase, then complete the provider's sending-domain DNS verification. Test delivery to addresses outside your team after deployment. Supabase's default sender is not your production delivery configuration. See [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
6. Copy the bilingual HTML from `supabase/templates/confirmation.html` and `supabase/templates/recovery.html` into the matching hosted email templates. Choose appropriate hosted subjects without the word “local”. The required application links are:

   Confirmation:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup"
     >Confirmer mon adresse email</a
   >
   ```

   Recovery:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery"
     >Choisir un nouveau mot de passe</a
   >
   ```

7. Save the settings now; test confirmation and recovery **after the app is reachable at this HTTPS origin** in step 7. The token-hash and PKCE endpoints follow [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client). Do not send signup links to an undeployed hostname.

## 5. Run local release checks

```sh
npm run format:check
npm run lint
npm test
npm run build
npm run typecheck
npm run test:e2e
npm audit --omit=dev --audit-level=moderate
```

Run database tests with the dedicated local test database described in `supabase/tests/README.md`. Authenticated workflows have also passed against a real local Supabase stack, separately from those database fixtures. Repeat authenticated browser tests with hosted staging identities and production-like email/storage settings; the local result is not hosted acceptance. Review [VERIFICATION.md](VERIFICATION.md) for exact executed coverage.

## 6. Deploy the Docker application and verify HTTPS

This repository includes a standalone Node application, maintenance image, Docker Compose and Caddy HTTPS configuration. Choose a server with outbound access to Supabase, DNS control, and public ports 80/443. Keep the internal Node port private.

1. Choose a host for the Docker path, install Docker Engine/Compose and Node.js 22.13+, then copy reviewed source to `/opt/ecarteo` or use an immutable image from your private registry. Start with hosted staging. Keep its credentials, domain and data separate from production. The supplied Compose stack binds ports 80/443; two unchanged stacks cannot share those ports on one server.
2. On that host, in `/opt/ecarteo`, create the runtime file without overwriting an existing deployment:

   ```sh
   cp -n .env.example .env.production
   chmod 600 .env.production
   ```

   Fill it securely from the matching project's configuration record. **The supplied Compose file always reads `/opt/ecarteo/.env.production` for runtime variables**, including a staging deployment running a production Next.js build. Passing a different file to `docker compose --env-file` does not change this runtime path. Do not point this host file at your local Supabase stack.

3. For the first hosted staging deployment, set:

   ```dotenv
   APP_URL=https://staging-audit.your-company.example
   ECARTEO_DOMAIN=staging-audit.your-company.example
   ACME_EMAIL=admin-dev@ecarteo.fr
   ECARTEO_IMAGE=ecarteo:staging-release-2026-11-12
   ```

   Replace the example domain/email and release tag, and fill all required Supabase and monitoring values from the staging project. For a later production deployment, use its final hostname and production credentials in that deployment's own `.env.production`. `APP_URL` must exactly match the public HTTPS origin and Supabase Site URL. The `.env.production` file is ignored by Git. A managed secret store is preferable when supported.

4. Point your domain's DNS to the server. Configure your host firewall to expose 80/443 and your restricted administrative access only.
5. Run:

   ```sh
   node --env-file=.env.production scripts/validate-config.mjs --production
   docker compose --env-file .env.production -f deploy/compose.yml config --quiet
   docker compose --env-file .env.production -f deploy/compose.yml build app maintenance
   docker compose --env-file .env.production -f deploy/compose.yml up -d app proxy
   ```

   Avoid plain `docker compose config` in shared logs: it can print expanded secrets. Public Supabase values are baked in at build time; changes require a rebuild. Service keys/database passwords are runtime values. The Compose app is non-root with a read-only filesystem and bounded logs.

6. Visit the deployed landing and login pages and verify HTTPS and `/api/health`. These public pages can load before any user exists. Configure your private monitor to request `/api/ready` with `Authorization: Bearer <OPS_HEALTH_TOKEN>` stored in the monitor's secrets. It checks database/schema/private-bucket availability; it does not prove email delivery or payment processing.
7. Continue to step 7 below to create the first administrator and test authenticated workflows. During that acceptance, confirm uploads up to 10 MiB and rejection above the limit. Caddy accepts a 12 MB request to cover multipart overhead; see [request body configuration](https://caddyserver.com/docs/caddyfile/directives/request_body). Do not add shared caching for `/app`, `/api`, `/auth` or account pages.
8. Apply infrastructure request-rate limits for `/api/auth`, uploads and public traffic. Durable per-email throttling is already implemented; it is not a substitute for upstream abuse controls.

For another Node host, inject these environment variables through the host's configuration before both build and runtime. `npm start` automatically reads `.env.local`, **not** `.env.production`; it also binds to `127.0.0.1` by default. On a separate deployment checkout using an environment file, the explicit equivalents are:

```sh
node --env-file=.env.production node_modules/next/dist/bin/next build
node --env-file=.env.production scripts/start.mjs
```

Keep a loopback bind behind a reverse proxy on the same host. If the platform requires the app to listen on all container interfaces, configure `ECARTEO_HOST=0.0.0.0` in its runtime environment and expose it only through the platform's HTTPS ingress. Do not carry the local development `.env.local` into this checkout. The host must support the upload request size and Node runtime. A host with a smaller body limit needs a smaller documented product limit or signed direct Storage uploads before launch. The supplied flow is designed for the included container host, not an unverified serverless upload limit.

## 7. Bootstrap staff and verify hosted workflows

1. After step 6 has verified HTTPS and readiness, open `/signup` on the exact deployed `APP_URL`, for example `https://staging-audit.your-company.example/signup`. Create the initial quality administrator using `admin-dev@ecarteo.fr` and confirm its email. Create and confirm this identity separately in staging and production; each project has its own user UUID. Do not use localhost with the hosted configuration: the server requires the request origin to match `APP_URL`, and email links use the hosted Site URL.
2. Look up its exact UUID in Supabase Authentication. Through the trusted SQL editor, after verifying the identity, promote that UUID:

   ```sql
   update public.profiles
   set role='qualite', client_id=null, is_client_admin=false, active=true
   where id='<VERIFIED_AUTH_USER_UUID>';
   ```

3. Sign out/in on that same deployed hostname. Quality staff can then use account administration. Keep at least one active quality account. Staff permissions are central to the audit service; they are not separate audit agencies.
4. On hosted staging, create a disposable customer through signup. Its first member is a client administrator; additional members join through quality-issued invitations. Invitation links must be shared through your approved channel by an authorized person; the app does not send invitation emails automatically.
5. Provision an operator, create/review a customer audit request, choose a scenario, assign the operator, upload evidence, score, publish and download the report. Retest and action completion must work for the client.
6. Repeat with a second client, then attempt cross-client reads/downloads and disabled-account access. Follow [E2E.md](E2E.md) and [Supabase test instructions](../supabase/tests/README.md). Missing credentials cause authenticated tests to skip; a skip is not an acceptance pass.
7. Open a confirmation email on another device; test password recovery, expired/reused links, session expiry and sign-out in another tab. Verify that no flow changes trusted tenant roles or exposes another customer's records.
8. The 12 scenario templates are authored starting points. Quality staff must approve the customer scope and fieldwork details before execution.

If you want online subscriptions, configure Stripe **test mode** using [BILLING.md](BILLING.md) first. Quote-based audit requests remain available when billing is disabled. You choose products/prices; code does not invent a price or charge on signup.

After staging acceptance, repeat steps 2–4 with a **separate production project**, then steps 6–7 with its final domain and own credentials. Relink the CLI to the production reference and inspect the target before applying migrations. Bootstrap the production quality account only after the production hostname is live. Use controlled acceptance records; do not run fixture provisioning scripts or import the local demonstration identities into production.

## 8. Schedule maintenance and set recovery controls

Follow [OPERATIONS.md](OPERATIONS.md): hourly staged-upload cleanup, private readiness/error alerts, separate database and file backups, a full restore drill, and case-based privacy/correction handling. Enable the supplied systemd timer only after reviewing its `/opt/ecarteo` and Docker binary paths. Set an alert recipient in your infrastructure; no alert service is configured automatically. The supplied maintenance container supports cleanup/reconciliation/privacy jobs, but it does not include `pg_dump`/`pg_restore` or a persistent backup mount. Run the documented database backup commands on a restricted host with Node.js and PostgreSQL client tools compatible with the managed database, plus an encrypted off-site backup destination. Database backups and Storage object bytes are separate; test their coordinated restoration.

Use [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) as the final sign-off. Business identity, privacy/terms, retention rules, approved offers, support ownership and live-provider acceptance require your input. No live deployment is claimed by these instructions.

## 9. Release and rollback

Build each release under a unique image tag; record the source commit, migration list and previous tag. Take coordinated database/Storage backups before migrations. Deploy schema changes that are compatible with both application versions. Run smoke tests and a customer workflow before switching traffic.

For an application-only rollback, set `ECARTEO_IMAGE` to the previous tested image and run `docker compose --env-file .env.production -f deploy/compose.yml up -d --no-build app`. Do not rebuild the old tag from new source. Never undo a production migration by dropping tables or resetting the remote database. A schema rollback requires a reviewed forward migration or a tested restore into a replacement project, with a deliberate plan for post-backup writes.
