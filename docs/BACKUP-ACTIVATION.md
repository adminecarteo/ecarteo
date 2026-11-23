# Activate an off-site backup

No off-site destination is configured. The owner confirmed that no approved storage or server is available and that VPS access is unavailable. The reviewed production environment files contain no off-site destination or transfer configuration. The existing age recovery identity and encrypted production archives are local to the owner's setup machine; this does not establish separate-site storage or key custody.

The latest accepted local snapshot is **23 November 2026, 10:00:10.202 UTC (11:00:10.202 Paris)**. Its encrypted archive is **502,072 bytes** and contains the database and an evidence inventory of **zero objects**. The temporary email-design QA client's inactive profile was verified inside the snapshot. Encrypted checksum, decryption, database catalog/data-stream decoding, database/evidence manifest hashes and the 36-hour freshness check passed. Verification kept decrypted bytes in memory; the existing backup tool used and removed its private temporary scratch directory. All four prior archives were preserved. Earlier restore evidence and detailed commands are in [Operations and recovery](OPERATIONS.md). No archive was uploaded to a new service and no retention deletion was enabled.

## Information the owner must supply

| Decision    | Information needed                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Destination | An Intertrad-controlled private destination, its region and approved account. Reuse an existing free allocation or owner-controlled device; do not create a chargeable subscription.                                  |
| Access      | A named storage administrator and a restricted transfer method. Enter credentials through the destination's secure setup or a private Terminal prompt, never chat or a tracked file.                                  |
| Scheduler   | A trusted machine that can reach the database and destination at the scheduled time. The existing VPS is unavailable; the setup Mac is not an unattended runner unless the owner explicitly arranges that.            |
| Capacity    | Free space sufficient for the database, evidence growth, scratch export and approved number of retained archives. Record what happens at the free quota and prevent paid overages.                                    |
| Recovery    | Named responder, maximum tolerable data loss and target recovery time. These are owner decisions; the script does not certify either target.                                                                          |
| Key custody | Two controlled offline copies of the age recovery identity, kept separately from the backup destination, plus named custodians and a successful retrieval test. The scheduler receives only the public age recipient. |
| Retention   | An approved expiry and legal-hold policy for archives containing personal and audit data. No automatic deletion begins before this decision.                                                                          |

If no suitable existing destination is available within the free-only constraint, keep the limitation explicit and continue owner-run local encrypted backups. A separate encrypted drive stored at another approved location can be considered only if the owner supplies and controls it; its transfer schedule and human dependency must be recorded. Another organization's connected storage, GitHub artifacts, Render's ephemeral filesystem and another bucket in the same production project are not automatically approved substitutes.

## Proposed policy for owner review

Start with a daily 02:00 UTC encrypted snapshot and a 36-hour overdue threshold. The snapshot frequency targets at most one day of data loss when jobs succeed; an overdue alert does not guarantee that recovery point. Keep **14 daily, 4 weekly and 3 monthly recovery points**, subject to available capacity, approved data-retention rules and legal holds. These values are a proposal, not an activated deletion policy or a promised recovery SLA. Reduce the policy only after an explicit owner decision about the resulting recovery coverage.

Retain a timestamp, archive name, size, encrypted SHA-256 and deletion/hold decision in a restricted inventory. Record a checksum outside the destination as well; a receipt stored beside an archive is not an independent authenticity anchor. Preserve each recovery key until its last required archive has expired. Test a restore monthly and after a material schema, storage or encryption change. Measure recovery time in that drill before setting a customer-facing commitment.

## Activation and acceptance

1. Record the approved destination, region, account, quota, scheduler, recovery objectives, retention decision and key custodians. Configure access without printing or committing secrets.
2. Mount or connect the destination using the reviewed private transfer method. For the supplied filesystem-based job, create its `.ecarteo-backup-destination` marker on the real mount, not an unmounted local fallback. Check restrictions with the maintenance account. Install the service templates only on the approved trusted host.
3. Run one encrypted snapshot and verify the destination's read-back checksum and receipt. The private recovery identity must not be placed on the backup scheduler or in GitHub Actions.
4. Retrieve that exact archive from the off-site destination to a separate recovery location. Compare the independently recorded ciphertext hash, decrypt, verify the database/evidence manifests, and restore into an isolated replacement. Do not overwrite production.
5. Verify restored client/operator/admin separation, report and PDF content, row counts, private evidence bytes and sign-in behavior. Disable outgoing mail and payments during the drill unless those external actions are deliberately authorized. Record measured recovery point and recovery time.
6. Enable the daily job and hourly age/checksum check, then verify the approved recipient receives one labelled failure-alert test. Add an independent observer for the last successful destination snapshot: the backup host cannot report its own total outage. This observer still needs the chosen destination and scoped access; it is not currently configured.
7. Record the first successful scheduled run, recovery acceptance, notification receipt and next drill date. Only then mark off-site backups active. Implement expiry only after the proposed retention has been approved; apply holds before deleting an archive.

Use the exact environment names, systemd units, secure file permissions and restore procedure in [Operations and recovery](OPERATIONS.md#coordinated-database-and-evidence-backups). Keep storage identity and custody evidence in the restricted operations record rather than the public application.
