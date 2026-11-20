# Remaining owner actions

Prepared 20 November 2026 for the approved free-resource constraint. The live app is https://ecarteo.fr. This is a concrete handover, not a declaration that external dependencies or business approvals are complete.

## Operator mailbox

The owner confirmed that `operator@ecarteo.fr` has not been created. Its Écartéo operator account already exists and login works; a mailbox is required for independent password recovery.

Send the following to the one.com manager:

> Please create `operator@ecarteo.fr` using an unused mailbox included in our existing ecarteo.fr plan. In the one.com Control Panel, select ecarteo.fr → Email & Microsoft 365 → New account → Basic Mail, then use `operator` as the email name. Do not buy an upgrade or paid add-on. Set its Webmail password privately and hand access to the designated operator through our password manager. Verify login at https://mail.one.com and receipt of a test message, then confirm that the mailbox is ready. Do not change `admin-dev@ecarteo.fr`, its password, or the production SMTP sender.

If no mailbox is included/available, report that constraint rather than purchasing one. The operator's mailbox password and Écartéo application password are separate. Once the mailbox works, request recovery through https://ecarteo.fr/forgot-password, verify delivery and complete the password change privately. [one.com account-creation guide](https://help.one.com/hc/en-us/articles/115005586289-Creating-a-new-email-account)

## Off-site recovery

The owner confirmed that no approved destination/server is available. The local encrypted backup and restore tooling are verified, but off-site protection cannot be activated without a destination. Supply the destination/service, region, existing free capacity, administrator and trusted scheduler. Share no credentials in chat. Review the proposed retention and recovery-key custody in [Backup activation](BACKUP-ACTIVATION.md), then complete remote retrieval and an isolated restore before marking this gate complete.

## Physical devices

On an actual iPhone/Safari and Android/Chrome, open https://ecarteo.fr over HTTPS. Use authorized test identities and synthetic data; use staging for a complete audit rather than creating a real customer report for a device check.

1. Sign in; confirm the expected role/organization and that the mobile menu opens, closes and navigates.
2. Switch French/English; rotate the phone and confirm form labels, buttons and errors remain readable without horizontal scrolling.
3. As client, open Audit requests and Reports. With a published staging report, open evidence and download/view its PDF.
4. As the assigned staging operator, select a small authorized test photo/file using the device picker, upload it and verify the file can be read by the intended roles.
5. Sign out and use Back/reload. Protected data must not become available without signing in again.

Record device model, OS/browser version, date and any failure. Responsive browser checks and short server bursts already passed; they do not certify device file pickers, mobile PDF handling, sustained 25-user traffic or cold-start latency.

## Business launch decision

All three current active non-QA customer organizations have a client administrator. For each new real customer, confirm its authorized administrator, mission scope/execution permission, quote/contract, personal-data instructions and retention/holds before fieldwork. Public legal pages are implemented; this does not approve customer-specific terms or establish a compliance certification. Stripe remains optional and disabled until its catalog, taxes, refund handling and sandbox lifecycle are approved and tested.

The owner must record the launch mode (internal testing, limited pilot or wider launch), accepted limitations, operational responder and review date. `admin-dev@ecarteo.fr` is the configured support/alert recipient; a mailbox address alone is not a staffed response commitment. No uptime, sustained-capacity, backup recovery-point or recovery-time SLA has been approved. The current 25-request mixed-read burst reached p95 4.110 seconds, so do not promise a 3-second response target from that result.
