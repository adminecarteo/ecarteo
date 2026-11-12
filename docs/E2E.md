# Browser acceptance tests

`npm run test:e2e` uses Chromium at `http://127.0.0.1:3000`. Playwright reuses a running development server or starts `npm run dev -- --port 3000`. Install the browser once with `npx playwright install chromium` if necessary.

The public tests in `tests/e2e/saas.spec.ts` exercise navigation, account form accessibility, origin checks, setup state and responsive layouts without test accounts. The authenticated tests in `tests/e2e/console.spec.ts` sign in through the real `/login` form. The application has no test login endpoint, seeded production records, role switch or authentication bypass.

## Supabase fixture

Use a dedicated, disposable Supabase project. The lifecycle test creates and publishes an audit and uploads its evidence; those records intentionally remain available for inspection. Do not point the suite at a production workspace.

1. Apply all SQL migrations in `supabase/migrations` in filename order. Configure the application's Supabase public URL/key, server database connection and storage service key as described in [SUPABASE.md](SUPABASE.md). Set `APP_URL=http://127.0.0.1:3000` and allow that callback origin in Supabase Auth. Restart Next after changing application environment values.
2. Create three dedicated accounts through signup and confirm their email addresses: quality reviewer, operator and client. Confirmed signup provisions a client profile. Use test addresses and passwords managed in your local secret store or CI secret configuration.
3. In the Supabase SQL editor, a trusted administrator can promote the quality and operator accounts. Substitute the two test addresses below. Do not expose this operation through a browser-facing account field.

   ```sql
   update public.profiles
   set role = 'qualite', client_id = null, active = true, is_client_admin = false
   where id = (select id from auth.users where email = 'quality-test@example.test');

   update public.profiles
   set role = 'operateur', client_id = null, active = true, is_client_admin = false
   where id = (select id from auth.users where email = 'operator-test@example.test');

   select p.client_id
   from public.profiles p
   join auth.users u on u.id = p.id
   where u.email = 'client-test@example.test' and p.role = 'client' and p.active;
   ```

4. Set `E2E_CLIENT_ID` to the client UUID returned by the query. The lifecycle test requires this explicit client selection and an active operator in the server roster. It never chooses an arbitrary client for writes.
5. Leave the client account without published audits when you want to verify the new-account welcome state. After the lifecycle test publishes to that client, the same test verifies client scope and read-only access instead.

## Credentials and execution

Provide these values to the Playwright process through your shell or CI secret manager:

| Variable               | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `E2E_QUALITY_EMAIL`    | Confirmed account with trusted `qualite` profile            |
| `E2E_QUALITY_PASSWORD` | Password for that account                                   |
| `E2E_CLIENT_EMAIL`     | Confirmed account with trusted `client` profile             |
| `E2E_CLIENT_PASSWORD`  | Password for that account                                   |
| `E2E_CLIENT_ID`        | UUID of the dedicated client to receive the lifecycle audit |

Next reads application configuration from `.env.local`; Playwright does not automatically load it into the test process. Export test credentials separately, or use a Node environment file that is ignored by Git:

```sh
node --env-file=.env.e2e.local ./node_modules/@playwright/test/cli.js test
```

An `.env.e2e.local` file can contain the five test variables above. Keep actual passwords out of committed files and command arguments. To run only authenticated checks:

```sh
node --env-file=.env.e2e.local ./node_modules/@playwright/test/cli.js test tests/e2e/console.spec.ts
```

Quality tests explicitly skip without the quality credentials. Client tests explicitly skip without client credentials. The mutating lifecycle additionally skips without `E2E_CLIENT_ID` or an active operator; an unknown supplied client UUID fails the test. A skipped test is not evidence that hosted authentication, private storage or tenant isolation passed.

## What is checked

- Server identity, absence of role-preview controls, French/English and theme preference persistence.
- Scenario creation and approval, assignment using a real operator UUID, mission execution, observation persistence and actual text-file upload/download byte equality.
- All eight scores, publication, locked published ratings and a generated report beginning with the `%PDF-` signature.
- Client responses scoped to their own company and published missions, rejection of quality commands, and the welcome state when no audit is published.
- Signout rejects subsequent API access and hides the workspace in another open tab.

Failure screenshots, traces and generated report attachments are placed under the ignored `test-results` directory. Traces can contain test-account details and audit text; keep them in private CI artifacts.

`npm test -- tests/workspace-client.test.ts` runs the isolated transport tests without a server or credentials. These verify idempotency-key reuse, response validation, error parsing, mission-bound uploads and supported attachment validation. They do not replace the authenticated browser run.

## Audit requests and invitation acceptance

`tests/e2e/intake.spec.ts` uses the same dedicated client and quality credentials and explicitly skips if any are absent. It creates a clearly labelled test request as the client, searches for it in a separate quality session, accepts the scope, converts it to a draft, verifies incomplete approval is blocked, edits the protocol and checks persistence after reload. It confirms the client sees the request status without the internal scenario link. The test leaves its request and draft for inspection, schedules no mission, and sends no external messages.

Run it against staging after all migrations are applied:

```sh
node --env-file=.env.e2e.local ./node_modules/@playwright/test/cli.js test tests/e2e/intake.spec.ts
```

Complete invitation acceptance manually with dedicated test inboxes:

1. As quality, use `/app/team` to create a client invitation to the dedicated organization. Copy the returned fragment link; do not put it in logs, screenshots, tickets or CI output.
2. Open the link in a fresh browser profile. Register the intended email and confirm it from the inbox, then reopen the original invitation link and accept. Verify the account joins the selected organization and no second organization was created.
3. Attempt the same link with a different confirmed email: acceptance must fail. Repeat with an expired or revoked link. Regenerating an invitation must invalidate its previous pending token.
4. As quality, nominate a customer billing administrator and confirm an ordinary invited member cannot manage billing. Disable the invited member and verify the next authenticated API request is denied.
5. Create a staff invitation, then disable its issuing quality identity before acceptance. Acceptance must fail. Restore only through another trusted administrator.

These cases exercise the real Auth/email provider and cannot be counted as passed by the isolated component harness or PostgreSQL tests. Test tokens and email/password credentials must stay out of committed artifacts.

## Fully local provider tests

[LOCAL-DEVELOPMENT.md](LOCAL-DEVELOPMENT.md) explains how to run actual Supabase Auth, private Storage and Mailpit locally without a cloud account. Set `PLAYWRIGHT_BASE_URL` to the already-running local app and `E2E_MAILPIT_URL` to its local inbox URL. When the base URL override is present, Playwright does not start another development server.

`tests/e2e/local-provider.spec.ts` explicitly requires loopback app/mail URLs plus dedicated test credentials. After the console lifecycle fixture has created evidence, it exercises real signup/email confirmation, recovery and new-password login; denies a different customer's private file and guessed mission ID; searches organization choices; accepts an email-bound invitation; denies ordinary members billing/team administration; and checks immediate access denial after member deactivation. It sends mail only into the local SMTP sink.

The initial local provider run uncovered a native-form fallback: submitting before JavaScript hydration could use a GET query. Auth forms now use POST and keep submission disabled until hydration; the public browser suite includes a no-JavaScript regression check. Real local-provider browser checks passed after this fix. Hosted SMTP, HTTPS cookies and cloud deployment still require staging acceptance.
