# Operations and recovery

Scripts run from the repository root with Node 22+. Use a restricted maintenance identity/environment, keep backups outside the repository, and send sanitized stdout/stderr and exit status to your monitoring system. No maintenance task is automatically installed on your computer or hosted service.

## Monitoring

- `/api/health` is public process liveness.
- `/api/ready` requires the exact `Authorization: Bearer` monitoring token (`OPS_HEALTH_TOKEN`, at least 32 random characters). Unauthorized probes receive 404. Authorized responses contain only database/schema/private-storage check booleans and return 503 on failure. It checks the evidence bucket is private and has the expected file limit.
- `src/instrumentation.ts` logs unhandled request errors as JSON using framework route templates; it excludes error messages, request URLs/query strings, headers, cookies and bodies. Handled unexpected API errors use the same restricted event format.
- Alert on readiness failures, elevated 5xx/auth throttling, failed cleanup jobs, backup age, restore failures, email failures and Stripe webhook failures. Use your host's log collector/monitor, choose recipients and test an alert in staging.
- Do not enable raw reverse-proxy query logging: confirmation URLs contain single-use tokens. The supplied Caddy runtime logger filters request objects and response headers, and access logging is disabled. See [Caddy log filtering](https://caddyserver.com/docs/caddyfile/directives/log#filter). Never ship evidence, request payloads, passwords or service keys to log aggregation.

## Expired staged uploads: hourly

Dry run first:

```sh
node --env-file=.env.production scripts/cleanup-staged-uploads.mjs
```

Apply after reviewing the count:

```sh
node --env-file=.env.production scripts/cleanup-staged-uploads.mjs --apply
```

The script selects unlinked staging rows older than 24 hours, locks each batch, removes through the Storage API, and retains reservations if removal fails. Maximum 100 per batch; repeat full batches. It never selects published evidence.

For the container deployment, build the maintenance target and use `deploy/ecarteo-cleanup.service` with `deploy/ecarteo-cleanup.timer`. Adjust the installation directory and Docker executable for your host, copy the reviewed units into systemd, then enable the timer. Add your alerting system as an `OnFailure` handler. An equivalent private host scheduler may run the command hourly. These are host jobs, not a publicly callable cleanup API.

## Storage orphans: review during maintenance

An interrupted upload can leave bytes with no staging or evidence row. The separate reconciler considers only exact `<client UUID>/<mission UUID>/<file UUID>` paths in `ecarteo-evidence` that are at least seven days old and have no matching metadata. It processes at most 100 objects. Dry run:

```sh
node --env-file=.env.production scripts/reconcile-storage.mjs
```

Before applying, stop application writes, verify you targeted the correct project, and take backups. Set `ECARTEO_MAINTENANCE_CONFIRMED=yes` **only for the maintenance process**, then run with `--apply`. A tenant lock and final metadata recheck prevent deleting an attached object; Storage deletion occurs through the API, never SQL deletion from `storage.objects`. Resume the application and unset the maintenance confirmation afterwards. Do not schedule the apply mode against a live writable system.

## Coordinated database and evidence backups

Supabase database backups do not contain Storage object bytes. Configure the provider's database recovery offering and a separate encrypted, access-controlled file backup destination; test both. [Supabase database backup documentation](https://supabase.com/docs/guides/platform/backups).

The included utilities create an additional logical database archive and an exact evidence-bucket copy. They do not configure encryption, off-site storage, retention or provider backups for you.

1. Stop application writes and maintenance cleanup for a consistent pair of snapshots. Record the release/migrations and start time.
2. Set `ECARTEO_MAINTENANCE_CONFIRMED=yes` in the maintenance process. Use a direct or session PostgreSQL URI and a `pg_dump`/`pg_restore` version compatible with the server. Set `SUPABASE_DB_CA_CERT` if required; TLS verification remains enabled.
3. Use new directories beneath an existing restricted backup parent:

   ```sh
   node --env-file=.env.production scripts/backup-database.mjs --directory /secure-backups/release/database
   node --env-file=.env.production scripts/storage-backup.mjs export --directory /secure-backups/release/evidence
   node scripts/storage-backup.mjs verify --directory /secure-backups/release/evidence
   ```

4. Confirm `database/complete.json` and `evidence/manifest.json` exist. Partial failures do not write a successful manifest. Existing backup directories are never overwritten. Storage export verifies known evidence hashes; the offline verifier rechecks every length/path/hash and rejects unsafe manifests.
5. Encrypt/archive the backup pair, move it to your approved off-site destination, verify retrieval, and apply your approved retention policy. Local 0700 directories/0600 files restrict access but are not encryption.
6. Resume writes and cleanup. The custom database archive includes database metadata/auth data accessible to the maintenance user but not cluster roles, SMTP secrets, DNS or object bytes. Keep infrastructure/secrets recovery instructions separately. A raw managed-schema archive is not automatically interchangeable with a provider project restore.

## Restore drill

Use an isolated replacement staging project/database, never a live target. Follow the provider's [database restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for managed roles, Auth and Storage schema compatibility. A local vanilla PostgreSQL archive was exercised with `pg_restore --no-owner --no-privileges --exit-on-error`; that is not evidence of a managed Supabase restore.

On 9 November 2026, the actual local Supabase stack also passed authenticated readiness, an existing evidence-object export/checksum check, and restoration of a new scratch object through the real Storage API. A repeated restore preserved identical bytes; the scratch object was removed afterwards. This verifies local provider behavior, not hosted disaster recovery or off-site backup configuration.

This utility excludes `storage.objects` data from the database archive. Storage upload restores those rows together with their bytes, avoiding dangling metadata that would conflict with create-only upload. The file manifest records each original object path and MIME type. The supplement covers the dedicated evidence bucket; use provider recovery for any other buckets/services.

After restoring application/Auth data and the private evidence bucket configuration into the isolated project, verify the target evidence bucket is empty or contains matching complete objects. A database-only restore with dangling Storage object rows must be resolved using the provider's documented recovery process before file restoration; do not SQL-delete provider object metadata.

1. Point a separate ignored maintenance environment at the replacement project.
2. Run offline checksum verification above.
3. Dry run the file restore: `node --env-file=.env.restore.local scripts/storage-backup.mjs restore --directory /secure-backups/release/evidence`.
4. With target writes stopped, set `ECARTEO_MAINTENANCE_CONFIRMED=yes` and add `--apply --target-host YOUR_RESTORE_PROJECT.supabase.co`. The host must exactly match the configured Supabase URL. Existing objects are skipped only when their hash matches; differing bytes are never overwritten. Uploaded objects are downloaded again and checked.
5. Verify row counts, report/addendum visibility, real Auth confirmation/recovery, operator and customer separation, original-file download byte equality, PDF export, and billing identity reconciliation. Disable outgoing mail/payment jobs in the drill unless testing them deliberately.
6. Record recovery point/time, missing data and operator sign-off. Only switch a real domain after resolving failures and deciding how to recover writes made after the snapshot.

## Privacy requests, controlled exports and report corrections

Approve a retention policy and verify the requester independently before opening a case. Store identity proof and legal/business decisions in your restricted ticket system; use ticket references in the application journal rather than putting sensitive explanations into CLI arguments.

Open a case (dry run by default; add `--apply` to record it):

```sh
node --env-file=.env.production scripts/privacy-operations.mjs open --client CLIENT_UUID --kind access --reference REQUEST_TICKET --operator-reference ADMIN_TICKET
```

Kinds are `access`, `correction` and `erasure`. The apply result returns a case UUID. Inventory and internal export:

```sh
node --env-file=.env.production scripts/privacy-operations.mjs plan --case CASE_UUID --operator-reference ADMIN_TICKET
node --env-file=.env.production scripts/privacy-operations.mjs export --case CASE_UUID --operator-reference ADMIN_TICKET --directory /secure-reviews/new-case --apply
```

The export is tenant-scoped operational data for internal review. It includes internal scripts and observations; **review/redact it before disclosure**. It excludes Auth credentials and provider payment secrets. Evidence bytes must be retrieved through the controlled backup/download process if required. Exports and resolutions are recorded in an append-only operations journal; ordinary app roles cannot access privacy cases.

For a correction to a published report, open a correction case, prepare approved client-visible text in a UTF-8 file, then dry run:

```sh
node --env-file=.env.production scripts/privacy-operations.mjs addendum --case CASE_UUID --mission MISSION_UUID --text-file /secure-reviews/approved-correction.txt --operator-reference APPROVAL_TICKET
```

Add `--apply` after reviewing the text and tenant. The command permits only a published report in that case's tenant, creates an immutable dated supplement, and records its administrative reference. Repeating the same case/mission/text is idempotent; changing it requires a new case. The report screen and fresh PDF/text exports include the supplements. Previously downloaded documents cannot be recalled automatically.

Close a case with a documented resolution:

```sh
node --env-file=.env.production scripts/privacy-operations.mjs close --case CASE_UUID --status completed --resolution-reference RESOLUTION_TICKET --operator-reference ADMIN_TICKET --apply
```

Use `declined` only with the decision recorded in the referenced ticket. Case closure records an administrative outcome; it does not itself erase data or certify compliance. Erasure of immutable audit records requires a reviewed, tenant-specific migration/process based on the approved retention/hold rules, covering live data, files and backup expiry. No generic purge or trigger-disable endpoint is supplied; it would bypass the product's evidence integrity contract without a defined policy. Access can be revoked through account administration while a request is assessed.

## Incident and rollback procedure

1. Triage via sanitized event type, time and release. Disable affected accounts or stop writes if needed; preserve relevant evidence and backups.
2. Rotate compromised service/monitoring credentials in the provider and host, then restart. Public key changes require a rebuild. A database-owner credential requires provider-level rotation.
3. Roll back to a known application image only if the database remains compatible. Do not reset a live database to fix an application release.
4. For data recovery, restore to an isolated replacement and complete the drill before switching traffic. Document any unrecoverable interval and customer communication through the approved support channel.
