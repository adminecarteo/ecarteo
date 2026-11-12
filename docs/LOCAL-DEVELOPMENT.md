# Run the complete application locally

You can use real Supabase Auth, PostgreSQL, private Storage and email confirmation without creating a cloud project. The included `supabase/config.toml` describes a separate local Docker project named `ecarteo-local`; it contains no credentials or sample customer data. Local email is captured by Mailpit and is not delivered externally.

## 1. Install prerequisites

Use Node.js 22.13 or newer and a running Docker engine. Install project packages:

```sh
npm ci
```

The commands below use the verified Supabase CLI 3 release. The first start downloads the required container images and may take several minutes. No Supabase login or hosted account is needed for these local commands.

## 2. Start the isolated backend

From this repository root:

```sh
node scripts/start-local-supabase.mjs
```

The helper runs Supabase CLI 3.0.0 and starts PostgreSQL, Auth, PostgREST, private Storage, the API gateway and Mailpit. It creates a dedicated Docker network and explicitly binds published ports to `127.0.0.1`. This explicit binding is needed because Docker Desktop can ignore the CLI network's default bind address. The short-lived Docker forwarding socket stays in a private local directory; it never listens over TCP, rejects unrelated container mutations and is removed after startup. CLI output, which contains local provider keys, is captured in a private log rather than printed.

The first start applies all migrations in filename order. **Do not apply `supabase/tests/bootstrap.sql`**: the actual local Supabase containers provide Auth and Storage themselves. If the helper finds older containers already bound to all interfaces, run `npx --yes supabase@3.0.0 stop`, then rerun the helper. This preserves local data.

| Service           | Local address            |
| ----------------- | ------------------------ |
| App, after step 4 | `http://127.0.0.1:3000`  |
| Supabase API      | `http://127.0.0.1:55321` |
| PostgreSQL        | `127.0.0.1:55322`        |
| Captured email    | `http://127.0.0.1:55324` |

These dedicated ports avoid the CLI’s default 5432x stack. If a port is already used, choose different ports in `supabase/config.toml` before starting and update the corresponding app values. Keep the exact hostname consistent: use `127.0.0.1` for the app and callbacks.

## 3. Connect the app

For the supplied local testing workspace, run:

```sh
node scripts/setup-local-workspace.mjs --accounts-only
```

This writes ignored, owner-readable `.env.local`, `.env.local-accounts`, and `.env.e2e.local` files. It creates three confirmed local-only identities:

| Email                   | Role                   | What to test                                                 |
| ----------------------- | ---------------------- | ------------------------------------------------------------ |
| `admin@ecarteo.test`    | Quality administrator  | Scenarios, scheduling, scoring, publication, team management |
| `operator@ecarteo.test` | Operator               | Assigned missions, execution notes and evidence upload       |
| `client@ecarteo.test`   | Customer administrator | Published reports, actions and audit requests                |

Read their generated passwords in `.env.local-accounts`: `ADMIN_PASSWORD`, `OPERATOR_PASSWORD`, and `CLIENT_PASSWORD`. There is no shared default password. The setup verifies the saved credentials through real Supabase password login and refuses to take over an existing identity it did not create. Re-running it preserves passwords, existing records and manual changes. If a sample account was later disabled or its role changed, setup stops rather than restoring access silently.

The helper is restricted to the `ecarteo-local` project and loopback provider/database/application URLs. It preserves any existing environment file that targets another backend by stopping with an explanation. It leaves billing unconfigured.

To configure an empty workspace manually instead, skip the account helper:

```sh
cp .env.example .env.local
npx --yes supabase@3.0.0 status
```

Read the local values from `status` and edit `.env.local` in your editor:

| Application variable                   | Local status value                                    |
| -------------------------------------- | ----------------------------------------------------- |
| `APP_URL`                              | `http://127.0.0.1:3000`                               |
| `NEXT_PUBLIC_SUPABASE_URL`             | API URL                                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key; the local anon key is also supported |
| `DATABASE_URL`                         | Local database URL                                    |
| `SUPABASE_SERVICE_ROLE_KEY`            | Local service-role key                                |

`status -o json` exposes these under `API_URL`, `PUBLISHABLE_KEY`, `ANON_KEY`, `DB_URL`, and `SERVICE_ROLE_KEY`. Keep generated secrets only in your ignored local env files. Never copy them into a chat, commit or screenshot. Leave Stripe configuration empty unless intentionally testing billing with Stripe test keys. A random local `OPS_HEALTH_TOKEN` can enable authenticated readiness checks; see [OPERATIONS.md](OPERATIONS.md).

## 4. Start and create your account

```sh
npm run dev
```

Local development uses Next.js's supported Webpack mode. This avoids the continuous Turbopack refresh loop observed in the in-app browser; production builds still use the normal build command.

With the supplied accounts, create the sample workspace through the running application's authenticated APIs:

```sh
node scripts/setup-local-workspace.mjs --seed
```

Sign in at `http://127.0.0.1:3000/login` with any of the three accounts. The sample includes a bilingual approved scenario, a planned mission assigned to the operator, one published customer report with downloadable evidence and 7/30/90-day actions, and an editable draft. All sample contacts and observations are fictional; no external message is sent. Per-step receipts make the command safe to rerun without duplicating completed fixtures, and user edits to existing sample records are retained.

For your own new account, open `http://127.0.0.1:3000/signup` and use a development-only email such as `you@example.test`. Open Mailpit at `http://127.0.0.1:55324`, find the confirmation email and follow its link. Normal signup creates an empty customer organization; nothing is purchased and no sample audit is inserted. The organization creator can manage billing if optional billing is configured.

Password recovery uses the same local inbox. The confirmation and recovery templates are under `supabase/templates/`; both route through the application’s token-hash verification endpoint.

## 5. Create the first quality administrator

The optional setup helper already created `admin@ecarteo.test` with quality access; skip this step if using it. For a manually created workspace:

After confirming the intended staff email, open a trusted local database shell:

```sh
docker exec -it supabase_db_ecarteo-local psql -U postgres -d postgres
```

Identify the exact user, inspect its confirmation status, then promote only that verified UUID:

```sql
select id, email, email_confirmed_at from auth.users order by created_at desc;

update public.profiles
set role='qualite', client_id=null, is_client_admin=false, active=true
where id='<verified-staff-user-uuid>';
```

Exit with `\q` and reload the app. A staff account’s original empty signup organization is retained; no customer record is silently deleted. Use `/app/team` to invite operators and customer team members. Copy the invitation link, register/confirm the intended email through Mailpit, then reopen the invitation and accept. See [ACCOUNTS-AND-REQUESTS.md](ACCOUNTS-AND-REQUESTS.md).

Create a separate customer account for audits. As quality, choose a library template or convert a customer request, complete its draft, approve it and schedule an operator. Execute, upload evidence, score, publish and inspect the report as that customer.

## 6. Run browser acceptance tests

The optional setup helper writes all three role credentials to the ignored `.env.e2e.local`. For a manually configured workspace, create dedicated quality, operator and client fixture accounts using [E2E.md](E2E.md). Save their credentials in that file and add:

```dotenv
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000
E2E_MAILPIT_URL=http://127.0.0.1:55324
```

Keep the app running, then run:

```sh
node --env-file=.env.e2e.local ./node_modules/@playwright/test/cli.js test tests/e2e/console.spec.ts tests/e2e/intake.spec.ts tests/e2e/local-provider.spec.ts
```

The console test creates the private evidence used by the local provider isolation test. The local provider suite validates real email confirmation/recovery, invitation redemption and disabled-account enforcement. It explicitly refuses external app/mail hosts. All test requests and audits remain in this local database for inspection; use dedicated test identities. Provider tests do not validate a hosted region, production SMTP delivery, DNS, TLS termination or cloud backups.

When `PLAYWRIGHT_BASE_URL` is set, Playwright uses your already-running server. When omitted, the default public suite starts or reuses the server on 3000. For a second QA app instance, `ECARTEO_LOCAL_QA=1` selects a separate generated `.next-qa` directory; change `APP_URL`, Auth Site URL and callbacks to the second port before using it. Normal development does not need this flag.

## 7. Stop and resume

Stop Next with Ctrl+C, then stop only this project’s Supabase containers:

```sh
npx --yes supabase@3.0.0 stop
```

The local data is retained. Run `node scripts/start-local-supabase.mjs` and `npm run dev` to resume. The account helper does not need to be rerun after a normal restart. Do not use a destructive database reset or container volume removal to restart. `supabase db reset` destroys local application records and reapplies migrations; it belongs only in an intentionally disposable test environment.

For hosted deployment, follow [DEPLOYMENT.md](DEPLOYMENT.md) with separate staging/production projects and secrets. The local configuration and test email sink are not a production hosting setup.

References: [Supabase local development](https://supabase.com/docs/guides/local-development), [local configuration](https://supabase.com/docs/guides/local-development/cli/config), [Mailpit integration testing](https://mailpit.axllent.org/docs/integration/).
