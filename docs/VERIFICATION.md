# Verification status

Updated 9 November 2026 after the complete local QA pass, including authentication-outage and cross-tab session fixes. The configured application and persistent local Supabase remain available for user testing. These results do not claim a hosted deployment or production-provider acceptance. A skipped test is never counted as a pass.

## Automated checks

| Check                                                   | Executed result                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Unit, domain, API and PostgreSQL integration suite      | **153 tests passed across 21 files**, with a fresh dedicated disposable database and no skipped tests                 |
| Configured public/account/security/report browser suite | **9 Chromium tests passed**; the missing-provider case explicitly skipped because Supabase is configured              |
| Real local Supabase browser suite                       | **7 authenticated tests passed** against actual Auth, PostgreSQL, private Storage and Mailpit                         |
| English/French browser suite                            | **4 tests passed**, including public/account/mobile pages and all three authenticated roles                           |
| Protected-page session browser regressions              | **2 tests passed**, covering team/requests/billing content removal after rejected sessions and signout in another tab |
| Production Next.js build                                | Passed after the session and authentication-outage fixes                                                              |
| Strict TypeScript, ESLint and formatting                | Passed                                                                                                                |
| Production dependency audit                             | **Zero reported vulnerabilities** in the current `npm audit --omit=dev` result                                        |

The final complete browser run covers **22 passed cases and one deliberate skip**, with Chromium at desktop 1440 px and mobile 390 px widths. Language checks verify preference persistence, form-value preservation, translated errors and navigation between public, account, console, team, requests and billing pages. The client report assertion waits for the actual report controls after navigation. Provider cases skip without test credentials; the default unit-test run skips database cases unless `ECARTEO_TEST_DATABASE_URL` points to a dedicated disposable test database. See [E2E.md](E2E.md), [local development](LOCAL-DEVELOPMENT.md) and the [database test instructions](../supabase/tests/README.md).

All six migrations replayed on a fresh database. SQL assertions passed for tenant/operator isolation, direct report projection, immutable records, protected Storage policies, correction-supplement isolation and provisioning boundaries. Integration tests exercise concurrent/idempotent commands, atomic publication, bounded pagination, stale draft edits, invitations, membership administration, audit intake, billing state and privacy operations.

The QA pass fixed two session/authentication edge cases. All protected pages now remove rendered private content when a request confirms session expiry or revoked access, and when another tab signs out. Temporary Auth/PostgREST failures return a localized 503 instead of being treated as invalid credentials, expired sessions or a successfully sent recovery email. An unconfirmed password-update response no longer advances to session revocation or reports success. Real missing sessions and denied accounts still fail closed with 401/403. Regression tests cover these distinctions.

A scoped minimatch override resolves the development parser dependency advisory without downgrading Next.js. An audit is a point-in-time result, not a guarantee against future vulnerabilities.

## Real local provider acceptance

The authenticated browser tests exercised:

- Signup, local email confirmation, login, password recovery and login with the replacement password.
- Scenario execution, private evidence upload/download, scoring, report publication and customer report access.
- Cross-tenant file denial and client/operator permission boundaries.
- Customer audit requests, quality conversion and subsequent draft editing.
- Organization search, email-bound invitation confirmation/redemption into the intended tenant and billing/team access denial.
- Signout and rejection of disabled members.

Mailpit captured messages locally; **no external SMTP delivery was tested or sent**. The tests used disposable identities and local data. Auth/Storage success locally does not validate a hosted region, production network rules, cloud backups or the final deployment domain.

## Deployment and recovery checks

- Runner and maintenance Docker images built successfully in the earlier production-readiness pass. That runner served ten baseline browser checks as a non-root user with a read-only filesystem. The subsequent language changes passed the Next.js production build and configured local browser suite; rebuild the container from current source before deployment.
- Public assets and bundled report-font hashes matched the source files. Unconfigured private APIs failed closed with private/no-store headers.
- Docker Compose and Caddy configuration validated. Public DNS, certificate issuance and deployed infrastructure were not exercised.
- The authenticated readiness endpoint returned success against real local Supabase, including database/schema/private-bucket checks.
- A real local database archive restored into a separate disposable database. Storage metadata rows are excluded from the database archive so that the Storage API recreates them with the restored bytes.
- Real private Storage export, checksum verification, restore into a unique scratch object, repeated idempotent restore and byte comparison passed. The scratch object was removed without changing existing evidence.
- The disposable SQL test cluster was stopped. The requested persistent local Supabase and app on port 3000 remain running. API, database and Mailpit Docker ports are verified to bind only to `127.0.0.1`. No production secrets or actual fixture credentials were added to the repository.

The local setup created three confirmed test identities, an approved bilingual scenario, a planned operator mission, a published client report with private evidence and three actions, and an editable draft. Re-running setup preserved fixture records, passwords and existing sessions. Local credential files are ignored by Git and owner-readable only. Signup/recovery emails contain both French and English and are captured in Mailpit. Startup refuses remote Docker engines and unsafe pre-existing port mappings. Test login counters for only the three newly created accounts were cleared after acceptance; the normal authentication limits remain enabled.

Managed Supabase recovery, encrypted off-site backup schedules and alert delivery still require configured staging/production infrastructure.

## Visual and report evidence

Playwright exercised desktop 1440 px and mobile 390 px layouts. Isolated harnesses outside the repository also imported the actual production components and CSS to check team/request flows, all twelve templates across four sectors, sector filters, draft creation/edit/save/reload, search and cursor navigation. The verified layouts had no horizontal overflow or application console errors. Fixture harnesses supplement provider tests; they never introduce a production authentication bypass.

The final authenticated browser sweep passed 23 additional checks: all eight console modules plus team and requests at both widths, mobile menu navigation, and separate 15-second idle checks on login and the dashboard. The idle checks verified that no new document request occurred, the document time origin stayed unchanged and entered form values were preserved. No horizontal overflow or browser console errors were recorded. Desktop and mobile dashboard/library screenshots were visually reviewed. The original signed-in in-app browser also reported no warnings or errors. Local development remains on Webpack to avoid the previously reproduced Turbopack reload loop.

Chinese native PDF output uses an embedded local font. Arabic native PDF output was rejected after a glyph/Unicode extraction defect was reproduced; Arabic reports deliberately use a browser-print flow with local Amiri and the browser's shaping engine. Browser PDF text extraction can reorder right-to-left words; the application copy-text flow preserves the source Unicode. Current dated corrections accompany exports, and export fails if the correction list cannot be verified. See [PDF-LANGUAGES.md](PDF-LANGUAGES.md) for supported paths and limitations.

The no-JavaScript account test verifies an explicit POST action, disabled submission, a visible explanation and no credentials in URL query parameters. This also protects the interval before React hydration.

## Still required before customer use

Follow [Supabase setup](SUPABASE.md), [deployment](DEPLOYMENT.md), [billing](BILLING.md), [operations](OPERATIONS.md) and the [launch checklist](LAUNCH-CHECKLIST.md).

- Create/configure hosted staging and production Supabase projects; repeat authenticated acceptance with hosted email and private Storage.
- Configure SMTP, sender-domain verification and delivery outside the team.
- If subscriptions are enabled, configure approved Stripe products/prices and exercise test-mode checkout, invoice portal, webhook delivery/retries, failed payment and cancellation. Local tests use the real SDK for signature verification but mock Stripe network operations.
- Deploy HTTPS on the final domain, apply infrastructure abuse controls, connect private monitoring/alerts and schedule maintenance.
- Run a managed-project restore drill, configure encrypted off-site backups and test capacity at the expected customer/audit volume.
- Approve business identity, commercial offers, privacy/terms/contact information, support ownership and contract-specific retention/erasure decisions before collecting customer evidence.

No cloud project, live charge, external email, production account or public deployment was created by this task.
