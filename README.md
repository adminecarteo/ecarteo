# Écartéo

Écartéo combines a public website with an authenticated B2B customer-experience audit platform. It follows the supplied Écartéo prototype and deployment dossier: scope a journey, collect evidence, validate the assessment, publish a report, track corrective actions, then retest.

## Run locally

Requires Node.js 22.13+ and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. For a compiled local run, use `npm run build` followed by `npm start`; the start script loads `.env.local` and serves standalone assets. The public website and account pages work without credentials. The private workspace deliberately stays unavailable until Supabase is configured; it never falls back to sample data or a role selector.

To run the complete authenticated application without a cloud account, follow the [local Supabase guide](docs/LOCAL-DEVELOPMENT.md). It covers Docker, captured confirmation/recovery emails, account creation and staff setup. For hosted projects, follow [deployment and activation](docs/DEPLOYMENT.md). A disposable local Supabase stack has been used for authenticated workflow verification; it is separate from your future hosted projects. No cloud project, paid subscription, production account, or public deployment has been created.

## Implemented

- Public landing, method, and offers pages; responsive navigation and shared brand identity.
- Email/password signup and login, confirmation, password recovery, password reset, logout, server-verified sessions and protected `/app`.
- Confirmed customer signup creates a private client workspace. Staff roles are provisioned only by a trusted administrator; user metadata cannot grant privileges.
- Eight console modules: dashboard, scenarios, missions, scoring, evidence, reports, retests, and corrective-script library.
- PostgreSQL transactions, row-level security, UUID-based operator assignment, immutable reports, idempotent commands, stale-edit checks and durable authentication throttling.
- Private file storage with 10 MB limits, byte validation, ownership checks, staged upload binding and authenticated download.
- French/English public, account, console, team, audit-request and billing pages, with one persistent language preference, localized validation, accessible dialogs and responsive layouts. Customer-written content stays unchanged. Latin/Chinese reports download as PDF; Arabic reports use the explicit browser-print/Save as PDF path with bundled fonts. See [PDF language coverage](docs/PDF-LANGUAGES.md) for tested behavior and text-extraction limits.
- Quality-managed team invitations, member suspension/reactivation, client billing administrators and single-use email-bound invitation redemption.
- Client audit requests, status tracking and quality conversion into an editable scenario draft; draft saves reject stale edits.
- Optional Stripe subscriptions through hosted Checkout and invoice/customer management through the hosted portal. Signed webhooks and durable retry records reconcile billing state.
- Server-side keyset history pages, global history search, full-scope dashboard aggregates and conditional refreshes. Commands load only their target audit aggregate.
- Twelve editable starter scenarios across hospitality, clinics, training and real estate, with four sector review guides; all require client-specific quality approval.
- Append-only report corrections, privacy-case tracking/export, readiness checks, structured safe error logs, backup/restore and conservative upload maintenance tooling.

The dossier's service-led offer remains available on quotation. Optional self-service billing is disabled until approved Stripe products/prices and webhook credentials are configured; no prices or commercial commitments are invented. Signing up does not purchase an audit. Customers submit requests; Écartéo reviews, configures and assigns the work. The first customer workspace starts empty.

## Stack and architecture

Next.js 16 App Router, React 19, strict TypeScript, Supabase Auth/PostgreSQL/Storage, `@supabase/ssr`, the `postgres` transaction driver, Stripe, Zod, Radix Dialog, React-PDF, Vitest and Playwright. Fonts are bundled locally. Dependencies are locked in `package-lock.json`. A scoped minimatch override patches the development parser dependency without downgrading Next.js.

```text
src/app/          Public/account pages, protected console, API and auth routes
src/components/   Shared primitives, brand, marketing and account UI
src/features/     Audit workflow modules
src/domain/       Scoring, authorization rules, state transitions and snapshots
src/server/       Verified identity, transactional persistence and API boundaries
src/lib/          HTTP adapter, context, validation, localization and PDF output
supabase/         Versioned schema, RLS, provisioning and database test fixtures
scripts/          Privileged maintenance tools (dry-run by default)
tests/            Domain, HTTP/auth, adapter, database and browser tests
```

Browser requests carry an HTTP-only Supabase session. Protected workspace endpoints verify the user and active profile; the backend rechecks the trusted profile inside its database transaction. Workspace reads run with the authenticated RLS role. Private account/billing operations enforce their own trusted role and tenant checks before privileged queries. Writes execute domain rules under transaction locks and persist only changed records. Invitation redemption verifies the confirmed identity before creating its profile. Privileged credentials remain on the server. Published snapshots contain only client-safe content.

The old seed/IndexedDB modules remain isolated test fixtures; no application route imports or enables demo persistence. Unsaved console drafts are scoped to the account and cleared on identity change/signout. Committed customer records and evidence live on the server.

## Validate

```sh
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:e2e
```

Install browser binaries with `npx playwright install chromium`. Database tests require a disposable PostgreSQL database: [database test instructions](supabase/tests/README.md). Authenticated browser tests require dedicated Supabase test accounts: [E2E setup](docs/E2E.md). Provider-dependent tests skip explicitly when configuration is missing; a skipped test is not a successful provider verification.

[Verification status](docs/VERIFICATION.md) records the actual checks and remaining activation requirements. [DESIGN.md](DESIGN.md) and [UX-CONTRACT.md](UX-CONTRACT.md) define UI ownership and behavior. [Supabase architecture](docs/SUPABASE.md) explains tenant isolation and persistence.

## Production boundary

The production integration is implemented, but **the service is not live or signed off for customer data** until hosted Supabase projects, verified email delivery, deployment secrets and staging acceptance are completed. Authenticated workflows have passed against real local Supabase Auth/Storage services in addition to isolated PostgreSQL tests. That does not validate hosted SMTP, production credentials/networking, Stripe payments or the final deployment domain. Docker and CI configuration are included; use the deployment checklist before launch.

Start with [Supabase setup](docs/SUPABASE.md), then [deployment](docs/DEPLOYMENT.md). Use [team and audit request instructions](docs/ACCOUNTS-AND-REQUESTS.md), [optional billing activation](docs/BILLING.md), [operations and restore procedures](docs/OPERATIONS.md), and the [launch checklist](docs/LAUNCH-CHECKLIST.md).

External telephone/WhatsApp/CRM automation is not part of the service-led audit workflow; operators record approved interactions and evidence. Invitation delivery is a deliberate manual copy-link workflow. Privacy requests and corrections are supported, but permanent erasure of immutable evidence needs an approved retention/legal-hold decision and reviewed targeted maintenance. The application does not silently weaken audit immutability. Load-test the intended production volume: parent audit pages are bounded, while each selected audit's evidence and events and the authorized client/operator directories are loaded together.
