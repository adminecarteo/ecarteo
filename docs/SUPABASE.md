# Supabase backend and data model

Production and staging each use a separate hosted Supabase project for Auth, PostgreSQL and private Storage. The application keeps role assignment and tenant access on the server. See the [production handover](PRODUCTION-HANDOVER.md) for actual project references, first administrator and remaining email/DNS activation.

Apply every migration in filename order:

1. `supabase/migrations/202611030001_initial_console.sql`
2. `supabase/migrations/202611030002_authenticated_workspace.sql`
3. `supabase/migrations/202611090003_accounts_requests.sql`
4. `supabase/migrations/202611090004_billing.sql`
5. `supabase/migrations/202611090005_operations.sql`
6. `supabase/migrations/202611090006_workspace_pagination.sql`
7. `supabase/migrations/202611160007_scoring_action_drafts.sql`

Use the deployment instructions in `docs/DEPLOYMENT.md` for project creation and environment setup. The server needs `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; authentication uses `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `APP_URL`. `SUPABASE_DB_CA_CERT` optionally provides the database CA certificate. Remote database TLS verifies certificates; verification is never disabled to bypass a connection problem. Missing configuration fails closed.

## Database mapping

| Domain              | Hosted persistence                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Clients             | `clients`, with `site_count`                                                                        |
| Authenticated actor | Verified Auth user UUID and fresh trusted `profiles` row                                            |
| Scenarios           | `scenarios.content`, tenant UUID, approval metadata, immutable approved revisions                   |
| Missions            | `missions`, UUID operator assignment, frozen scenario/criteria snapshots, revision and timer fields |
| Retest link         | `baseline_mission_id`, protected by a tenant-aware composite foreign key                            |
| Published report    | One immutable, client-safe `published_reports.snapshot` per mission                                 |
| Evidence            | `evidence` metadata; separate occurrence/upload timestamps and SHA-256                              |
| Evidence bytes      | Private `ecarteo-evidence` bucket at `<client UUID>/<mission UUID>/<evidence UUID>`                 |
| Action plan         | `actions`, real due dates and completion actor/time                                                 |
| Journal             | Append-only `mission_events`, with stable sequence ordering                                         |
| Request retries     | `app_private.command_receipts`, unique by actor and idempotency key                                 |
| Pending uploads     | `app_private.staged_attachments`, owner/mission/tenant bound                                        |
| Auth throttling     | `app_private.auth_rate_limits`, hashed normalized email; ten attempts per fifteen minutes           |

## Account provisioning

A trigger provisions an account only after a non-anonymous Auth user's email is confirmed. Self-signup creates a new company and a profile with role **`client`**, with `is_client_admin=true` for that new organization owner. A matching pending invitation suppresses separate company creation; the verified user redeems the trusted invitation to join its intended organization. Optional `company_name` and `display_name` metadata supply display labels only. Metadata cannot choose an existing tenant or request a staff role. Repeated confirmation does not create another company. Existing customers from the earlier migration remain non-admin until quality staff explicitly nominate them. Only quality staff issue invitations; see [ACCOUNTS-AND-REQUESTS.md](ACCOUNTS-AND-REQUESTS.md).

Bootstrap the first quality administrator through a trusted administrative operation: create/confirm the Auth user, verify the exact UUID, then promote its profile through an administrator-controlled SQL session. Further staff can join through quality-issued invitations in `/app/team`. A staff profile must have `client_id = NULL` and `is_client_admin = false`. Existing confirmed users without profiles need explicit provisioning or eligible invitation redemption; the migration does not silently backfill unknown accounts.

Example administrative promotion after identifying the correct user UUID:

```sql
update public.profiles
set role = 'qualite', client_id = null, is_client_admin = false
where id = '<verified-auth-user-uuid>';
```

Use `operateur` for auditors. Display names are labels: duplicate names never grant access to another operator's assignments. Setting `active = false` blocks subsequent API requests and RLS reads. The email confirmation requirement is also checked by the backend on every database operation.

## Authorization and publication

All application tables use RLS. Anonymous grants are revoked; authenticated users receive SELECT only. Mutation requests go through the authenticated server command endpoint. No public RPC grants service-role powers to a browser.

- Quality staff read all operational records, matching the supplied prototype's role model.
- Operators read only missions assigned to their UUID and associated records.
- Clients read their own company/profile, published reports, approved visible evidence and actions. Working mission/scenario records and event logs remain internal.
- Unprovisioned, disabled, and anonymous accounts receive no application data.

Public report snapshots are redacted **before storage**, and a database constraint rejects internal personas, limits, step scripts and expected-evidence lists in those snapshots. This protects direct PostgREST reads as well as the application's HTTP routes. Staff retain the full frozen scenario in the internal mission record.

Policy helpers use an empty search path, qualified names and trusted profile lookups. Keep `app_private` out of exposed API schemas. Audit pre-existing broad Storage policies before applying these migrations to a shared project: permissive policies combine with OR.

## Transactional commands

`src/server/workspace.ts` derives the actor from the verified user UUID and re-queries the active profile. Strict runtime schemas reject unknown command properties, invalid IDs, unsafe inline image payloads, and browser-supplied actors.

Each command acquires a request lock and a tenant advisory lock, loads its authorized target audit aggregate under RLS, applies the domain rules, and persists changed normalized rows in one PostgreSQL transaction. Different customers can progress independently. Request receipts bind an idempotency key to an exact canonical payload; reusing a key with different content returns a conflict. Draft, scoring and observation preconditions prevent stale edits.

Approval saves final scores, generated actions, evidence visibility, mission status, client-safe report and event log together. A deferred constraint rejects a completed mission without its report. Published reports and mission snapshots are immutable. Client action completion updates only the action record and its audit event, never a report or scenario snapshot.

Workspace reads are bounded and paginated; search, page controls and indexed cursors keep the console from downloading every historical audit. See the implementation and verification notes for the precise limits. Capacity still needs load testing on the intended hosting/database resources.

## Evidence lifecycle

The server repeats filename, extension, MIME, signature and 10 MB size checks before accepting file bytes. It authorizes the editable mission, generates the path, stores the object, and creates an owner-bound staged record. `evidence.add` validates the exact staged file metadata and mission binding inside the database transaction before attaching it. Browser-supplied file paths are never used.

Downloads recheck evidence RLS and proxy bytes through the authenticated server route. Direct browser upload, overwrite and deletion policies are absent. A staged file can be deleted only by its uploading account. An attached file cannot be deleted through the cleanup API.

Staged uploads expire for attachment after 24 hours, and each account may have at most 30 pending files. Use the staged-upload maintenance script with a dry run first, then its explicit apply mode, to remove expired objects and rows. Configure regular maintenance in the deployment environment. Database and Storage cannot share a transaction: failed metadata commits attempt compensating object removal. A provider outage during both upload and cleanup may leave an inaccessible orphan that maintenance must reconcile.

## Verification completed and remaining

The migrations, SQL isolation assertions and actual server command functions were exercised against disposable local PostgreSQL with small Supabase Auth/Storage schema stand-ins. Integration tests cover two-company isolation, UUID operator assignment, concurrent idempotent commands, stale observations, atomic approval, client action completion, direct report projection reads, staged file ownership, customer-only provisioning and durable auth throttling. File bytes use an in-memory Storage test double in these tests.

The isolated database tests do not validate Auth tokens or provider file services. Separately, authenticated workflows have passed against a real local Supabase Auth/Storage stack. See [VERIFICATION.md](VERIFICATION.md) for exact local-provider coverage. Repeat the checks in `supabase/tests/README.md` and the deployed authentication/upload flows against hosted staging: record external SMTP delivery, backup recovery and target-network verification separately for each environment.

Retention and erasure policy remain an administrative lifecycle decision. Published evidence and audit records are intentionally protected against ordinary deletes. The maintenance utilities now support audited case intake, tenant inventory/export and immutable report supplements for corrections; follow [OPERATIONS.md](OPERATIONS.md) and approve contract-specific retention before accepting real customer evidence.

The access model follows Supabase's documented separation of grants and RLS policies and private Storage authorization: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## Production additions

- `app_private.team_invitations` stores hashed, expiring, single-use, email-bound invitations. `account_events` records changes; quality staff manage names/active status/client administrator designation.
- `public.audit_requests` provides tenant-scoped intake and quality review; conversion creates a draft scenario for normal approval/execution.
- Private billing tables bind customers, subscriptions, checkout sessions and webhook receipts to client tenants. See [BILLING.md](BILLING.md); Stripe is optional until configured.
- `app_private.privacy_cases` and append-only `operations_events` support reviewed administrative requests and tenant exports. `public.report_addenda` stores immutable client-visible corrections alongside original reports. Ordinary clients cannot write these records.
- `/api/ready` provides token-protected database/schema/private-bucket checks. Maintenance scripts and the coordinated backup/restore procedure are documented in [OPERATIONS.md](OPERATIONS.md).

These additions are locally implemented. Local Supabase acceptance supplements the isolated database tests; see the [launch checklist](LAUNCH-CHECKLIST.md) for hosted acceptance and external dependencies.
