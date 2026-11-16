# Launch sign-off checklist

A checked item needs evidence and an owner. Implemented code or a skipped test does not satisfy a provider-dependent item. Local results are recorded in [VERIFICATION.md](VERIFICATION.md).

## Local deliverables

- [x] Landing/method/offers pages and account confirmation/recovery flows.
- [x] Authenticated role/tenant isolation, transactional audit workflow and private evidence.
- [x] Authenticated workflow acceptance against real local Supabase Auth/Storage services; see verification notes for exact coverage.
- [x] Quality account administration, invitation redemption and customer audit requests.
- [x] Optional Stripe checkout/portal/subscription webhook integration with configured prices.
- [x] Twelve sector scenario templates for quality review before fieldwork.
- [x] Bounded workspace loading, search/page controls and database indexes.
- [x] Private readiness, restricted structured error events and maintenance utilities.
- [x] Docker/Compose/Caddy deployment assets and CI quality gates.
- [x] Backup/checksum verification tooling, privacy case inventory/export and immutable report supplements.
- [x] Detailed Supabase, deployment, billing, account workflow and operations instructions.

## Hosted release and owner sign-off

The [production handover](PRODUCTION-HANDOVER.md) records the two environments and the actions assigned to Intertrad.

- [x] Create separate staging/production Supabase projects and record their regions/owners.
- [x] Set separate production and staging build/runtime credentials.
- [ ] Complete the staging database credential rotation and verify Render reconnection.
- [x] Apply all seven migrations, confirm application RLS and verify the production private evidence bucket and 10 MiB limit.
- [ ] Configure SMTP, sender DNS, exact redirects and email confirmation/recovery templates.
- [x] Bootstrap and verify the first production quality administrator (`admin-dev@ecarteo.fr`).
- [ ] Nominate customer administrators as real customers onboard.
- [ ] Repeat signup/recovery/session/disabled-account and invite-replay acceptance against hosted staging with real SMTP delivery.
- [x] Complete a hosted staging audit, verify the 10 MiB file and PDF, and deny the same report and file to a second customer and unassigned operator.
- [ ] Test Stripe sandbox checkout, signed webhook retries, cancellation, portal invoices and failed payments if billing is enabled.
- [ ] Approve commercial plans/prices, tax/invoice settings and support/refund handling before enabling live billing.
- [ ] Review scenario templates and customer execution permissions; approve actual fieldwork scope.
- [ ] Deploy on the final domain; verify HTTPS, private cache behavior, 10 MiB uploads and upstream abuse controls.
- [x] Connect source control/CI and record the deployed commit, migrations, Render deployment ID and previous working release.
- [ ] Route private readiness/error/backup/cleanup alerts to named responders and test delivery.
- [x] Schedule daily expired-upload cleanup and verify its production preview from GitHub.
- [ ] Review unexpected storage orphans and responder delivery during regular operations.
- [ ] Configure encrypted off-site database+file backups, retention and backup-age alerts.
- [x] Restore a database, accounts, report and evidence into an isolated Supabase stack and verify actual sign-in, file bytes and tenant isolation.
- [ ] Retrieve a production backup from the approved off-site destination and measure recovery time against Intertrad’s targets.
- [ ] Approve company identity/contact, privacy notice, customer terms, retention/erasure/hold rules and customer communications.
- [ ] Review mobile/keyboard/accessibility and test load for intended launch volume on target infrastructure.
- [ ] Record launch decision, unresolved limitations and escalation owner.

## Scope boundaries to communicate

Écartéo operates one central audit service with customer tenants. Quality staff manage the service; this is not a multi-agency platform. Invitation links are manually shared by quality staff. Payments require your Stripe account/catalog; no invented pricing or charges occur automatically. Confirmation/recovery mail requires real SMTP. French/English/Chinese reports use PDF download; Arabic uses the locally bundled-font browser print/save-as-PDF path described in [PDF-LANGUAGES.md](PDF-LANGUAGES.md). Review actual customer text before offering additional writing systems. Immutable report corrections use dated supplements; destructive erasure requires an approved, tenant-specific retention process. A local database restore validates the tooling, not hosted provider recovery.
