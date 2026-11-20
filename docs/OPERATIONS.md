# Operations and recovery

Scripts run from the repository root with Node 22+. Use a restricted maintenance identity, keep archives and keys out of version control, and send sanitized job results to your monitoring system.

## Monitoring

- `/api/health` is public process liveness.
- `/api/ready` requires the exact `Authorization: Bearer` monitoring token (`OPS_HEALTH_TOKEN`, at least 32 random characters). Unauthorized probes receive 404. Authorized responses contain only database/schema/private-storage check booleans and return 503 on failure. It checks the evidence bucket is private and has the expected file limit.
- `src/instrumentation.ts` logs unhandled request errors as JSON using framework route templates; it excludes error messages, request URLs/query strings, headers, cookies and bodies. Handled unexpected API errors use the same restricted event format.
- The daily GitHub maintenance workflow can notify `admin-dev@ecarteo.fr` when readiness or cleanup fails, once its separate SMTP settings and delivery test are complete. See [notification configuration and delivery acceptance](MAINTENANCE.md#failure-notifications). Successful normal runs send nothing.
- The private-host units below provide backup failure and archive-age alerts. Elevated 5xx/auth throttling, restore failures, transactional email failures and any enabled Stripe webhook failures still need host/provider monitoring; a daily readiness sample does not cover these continuously. Choose an owner-approved monitor and test the relevant failure path before relying on it.
- Do not enable raw reverse-proxy query logging: confirmation URLs contain single-use tokens. The supplied Caddy runtime logger filters request objects and response headers, and access logging is disabled. See [Caddy log filtering](https://caddyserver.com/docs/caddyfile/directives/log#filter). Never ship evidence, request payloads, passwords or service keys to log aggregation.

## Render production readiness and staged uploads

The [Production maintenance workflow](../.github/workflows/production-maintenance.yml) runs on the GitHub default branch `main` at 04:37 UTC daily. Set the repository variable `PRODUCTION_APP_ORIGIN` to the reviewed HTTPS production origin. Set separate repository secrets `PRODUCTION_HEALTH_TOKEN` and `PRODUCTION_CLEANUP_TOKEN` to match Render's `OPS_HEALTH_TOKEN` and `OPS_CLEANUP_TOKEN`. Use distinct tokens of at least 32 random characters. The workflow calls the production browser origin and receives only check statuses and counts.

From GitHub Actions, run **Production maintenance** with **apply** unchecked for a preview. It checks readiness and calls the protected `GET /api/maintenance/staged-uploads`. Scheduled runs, or manual runs with **apply** checked, use the protected POST route to remove up to 100 eligible uploads. A remaining backlog fails the job so an operator can review and rerun it. The separate encrypted backup job below needs a private destination and a trusted host.

## VPS or private maintenance host

Dry run first:

```sh
node --env-file=.env.production scripts/cleanup-staged-uploads.mjs
```

Apply after reviewing the count:

```sh
node --env-file=.env.production scripts/cleanup-staged-uploads.mjs --apply
```

The script selects unlinked staging rows older than 24 hours, locks each batch, removes through the Storage API, and retains reservations if removal fails. Maximum 100 per batch; repeat full batches. It never selects published evidence.

For a self-hosted Docker deployment, build the maintenance target and use `deploy/ecarteo-cleanup.service` with `deploy/ecarteo-cleanup.timer`. Adjust the installation directory and Docker executable, install the units, then enable the hourly timer. Add your alerting system as an `OnFailure` handler. Choose one cleanup scheduler per environment.

## Storage orphans: review during maintenance

An interrupted upload can leave bytes with no staging or evidence row. The separate reconciler considers only exact `<client UUID>/<mission UUID>/<file UUID>` paths in `ecarteo-evidence` that are at least seven days old and have no matching metadata. It processes at most 100 objects. Dry run:

```sh
node --env-file=.env.production scripts/reconcile-storage.mjs
```

Before applying, stop application writes, verify you targeted the correct project, and take backups. Set `ECARTEO_MAINTENANCE_CONFIRMED=yes` **only for the maintenance process**, then run with `--apply`. A tenant lock and final metadata recheck prevent deleting an attached object; Storage deletion occurs through the API, never SQL deletion from `storage.objects`. Resume the application and unset the maintenance confirmation afterwards. Do not schedule the apply mode against a live writable system.

## Coordinated database and evidence backups

Supabase database backups do not contain Storage object bytes. Configure the provider's database recovery offering and a separate encrypted, access-controlled file backup destination; test both. [Supabase database backup documentation](https://supabase.com/docs/guides/platform/backups).

### Daily encrypted backup, with the application online

`scripts/scheduled-backup.mjs` exports one PostgreSQL snapshot for the logical database archive and the evidence-object inventory. It downloads the immutable evidence, checks its stored hashes and verifies the manifest, then encrypts the pair with age. It publishes a timestamped `.tar.age` after reading back a matching SHA-256 from the destination, followed by an atomic `.tar.age.receipt.json` containing the snapshot time, archive name, byte count and ciphertext checksum. If a referenced object is missing or changes during the export, the job fails and can be rerun. Use a direct or **session** database connection and a database role permitted to dump all required schemas.

1. On an offline recovery device, run `age-keygen -o ecarteo-recovery.txt`, then `age-keygen -y ecarteo-recovery.txt`. Give the backup host only the public recipient beginning with `age1`. Keep the identity file on encrypted offline media with a second controlled recovery copy in another location. Test both copies. Retain old identities until the last archive encrypted to each has expired.
2. On a trusted maintenance host, install Node 22+, Python 3 for notifications, the repository's production dependencies, `age`, `tar`, and `pg_dump`/`pg_restore` compatible with the database server. Mount an owner-approved private off-site destination at `/mnt/ecarteo-backups`. Give the maintenance account write access and create a file named `.ecarteo-backup-destination` on that mount containing the single line `ecarteo-archive-v1`. Configure access control, versioning or retention on the destination. Use an encrypted local scratch volume with room for the database dump, evidence and encrypted archive. Normal completion removes scratch files. After a power loss, remove any leftover private scratch directory once the job is stopped.
3. Create a mode-0600 environment file at `/etc/ecarteo/backup.env` with `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `ECARTEO_BACKUP_AGE_RECIPIENT`. Set `SUPABASE_DB_CA_CERT` if required. Optionally set `PG_DUMP_BINARY` and `PG_RESTORE_BINARY` to the correct full paths. The job does not require a maintenance-window flag.
4. Create two other mode-0600 files. `/etc/ecarteo/backup-check.env` contains `ECARTEO_BACKUP_MAX_AGE_HOURS=36`; change this threshold to the owner's agreed recovery objective. It does not need database credentials. `/etc/ecarteo/alerts.env` contains the six `ALERT_*` SMTP settings in [Maintenance](MAINTENANCE.md#failure-notifications), with the password kept private. The systemd alert service does not need `ALERT_RUN_URL`. Configure separate read access for the service account where needed; never make the files world-readable.
5. The supplied systemd units use the `ecarteo-backup` account, repository at `/opt/ecarteo`, Node at `/usr/bin/node`, Python at `/usr/bin/python3`, scratch at `/var/lib/ecarteo-backup` and the mount above. Adjust these for the approved host and install the following units together:

   - [Backup service](../deploy/ecarteo-backup.service) and [daily timer](../deploy/ecarteo-backup.timer).
   - [Archive age/checksum service](../deploy/ecarteo-backup-check.service) and [hourly timer](../deploy/ecarteo-backup-check.timer).
   - [SMTP failure notification service](../deploy/ecarteo-alert@.service).

   After confirming the host, destination, key custody, recipient and retention policy, run:

   ```sh
   sudo systemctl daemon-reload
   sudo systemctl start ecarteo-backup.service
   sudo journalctl -u ecarteo-backup.service -n 10
   sudo systemctl start ecarteo-backup-check.service
   sudo journalctl -u ecarteo-backup-check.service -n 10
   sudo systemctl start ecarteo-alert@alert_test.service
   ```

   The last command sends one labelled test email. Verify it reaches the approved inbox and complete a restore using an archive retrieved from the actual destination. Then enable the schedules:

   ```sh
   sudo systemctl enable --now ecarteo-backup.timer ecarteo-backup-check.timer
   systemctl list-timers ecarteo-backup.timer ecarteo-backup-check.timer
   ```

   The backup schedule defaults to 02:00 UTC daily. The same job works on a private scheduler with `ECARTEO_BACKUP_DESTINATION` and `ECARTEO_BACKUP_SCRATCH` set to absolute paths. The backup unit invokes `ecarteo-alert@backup_failed.service` on failure; the archive checker invokes `ecarteo-alert@backup_stale.service` on failure. The checker has a 15-minute deadline and the SMTP unit a two-minute deadline, so a stalled check or send fails instead of remaining active indefinitely. Tune the checker deadline against measured archive size and destination throughput. Retain the logged archive hash and snapshot time separately.

### Archive freshness checks and current activation limits

`scripts/check-backup-age.mjs` reads the newest timestamped archive and its receipt from `ECARTEO_BACKUP_DESTINATION`, verifies the destination marker and ciphertext SHA-256, and checks the receipt's original snapshot time against `ECARTEO_BACKUP_MAX_AGE_HOURS` (default 36). A newer incomplete archive fails the check even if an older archive is valid. Missing files, symlinks, invalid receipts, excessive age and future timestamps also fail. Updating a file's modification time cannot make an old snapshot pass.

The checker does not require a database connection or the recovery private key. It verifies stored ciphertext and age; it does not prove decryption or recoverability. Keep independent checksum records and continue the restore drills below. The scripts do not delete old archives: automated expiry needs the owner's retention and legal-hold policy first.

As of 20 November 2026, the scripts and unit templates are prepared and locally tested, but no approved off-site storage or trusted scheduler has been supplied. A local backup is available; no off-site recurring job or destination retrieval has been verified. Do not substitute another organization's cloud storage or GitHub artifacts. Select a destination within the existing free-only budget before activating any job.

An hourly checker on the backup host cannot notify when that entire host is offline. After a destination is approved, configure a separate observer to check the destination's latest successful snapshot or an equivalent heartbeat. The daily GitHub readiness check does not inspect backup archives. No independent backup heartbeat is configured yet.

### Manual backup during a maintenance window

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

On 16 November 2026, a drill used two separate loopback Supabase projects running PostgreSQL 17 with all seven application migrations. The encrypted archive captured one synthetic published mission, its evidence, and four Auth users at **13:10:37 UTC**. Its SHA-256 was `5ad140fa88dc94ed596466541bdadcb4cc82fb2758b648e3eaa54d61d1049dd5`. Decryption and database restoration into the empty second project succeeded. All four users could sign in. The restored report matched the original JSON, the 67-byte private evidence file matched its original SHA-256, and a second tenant could not download it. Repeating the Storage restore preserved the same bytes. A deliberately altered encrypted test archive failed authentication during decryption.

At **13:15:23 UTC** on the same day, a read-only snapshot of the production project produced a separate 491,832-byte encrypted archive on the owner's machine. The production evidence inventory was empty at that recovery point. Decryption, both internal checksums and full database data-stream decoding passed. The archive and its verification receipt are in the ignored `backups/production/` directory. Transfer the owner-only recovery identity to offline custody and verify retrieval from the approved off-site destination before activating the recurring job. A full hosted recovery drill requires a separate replacement project.

On **20 November 2026 at 09:43:13.154 UTC (10:43:13.154 Paris)**, the final production snapshot was encrypted into the same owner-local destination, including the permanent operator and QA-account deactivation. Ciphertext checksum verification, decryption, database-catalog and manifest hash verification passed; the evidence inventory contained zero objects and plaintext verification remained in memory. This supersedes the earlier 09:14:59 UTC snapshot for this launch acceptance. The sanitized acceptance records are held privately on the setup machine in `/private/tmp/ecarteo-launch-20261120/`. The owner confirmed that VPS access is unavailable. This result verifies the local archive, not an off-site copy, recurring remote schedule or new full hosted restore drill.

To repeat the decryption, retrieve one trusted archive and the digest recorded by your backup job. Check that digest with `sha256sum archive.tar.age`, then use a fresh mode-0700 directory on encrypted storage:

```sh
umask 077
age --decrypt --identity /offline/ecarteo-recovery.txt --output verified.tar archive.tar.age
tar -tf verified.tar
tar -xf verified.tar
sha256sum --check SHA256SUMS
node /opt/ecarteo/scripts/storage-backup.mjs verify --directory "$PWD/evidence"
```

The expected archive entries are `database/`, `evidence/`, `SHA256SUMS` and `snapshot.json`. On macOS, use `shasum -a 256` and `shasum -a 256 -c SHA256SUMS`. Recreate the empty target using the snapshot's application migrations so tables, grants, RLS policies and the private bucket exist before loading data.

For the **isolated self-hosted Supabase drill**, the following imported application and Auth rows while retaining the target's managed schema versions. Set libpq's connection settings to the empty **target**, verify its identity, check that the application tables and `auth.users` are empty, and use a database administrator permitted to disable constraint triggers for this restore. The command restores in one transaction. The local `supabase_admin` account had this privilege. The managed hosted project's database account may have different privileges.

```sh
pg_restore --list database/database.dump > archive.list
awk '/ (TABLE DATA|SEQUENCE SET) (public|app_private|auth) / && !/ TABLE DATA auth schema_migrations /' archive.list > app-data.list
# Review app-data.list against the schemas and Auth features used in the source.
pg_restore --dbname="$PGDATABASE" --data-only --disable-triggers --single-transaction \
  --no-owner --no-privileges --use-list=app-data.list database/database.dump
```

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
