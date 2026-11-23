# Launch sign-off checklist

A checked item needs evidence and an owner. Implemented code or a skipped test does not satisfy a provider-dependent item. Local results are recorded in [VERIFICATION.md](VERIFICATION.md).

Latest operational follow-up: [23 November 2026](LAUNCH-STATUS-2026-11-23.md).

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

The [production handover](PRODUCTION-HANDOVER.md) records the two environments and the actions assigned to Intertrad. The current verified application release is `9008544`, deployed on 20 November 2026; email template source `7ec5fc0` is published separately in Supabase. Split checks below distinguish completed configuration from provider delivery and launch approval that still need evidence.

- [x] Create separate staging/production Supabase projects and record their regions/owners.
- [x] Set separate production and staging build/runtime credentials.
- [x] Rotate the staging database password and verify Render reconnection (owner: Intertrad). On 2026-11-16, a fresh SQL login succeeded and Render deployment `dep-dbtgsfnf3r2c73b8bmd0` went live. Its authenticated `/api/ready` check returned HTTP 200 with configuration, database, schema and storage all passing.
- [x] Apply all seven migrations, confirm application RLS and verify the production private evidence bucket and 10 MiB limit.
- [x] Configure custom SMTP and exact root-domain auth redirects; verify a delivered root-domain recovery email. Evidence: 18 November cutover acceptance.
- [x] Verify fresh root-domain signup → delivered confirmation → correct client workspace → fresh password login. On 20 November, the approved QA inbox received the message at **10:09:57 Paris time**; SPF, primary `rsa1` DKIM and DMARC passed. The separate `ed1` signature returned neutral/no-key; this does not claim that every provider signing configuration was remediated.
- [x] Bootstrap and verify the first production quality administrator (`admin-dev@ecarteo.fr`).
- [x] Provision and verify production browser login for `operator@ecarteo.fr`, selected under the owner's delegation. The active `operateur` profile sees mission/evidence/library navigation; the quality-only team administration API denied access with HTTP 403. Credentials are stored privately in `.env.production-operator`. Mailbox existence and email delivery to this newly selected address have not been verified.
- [x] Verify current customer administrator coverage. On 20 November at 15:14:42 UTC, all three active non-QA customer organizations had an active client administrator; none were missing one. Nomination remains part of each future onboarding.
- [x] Complete hosted-staging session/disabled-account/invitation acceptance: all 11 checks passed, including unconfirmed access denial, genuine refresh, logout/refresh-token replay, wrong-user/revoked/expired invitations and concurrent idempotent redemption. Synthetic account deactivated. [Evidence](HOSTED-ACCEPTANCE-2026-11-20.md)
- [x] Verify hosted-staging signup/recovery inbox delivery with persistent custom SMTP. On 23 November, actual designed messages reached the approved Inbox; received links, exact client identity, password update, old-password rejection, new-password API/browser login and recovery replay checks passed. [Follow-up evidence](LAUNCH-STATUS-2026-11-23.md).
- [x] Retest the redesigned production confirmation and recovery emails end to end. Both reached the approved QA Inbox; actual links, temporary-password update, old-password rejection, new-password browser login and recovery-link reuse rejection passed on 20 November. The QA account was deactivated afterward and its saved session received 403 without workspace data.
- [x] Complete a hosted staging audit, verify the 10 MiB file and PDF, and deny the same report and file to a second customer and unassigned operator.
- [ ] Test Stripe sandbox checkout, signed webhook retries, cancellation, portal invoices and failed payments if billing is enabled.
- [ ] Approve commercial plans/prices, tax/invoice settings and support/refund handling before enabling live billing.
- [ ] Review scenario templates and customer execution permissions; approve actual fieldwork scope.
- [x] Deploy on `https://ecarteo.fr`, verify root/www HTTPS and production client access, and confirm database/schema/private Storage readiness.
- [x] Fix and verify PDF score spacing, version/page numbering and client Reports guidance in French/English on the live production release. Temporary QA records were removed after acceptance.
- [x] Verify final-origin three-role login/workspace/private-cache behavior, anonymous HTTP 401 and non-admin team HTTP 403 after the 20 November launch release. All 12 recorded post-deployment checks passed at 09:43:51 UTC.
- [x] Complete final-origin upload/abuse-control acceptance: all 11 production checks passed at 15:12:24 UTC, including exact 10 MiB checksum, file/body/type boundaries, private access, CSRF, auth throttling and pending-upload cap. Temporary files/mission removed, integrity guards retained. One clearly labelled approved QA reference remains. [Evidence](HOSTED-ACCEPTANCE-2026-11-20.md)
- [x] Connect source control/CI and record the deployed commit, migrations, Render deployment ID and previous working release.
- [x] Configure GitHub readiness/cleanup failure alerts to `admin-dev@ecarteo.fr` and run the live test. [Run 44713006657](https://github.com/adminecarteo/ecarteo/actions/runs/44713006657) passed checks and notification; SMTP accepted the test at 09:42:54 UTC.
- [x] Confirm that test alert reached the responder inbox. On 20 November, the owner supplied the received bilingual message and its exact workflow link for run `44713006657`, confirming delivery to the designated responder. Continuous error monitoring and off-site backup alerts still require their own configured observer/host.
- [x] Publish six-hour readiness/public-entry sampling while preserving daily-only cleanup. [Live preview 44763079398](https://github.com/adminecarteo/ecarteo/actions/runs/44763079398) passed at 15:25:19 UTC on `c0a95f1`, with all three public pages available and zero eligible/removed uploads. This is periodic sampling, not continuous event/email monitoring.
- [x] Schedule daily expired-upload cleanup and verify its production preview from GitHub.
- [x] Verify actual scheduled monitoring executions. All 11 scheduled runs from 20 November through 23 November passed; the latest [run 45119382613](https://github.com/adminecarteo/ecarteo/actions/runs/45119382613) checked readiness/public pages and found zero eligible uploads for daily cleanup. Starts can be delayed by GitHub; this remains sampled monitoring.
- [x] Run the production storage-orphan preview on 23 November: zero eligible unreferenced objects, zero removals. Continue periodic orphan review and responder-delivery checks as an ongoing operation.
- [x] Refresh and verify the encrypted production backup locally. The latest 23 November snapshot at 10:00:10.202 UTC includes the inactive final QA profile; decrypt, ciphertext/manifest checksums, database catalog/full-stream decoding and freshness verification passed. The archive is 502,072 bytes with zero evidence objects; plaintext verification stayed in memory and all four prior archives were preserved. This is a local copy.
- [ ] Configure an approved encrypted off-site database+file backup destination and verify retrieval, retention and backup-age alerts.
- [x] Restore a database, accounts, report and evidence into an isolated Supabase stack and verify actual sign-in, file bytes and tenant isolation.
- [ ] Retrieve a production backup from the approved off-site destination and measure recovery time against Intertrad’s targets.
- [x] Verify Intertrad identity/address against the official French registry and prepare French/English publisher, privacy and service-use pages with `admin-dev@ecarteo.fr` as support/privacy contact under the owner's delegated defaults. Source facts and manual privacy operations are recorded in [LEGAL-CONTENT-REVIEW.md](LEGAL-CONTENT-REVIEW.md).
- [x] Deploy and verify the public legal routes and signup/footer links. All 12 live FR/EN route/width combinations passed at 1280/320 px, without empty navigation landmarks, horizontal overflow or captured console warnings/errors. Company-specific contracting, fieldwork permissions, retention/holds and provider arrangements still require appropriate operational and legal review; no compliance certification or unverified commercial terms have been invented.
- [x] Verify client Reports at desktop and 390 × 844 mobile widths after the 20 November fixes.
- [x] Complete a bounded warm production smoke check: 19 of 19 GETs passed at up to five concurrent requests, p95 1,599 ms; keyboard, validation and reflow checks passed at 320/390 px. This is not a capacity SLA or a physical-device certification.
- [x] Run bounded mixed-read load checks against the owner's 10–25 concurrency target: 41/41 responses passed, including warmup/identity verification. At 10 concurrent requests p95 was 1,659 ms; at 25 it was 4,110 ms. The latter exceeds the earlier provisional 3-second guide. This is not sustained 25-user capacity, cold-start, upload or PDF-load certification.
- [x] Complete a bounded repeated staging mixed workload: 224/224 expected responses over approximately 90 seconds, using three QA identities and up to 25 virtual workers. Request/draft writes and two small upload/delete cycles passed during concurrent reads; this run's temporary records/objects were removed. The 25-worker p95 was 4,569 ms; this is not 25 distinct users or a long capacity soak. [Scope and evidence](LAUNCH-STATUS-2026-11-23.md).
- [ ] Complete actual iPhone/Android acceptance and any longer representative capacity testing against agreed latency/recovery targets. Browser viewport emulation does not satisfy physical-device acceptance.
- [x] Update handover, launch status and this checklist with the verified launch release, previous PDF-fix history and precise remaining acceptance scope.
- [ ] Record launch decision, unresolved limitations and escalation owner.

## Scope boundaries to communicate

Écartéo operates one central audit service with customer tenants. Quality staff manage the service; this is not a multi-agency platform. Invitation links are manually shared by quality staff. Payments require your Stripe account/catalog; no invented pricing or charges occur automatically. Confirmation/recovery mail requires real SMTP. French/English/Chinese reports use PDF download; Arabic uses the locally bundled-font browser print/save-as-PDF path described in [PDF-LANGUAGES.md](PDF-LANGUAGES.md). Review actual customer text before offering additional writing systems. Immutable report corrections use dated supplements; destructive erasure requires an approved, tenant-specific retention process. A local database restore validates the tooling, not hosted provider recovery.
