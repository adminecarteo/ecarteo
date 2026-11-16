# Historical deployment guide for Vercel, Render and Supabase

This guide records the split deployment evaluated on November 12, 2026. The current staging service runs the frontend and backend together on Render. Follow the [current Render deployment instructions](DEPLOYMENT.md#deploy-staging-on-render) with the current Blueprint. References below to the backend-only Blueprint describe the configuration at commit `c7e7f36`.

This guide prepares a deployment; it does not claim one has passed hosted acceptance. Keep the existing `.env.local` and local Supabase stack unchanged. Never upload that file to either host or paste private credentials into chat, Git, screenshots, command arguments or build logs.

## Local preflight checkpoint — 2026-11-12

- The frontend production build passed with synthetic HTTPS origins/public Supabase settings and no backend secrets. Its generated routes use external `beforeFiles` API/auth rewrites with caching disabled; the proxy does not match those paths.
- The Render-mode backend Docker build passed. An isolated container bound to `0.0.0.0:10000`, became healthy, returned 200 for health, denied five protected APIs with 401 and hid private readiness with 404 when no monitor token was configured. Its temporary container and image were removed.
- The full test suite passed **208 tests, zero skipped**, including database-backed coverage; all six migrations and SQL isolation assertions passed on a separate disposable local PostgreSQL database.
- All **13 split-deployment browser cases passed locally**. The bootstrap reload fix unmounts stale protected content when its locale, resource or retry changes. See [E2E.md](E2E.md) for the browser evidence and upload-limit checks.

These results are local preflight evidence, **not hosted Vercel/Render 10 MiB upload proof**. Hosted routing, cookie forwarding, email delivery and the upload gate in step 6 still require acceptance. Vercel email verification is pending for the intended account. Render CLI/workspace ownership and Blueprint validation passed, but its GitHub App installation is still pending with only `adminecarteo/ecarteo` selected. No Vercel project or Render service has been created/deployed for this setup; the existing staging Supabase project remains separate.

## 1. Confirm owners, plans and the staging hostname

1. Use **admin-dev@ecarteo.fr** as the infrastructure owner/contact and first application administrator. The private source repository remains [adminecarteo/ecarteo](https://github.com/adminecarteo/ecarteo). Connect only the intended repository to the hosting providers.
2. Complete Vercel email verification and verify the account/team owner is `admin-dev@ecarteo.fr` before importing this project. Do not create Écartéo under the unrelated account previously connected. Render CLI authentication and the active workspace have now been verified under `admin-dev@ecarteo.fr`; the Blueprint validation returned `valid: true` for one staging backend service. Complete the pending Render GitHub App installation with access restricted to `adminecarteo/ecarteo`. No Render service has been created/deployed. These steps do not require changing unrelated projects or accounts.
3. Select the hosting plans before approving any charges. Vercel Hobby permits personal, non-commercial use; this commercial SaaS needs a suitable commercial plan, normally Pro. The repository does not purchase or activate a plan. See [Vercel Hobby terms](https://vercel.com/docs/plans/hobby).
4. The supplied [render.yaml](../render.yaml) explicitly uses `plan: free` for an initial staging preview only. The owner must choose a paid compute plan before production and update the Blueprint to match. Render advises against Free for production: idle services sleep and can take about a minute to resume. Do not interpret a Free staging result as production capacity or availability validation. See [Render Free limitations](https://render.com/docs/free).
5. Create the staging Vercel project under the correct owner and record its **stable project domain**, or reserve a staging subdomain you control. Use the actual domain assigned by Vercel, not a guessed name or a per-commit preview URL. The frontend's final build needs the Render URL from step 3; an unconfigured initial build is not acceptance. A project `*.vercel.app` domain can be used before custom DNS is available.
6. Record that exact HTTPS origin as `APP_URL` in both hosting environments and in the ignored `.env.hosted-staging` configuration record. It must have no path, query or fragment. In this guide, `https://FRONTEND_HOST` means this actual origin, and `https://BACKEND_HOST` means the Render service URL assigned later. They are placeholders, not values to paste unchanged.

Someone else manages `ecarteo.fr` DNS. When a custom hostname or email sender is chosen, give that person the exact records supplied by Vercel and the email provider. No additional domain purchase is necessary merely to perform staging tests on the provider-assigned hostname.

## 2. Confirm the existing staging Supabase project

Staging project reference: `ikfxhhcxcmrgfuwxpjpr`, Paris region. Its dashboard may display `adminecarteo's Project`. All six repository migrations and the initial schema/RLS checks have already passed there; do not recreate it or rerun a bootstrap/reset. [DEPLOYMENT.md](DEPLOYMENT.md#staging-checkpoint--2026-11-12) records the verified checkpoint.

The ignored, owner-readable `.env.hosted-staging` is the private configuration record. Use its existing project values through the hosts' secret forms. Remote database TLS verification has passed with the project CA certificate. Preserve `SUPABASE_DB_CA_CERT` as actual multiline PEM and keep certificate verification enabled. This file must never be imported wholesale into Vercel.

For future migrations, inspect the target and dry run before applying. The CLI is already linked to staging; the explicit project reference below is a guard against deploying to another project:

```sh
npx --yes supabase@3.0.0 link --project-ref ikfxhhcxcmrgfuwxpjpr
npx --yes supabase@3.0.0 migration list --remote
npx --yes supabase@3.0.0 db push --dry-run --remote
```

Only after reviewing a legitimate pending change, run `npx --yes supabase@3.0.0 db push --remote`. Use interactive authentication prompts, never secret flags. Do not run `supabase config push`: this repository's `supabase/config.toml` configures the **local** stack, including localhost and test email settings. Never run `supabase/tests/bootstrap.sql` or a remote reset on hosted data.

## 3. Create the Render staging backend

1. In the correct Render account, connect the private GitHub repository and create a Blueprint from its reviewed `main` commit using `render.yaml`. Review the proposed resource and plan before creating it. Only one Docker web service is defined; there is no Render database or disk purchase. The Blueprint selects Frankfurt, near the staging Supabase region. Region cannot be changed in place later.
2. Fill the prompted values using the **Render backend** column below. `APP_URL` is the Vercel frontend origin from step 1. Do not set `ECARTEO_BACKEND_ORIGIN` on Render. Optional Stripe values remain absent while email/account/storage acceptance is pending.
3. Let Render build the repository Dockerfile. Its final stage is `runner`, and its existing `CMD` starts `node server.js`; no custom start command, Caddy, Docker Compose or Node install command is needed. `ECARTEO_DEPLOYMENT_TARGET=backend` must be present during **both build and runtime**.
4. Render automatically makes configured service variables available as build arguments and runtime variables. The Dockerfile only declares public Supabase configuration and the non-secret deployment target as build arguments. Database, service-role, CA, monitoring and Stripe secrets must not be added as Docker `ARG` values. See [Docker on Render](https://render.com/docs/docker#environment-variable-translation).
5. Keep the supplied `HOSTNAME=0.0.0.0` and `PORT=10000`. The standalone server and Docker health probe read the runtime port. Configure HTTP `healthCheckPath: /api/health`; this lightweight check is liveness, not proof of database/email readiness. Render expects a public web service to bind on `0.0.0.0` and its `PORT`. See [Render port binding](https://render.com/docs/web-services#port-binding).
6. Record the actual assigned `https://BACKEND_HOST` URL. Check `/api/health` there. The Render URL is an upstream endpoint, not the user-facing login/signup hostname. Keep `autoDeployTrigger: off` during staging acceptance; creating the service still triggers its initial deployment. Later releases are deliberate manual deployments of a reviewed commit. See [Blueprint fields](https://render.com/docs/blueprint-spec).

Render's `sync: false` prompts apply at initial creation. For a later credential change, update the service's environment settings manually and redeploy; changing a blank Blueprint entry does not rotate an existing secret.

## 4. Configure and deploy the Vercel frontend

The committed `vercel.json` selects Next.js, uses repository root `.`, installs with `npm ci`, and runs `node scripts/validate-config.mjs --production && npm run build`. Keep that build command: validation rejects missing frontend settings, a rewrite loop and backend secrets accidentally placed on Vercel before the build starts. Keep the framework's output-directory default; the frontend target uses `.next-frontend` internally. Do not configure a static export or use the Docker image on Vercel. Scope staging values to the deployment environment serving the staging project domain. A staging Vercel project's stable domain can be its Vercel **Production** deployment while still using Écartéo's staging Supabase project; the provider label does not make it business production.

CI runs the same validation/build command with synthetic HTTPS frontend/backend origins and a fake public Supabase key, with every backend secret absent. This proves the frontend can build without database/service credentials; it does not test a deployed provider. The normal fullstack build, type checks, database/browser tests and Docker gates remain enabled.

| Variable                               | Vercel frontend                                 | Render backend                                        |
| -------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `ECARTEO_DEPLOYMENT_TARGET`            | `frontend`, build and runtime                   | `backend`, build and runtime                          |
| `ECARTEO_BACKEND_ORIGIN`               | Exact `https://BACKEND_HOST`, build and runtime | **Absent**                                            |
| `APP_URL`                              | Exact `https://FRONTEND_HOST`                   | Same frontend origin                                  |
| `NEXT_PUBLIC_SUPABASE_URL`             | Staging public project URL                      | Same public project URL                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Staging publishable key                         | Same publishable key                                  |
| `DATABASE_URL`                         | **Absent**                                      | Private session-pooler URI                            |
| `SUPABASE_SERVICE_ROLE_KEY`            | **Absent**                                      | Private server secret/service-role key                |
| `SUPABASE_DB_CA_CERT`                  | **Absent**                                      | Project CA as actual multiline PEM                    |
| `OPS_HEALTH_TOKEN`                     | **Absent**                                      | Existing private random token, at least 32 characters |
| `STRIPE_SECRET_KEY`                    | **Absent**                                      | Optional; staging test mode only                      |
| `STRIPE_WEBHOOK_SECRET`                | **Absent**                                      | Optional; matching endpoint signing secret            |
| `STRIPE_BILLING_PLANS`                 | **Absent**                                      | Optional; approved plans JSON                         |
| `HOSTNAME`, `PORT`                     | Managed by Vercel; do not set                   | `0.0.0.0`, `10000`                                    |

The default deployment target is `fullstack` for local development and the Docker/VPS alternative. Do not leave that default on the Vercel frontend. Public variables and routing are build-time configuration: changes require a fresh build, not only a runtime restart. Enter values using provider environment-variable forms; no secret-bearing CLI commands are needed.

Deploy the reviewed frontend commit after the Render URL is known. The application uses Next `beforeFiles` rewrites so `/api/*` and `/auth/*` reach Render before existing route files, and the frontend proxy must not intercept these paths. Keep the browser's relative URLs; do not change uploads/login to cross-origin Render requests or add permissive CORS. There must be no Vercel API Function forwarding the upload body. [Next rewrite order](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites) documents the precedence.

Do not add CDN caching to private paths. The configured external API/auth rewrites explicitly disable caching with `x-vercel-enable-rewrite-caching: 0`, and backend responses retain private/no-store headers. New Vercel projects otherwise honor external-origin cache directives by default. Keep the backend's host-only, Secure, HttpOnly cookies associated with the browser's frontend origin. [Vercel external rewrites](https://vercel.com/docs/routing/rewrites) documents proxy forwarding and cache configuration.

Verify landing, login and `/api/health` through `https://FRONTEND_HOST`. Compare the configured origin against the actual address before continuing. Do not use arbitrary preview URLs for authenticated staging tests: they do not match the canonical `APP_URL`. Keep preview access separate from production data and do not authorize a wildcard of all Vercel domains.

## 5. Configure Supabase emails on the deployed frontend origin

The transactional email provider is still **unselected and unconfigured**. Hosted signup, invitations and recovery are not accepted until sender verification and real delivery tests pass.

1. In staging Supabase Authentication, enable email/password sign-in and require email confirmation. Set password minimum length to 12. CAPTCHA is not implemented; do not enable a mandatory CAPTCHA challenge until it is integrated.
2. Set Site URL to the exact `https://FRONTEND_HOST` used by both deployments. Add these exact Redirect URLs, replacing the hostname:

   ```text
   https://FRONTEND_HOST/auth/callback
   https://FRONTEND_HOST/auth/callback?next=/reset-password
   ```

   These routes are rewritten to Render, which returns redirects to the frontend origin. Do not put the Render URL or local project's localhost URLs in hosted production settings.

3. Choose a transactional email provider under `admin-dev@ecarteo.fr`, verify the sending domain through its DNS records, and configure its SMTP host, port, username, password and verified sender in Supabase. The default Supabase sender is not a production email setup. [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) explains the requirements.
4. Install the bilingual HTML in `supabase/templates/confirmation.html` and `supabase/templates/recovery.html` as the corresponding hosted templates. Their essential links are:

   ```html
   <!-- Confirm signup -->
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm email</a>
   <!-- Recover password -->
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery"
     >Reset password</a
   >
   ```

   `/auth/confirm` is a token-hash handler on the application; it is not a replacement Site URL. Use hosted subjects without “local”. Test cross-device opening as well as the PKCE callback flow. See [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## 6. Bootstrap the first administrator and pass hosted acceptance

1. With both services live on HTTPS and email configured, open `https://FRONTEND_HOST/signup`, register **admin-dev@ecarteo.fr**, and confirm its email. The Supabase platform owner and the application Auth user are separate identities.
2. Verify that exact user's UUID in staging Supabase Authentication. In its trusted SQL editor, promote only that verified UUID:

   ```sql
   update public.profiles
   set role='qualite', client_id=null, is_client_admin=false, active=true
   where id='<VERIFIED_AUTH_USER_UUID>';
   ```

3. Sign out and in on the frontend hostname. Create separate test operator and customer identities through the supported signup/invitation flows. Never copy local demo identities to a hosted environment. Team invitations produce links for authorized sharing; the application does not send those emails automatically.
4. Configure a private monitor against Render `/api/ready`, supplying the bearer token through the monitor's secret store. Public `/api/health` is insufficient: readiness checks the database, schema and private bucket. Do not paste the token into a URL or place it on Vercel.
5. Complete the client request → quality review/scenario → operator mission/evidence → published report → client action/retest flow. Verify two-tenant isolation, disabled users, cross-tab sign-out, expired sessions, EN/FR, mobile layouts and PDF generation. Follow [E2E.md](E2E.md); skipped credential-dependent tests are not passes.
6. Test signup confirmation, login, session refresh, recovery and sign-out through Vercel. Verify all `Set-Cookie` chunks are returned and stored for the frontend hostname, redirects stay there, and repeated private requests never become CDN cache hits. Verify valid-origin mutations work and cross-site mutations are rejected. Do not weaken CSRF checks to accommodate a wrong `APP_URL`.
7. **Required upload gate:** upload a valid allowed file of exactly **10,485,760 bytes (10 MiB)** through the frontend, including multipart overhead; download it back and compare bytes or SHA-256. Repeat above the limit and verify controlled rejection. Check Vercel observability confirms the request reached the external origin without invoking a frontend API Function. Inspect only safe routing/header metadata, never tokens or file contents in logs.

Vercel Functions have a 4.5 MB request limit, so a Function-based proxy cannot preserve this upload contract. External rewrites use a different CDN proxy path, but the official documentation does not publish an explicit external-request body ceiling. A local success is therefore not proof of hosted 10 MiB support. External proxy requests also have a 120-second timeout. If the staging gate fails, resolve the routing/provider constraint before launch; do not silently reduce the product limit or expose private Storage. [Function limits](https://vercel.com/docs/functions/limitations), [external proxy timeout](https://vercel.com/docs/limits#proxied-request-timeout).

## 7. Add billing and operational controls

Billing remains optional. If approved, follow [BILLING.md](BILLING.md) in Stripe test mode first. Configure all three Stripe variables together on Render, never on Vercel. Register the webhook at `https://BACKEND_HOST/api/billing/webhook`; its signature is verified by the backend. Stripe return URLs still use the frontend `APP_URL`. Test signed webhook delivery, replay/idempotency and customer scoping before live mode.

Use [OPERATIONS.md](OPERATIONS.md) for staged-upload cleanup, dry-run orphan reconciliation, database and Storage backups, restoration and audited corrections. The current Blueprint creates **no scheduler, backup destination or alert service**. Arrange a restricted scheduled runner with the documented maintenance scripts and secret store, and test its execution before production. Do not rely on Render's ephemeral app filesystem for backups.

The Docker `maintenance` image contains scripts but no `pg_dump`/`pg_restore`; database backup jobs need compatible PostgreSQL client tools, Node.js and encrypted off-site storage. Storage bytes require their own backup. Test a coordinated restore into a separate disposable environment. Do not run destructive retention or cleanup commands merely to verify deployment.

Keep application error/readiness alerts and provider resource/spend alerts assigned to an owner. Size the paid Render service using representative concurrent uploads and report work; the app's database pool can use five connections per backend process. Review [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) for legal content, retention, approved offers and support ownership.

## 8. Release production and roll back safely

After staging acceptance, create a **separate production Supabase project**, Render backend and Vercel frontend. Do not repoint the staging services at production data. Use the final approved hostname, its own secrets and sender settings, reapply reviewed migrations and bootstrap a separately confirmed `admin-dev@ecarteo.fr` Auth UUID. The user must approve production plans before creating paid resources.

Before every release, record the Git commit, backend/frontend deployment IDs, environment, six-migration baseline plus any new migrations, and the last tested pair. Take coordinated backups before schema changes. Deploy backward-compatible backend changes first, verify readiness, then deploy the matching frontend and run smoke tests. Keep Render auto-deploy off until a deliberate release policy is agreed; Vercel frontend auto-deploy settings also need review so pushes do not publish an unpaired release.

For an application-only rollback, select the previous tested Render deployment and Vercel deployment as a pair; preserve the correct public build values and backend origin. Verify both hosts still point to the same Supabase environment. Provider rollback does not undo migrations or restore deleted data. Fix schema problems with reviewed forward migrations or a tested restore into a replacement project, accounting for writes after the backup. Never reset the production database to make an old release start.

Creating these files does not configure provider accounts, SMTP, billing, monitoring, backups or DNS. Mark the deployment ready only after the hosted gates above have recorded passing evidence.
