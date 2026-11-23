# Launch follow-up — 23 November 2026

Live application: **https://ecarteo.fr**. The free-resource constraint remains in force. This follow-up records new evidence after [20 November acceptance](LAUNCH-STATUS-2026-11-20.md); it does not turn resource dependencies or owner decisions into completed checks.

## Completed operational work

- **Scheduled monitoring:** all 11 scheduled six-hour runs from 20 November through 23 November succeeded. [Latest scheduled run 45119382613](https://github.com/adminecarteo/ecarteo/actions/runs/45119382613) checked protected readiness and all three public entry pages; daily cleanup found zero eligible uploads and removed zero objects. GitHub delayed some starts relative to cron, so this is periodic sampling rather than continuous availability monitoring.
- **Workflow maintenance:** commit `dd041f44dba793935604e57d0fa5f1010d06c25f` upgrades the affected checkout, setup-node and upload-artifact actions to their Node 24 versions. Application Node 22, permissions, credential settings, npm cache and artifact retention remain as configured. [Full quality gates 45152543834](https://github.com/adminecarteo/ecarteo/actions/runs/45152543834) passed, including both browser suites and both Docker images. [Monitor preview 45152582771](https://github.com/adminecarteo/ecarteo/actions/runs/45152582771) passed with cleanup disabled and no notification email.
- **Live service:** Render still reports application `9008544` live as deployment `dep-dc05ccflk1mc73cduup0`. Current certificate-validating HTTPS checks of health, landing, login and signup returned 200. These workflow/configuration changes do not require a new application image.
- **Production backup:** a fresh encrypted local snapshot at **10:00:10.202 UTC / 11:00:10.202 Paris** passed ciphertext hash, decryption, database catalog/full-stream, manifest and freshness checks. It is 502,072 bytes, contains zero evidence objects and includes the inactive previous QA profile. All four prior archives were preserved, plaintext verification stayed in memory and export scratch was removed. This is a local backup, not an off-site copy.
- **Storage reconciliation:** the read-only preview found zero eligible unreferenced objects older than seven days; no deletion occurred. Periodic orphan and responder-delivery review remains an ongoing operational duty.

## Repeated staging workload

The hosted staging run completed at **10:07:37 UTC / 11:07:37 Paris**. It used three existing QA role identities and up to 25 virtual workers, with an eight-second per-worker think time and hard limits of 300 HTTP requests and three minutes. No accounts, emails or production records were created by this workload.

| Phase              | Duration       | Requests | p50      | p95      | Maximum  |
| ------------------ | -------------- | -------- | -------- | -------- | -------- |
| 10 virtual workers | 29.391 seconds | 40       | 823 ms   | 2,781 ms | 2,915 ms |
| 25 virtual workers | 60.744 seconds | 174      | 1,143 ms | 4,569 ms | 6,396 ms |

Including setup and sign-out, **224/224 responses matched expectations**, with no 429, 5xx or timeout in the completed run. The initial administrator login took **14,181 ms**, outside the phase measurements above; its cause was not established, so this is not a measured cold-start guarantee. Concurrent reads included workspace, report payload, session and audit requests. Mutations exercised one isolated request create/cancel, full draft save/update and two 128 KiB upload/delete cycles. Exactly this run's request, draft, temporary mission and staged objects were removed afterward; ordinary command receipts were preserved. An earlier attempt stopped on database DNS/connectivity before any HTTP workload or fixture mutation; a read-only retry succeeded before the completed run.

This closes the bounded repeated mixed-workload check. It does not certify 25 distinct active accounts, a long soak, cold starts, large upload bursts or complete audit publication under load. PDF rendering happens in the browser; this test read published report payloads, not browser PDF generation. No latency SLA is approved; the 25-worker p95 exceeds the earlier provisional three-second guide.

## Staging email configuration

The owner saved the staging SMTP credential privately. Custom SMTP remained enabled after reload for project `ikfxhhcxcmrgfuwxpjpr`, using `send.one.com:587`, sender `admin-dev@ecarteo.fr` and display name `Écartéo staging`. A real signup message reached the approved QA Inbox. The repository's French/English confirmation and recovery templates were then published with `[Staging]` subjects; both complete sources and subjects matched after reloading the dashboard. Production SMTP was not changed.

Actual redesigned recovery mail reached the approved QA Inbox at **10:19:23 UTC / 11:19:23 Paris**. Its received token-hash link opened the reset flow for the exact client identity. Password update, new-password login, old-password rejection and recovery-link replay rejection passed. Browser login using that new password reached the expected QA organization; mobile menu → Reports → French/English switching and sign-out passed at 390 × 844, with no horizontal overflow, framework error or captured application warnings/errors. This was a browser viewport check, not a physical phone.

A separate fresh designed signup message arrived in Inbox at **10:23:46 UTC / 11:23:46 Paris**, with the `[Staging]` bilingual subject and all three correct staging-origin token-hash links. Earlier messages used the prior default design while the provider cache was live. This is consistent with the running Auth v2.198.0 [preserving its template cache across configuration reloads](https://github.com/supabase/auth/blob/v2.198.0/cmd/serve_cmd.go#L121); [unexpired cached subject/body pairs are reused](https://github.com/supabase/auth/blob/v2.198.0/internal/mailer/templatemailer/template.go#L283). No restart or production setting change was needed.

The actual redesigned confirmation link opened the exact second QA client's workspace at **10:24:17 UTC**. Both synthetic accounts were subsequently deactivated through normal team administration, with their existing sessions and workspace requests returning 403; final cleanup completed at **10:24:28 UTC / 11:24:28 Paris**. Temporary passwords, cookies and used auth links were removed. Inactive QA identities and normal audit history were preserved.

SPF, primary `rsa1` DKIM and DMARC passed for both designed messages; the separate `ed1` signature remained neutral/no-key. This closes actual staging mail delivery, not a claim that every provider signing configuration has been repaired. Only synthetic QA credentials were changed; the browser signed out and its temporary viewport/tab were cleaned up. Five approved test messages were sent to the designated QA inbox, including the bounded retries used to diagnose caching.

## Remaining owner dependencies

1. Create `operator@ecarteo.fr` within an unused mailbox included in the existing one.com plan, then verify independent password recovery. Its application login already works. No mailbox purchase is authorized.
2. Supply an approved off-site backup destination, trusted scheduler and separate recovery-key custody. Retrieval/restore, recurring transfer and independent backup-age alert acceptance require those resources. No destination is currently available.
3. Complete actual iPhone/Safari and Android/Chrome acceptance. Agree performance/recovery targets before any longer representative capacity test or customer commitment.
4. Record the launch mode, operational responder and accepted limitations; approve each real customer's execution scope, contracting and retention decisions.

Use [owner instructions](LAUNCH-OWNER-ACTIONS.md) and [backup activation](BACKUP-ACTIVATION.md). Online payments remain conditional on choosing and configuring billing; the quote-based workflow is available.

Sanitized monitor/backup/storage/browser receipts are retained locally under `ecarteo-launch-20261123`; the workload harness and receipt are under `ecarteo-sustained-staging-20261123`. Actual mail acceptance and receipts are under `ecarteo-staging-mail-20261123` and `ecarteo-staging-mail-design-20261123`. Credentials, mail links and encrypted archives are not committed.
