# Team access and audit requests

## Bootstrap and authority

Create the first quality identity through Supabase Auth, confirm its email, and verify its UUID. In a trusted administrative database session set `role='qualite', client_id=NULL, is_client_admin=false` for that exact profile. The standard signup form can never create a staff account. The deployment guide gives the full setup procedure.

Quality staff manage access at `/app/team`. Staff invitations may grant `qualite` or `operateur`; customer invitations require an existing customer organization and grant `client`. The optional billing-administrator flag is available only for customer profiles. A new organization’s self-signup creator receives that flag. **Existing profiles are not automatically promoted:** quality staff must nominate an owner after migration.

Quality may update display names, activate/deactivate access, and nominate customer billing administrators. Saves compare the previous name/access/admin values to reject stale edits. Staff cannot disable themselves. Roles and organization membership cannot be changed through the member editor; use a reviewed administrative migration for those exceptional changes so historical audit ownership stays consistent. Disabling a member prevents subsequent authorized requests; records and immutable audit history remain intact.

## Invitation delivery and redemption

1. A quality manager enters the exact intended email and role/organization in Team access.
2. The application returns a link once, such as `/app/join#<secret>`. Copy it and deliver it directly to the intended person through your approved channel. **Creating an invitation does not send an email.**
3. The invitee opens the link, creates or signs into an account using that exact email, confirms the account email, then reopens the original invitation link and chooses **Rejoindre l’espace**.
4. The application checks the confirmed email, issuer’s current authority, token validity, and intended role/organization before assigning the profile. A pending invitation suppresses automatic creation of an unrelated customer organization.
5. The link expires after seven days and is single-use. Successful retries by the same account are harmless. A fresh invitation to the same email revokes the previous pending link. Quality staff may also revoke it explicitly.

Invitation secrets are 32 random bytes. Only SHA-256 hashes are persisted. Fragment tokens do not reach HTTP server URLs or Referer headers. The raw link is never persisted in the browser. The issuance, revocation, acceptance and member changes have an append-only administrative event log. Email-bound redemption prevents forwarding the link from granting access to a different verified email.

An existing profile cannot be moved into another role or organization by accepting an invitation. Use its existing account or ask a quality administrator to resolve the conflict. If an invitation expired before email confirmation and signup created a separate organization, staff must review that account explicitly; the application does not silently reassign or delete customer records.

## Audit request lifecycle

Customers use `/app/requests` to submit a scope, sector, channels, site count and optional preferred date. The request belongs to the authenticated customer’s organization; a browser cannot choose another tenant. It creates no payment and schedules no intervention.

Quality staff see the request queue and can accept a scope, decline with a reason, or prepare a scenario. Conversion creates one same-tenant draft atomically and marks the request converted. It deliberately leaves the operational step blank: quality must choose **Modifier le brouillon**, complete the persona, step/threshold, expected evidence and limits, save, and validate before assigning an operator. The blank step blocks premature approval. Approved scenarios remain immutable; create a new revision for later protocol changes.

Customers can cancel requests while submitted. Accepted requests require staff coordination. Review decisions use revision preconditions, so stale decisions fail visibly. Creation retries with the same ID/payload are idempotent. Lists use database pagination (25/page), search, tenant RLS and status filters. Operators do not receive the customer intake queue.

Daily application limits: 100 invitations per quality account and 20 audit requests per customer account, serialized per actor. Configure infrastructure rate limits as described in deployment guidance. Team search shows the latest 50 matching invitations. Organization selection has independent database search and pagination (25/page), so it does not load the full customer directory.

## Verification

`tests/accounts-requests.test.ts` exercises real disposable PostgreSQL transactions with the same RLS/migrations. `tests/scenario-edit.test.ts` checks stale draft saves, tenant invariants and immutable approved protocols. `tests/portal-routes.test.ts` verifies CSRF and trusted-identity boundaries. Live email delivery, Auth identity confirmation and hosted invitation acceptance still require staging-provider acceptance testing.
