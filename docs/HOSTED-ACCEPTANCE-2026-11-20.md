# Hosted authentication and production upload acceptance — 20 November 2026

The remaining hosted API acceptance checks passed against the real Supabase-backed staging application and the canonical production origin. These are backend/provider checks, separate from browser interaction, external mailbox delivery and capacity certification.

## Hosted staging identity and invitations

Target: `https://ecarteo-staging-zy4j.onrender.com`, Supabase project `ikfxhhcxcmrgfuwxpjpr`. The run completed at **15:09:45 UTC / 16:09:45 Paris**. All 11 recorded checks passed.

| Check                               | Observed result                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session security                    | Hosted login set Secure, HttpOnly, SameSite=Lax authentication cookies. Account bootstrap returned the expected role and private/no-store caching.                                          |
| Unconfirmed identity                | A dedicated synthetic unconfirmed user could not log in (400) or read the workspace (401).                                                                                                  |
| Invitation before redemption        | After administrative email confirmation, user-only bootstrap succeeded; workspace access remained denied (403) until invitation redemption. No application tenant was assigned prematurely. |
| Wrong identity and superseded token | A different confirmed account and an older automatically revoked invitation both received `INVITATION_INVALID` (400).                                                                       |
| Concurrent redemption and replay    | Two simultaneous acceptances by the intended user succeeded idempotently and produced exactly one `invitation.accepted` audit event. Replay from a different identity failed (400).         |
| Scoped access                       | The accepted user received the invited client role and organization. Team administration and billing administration remained denied (403).                                                  |
| Expiry                              | Moving only the synthetic invitation's validity window into the past caused redemption to fail (400). The expired invitation was then revoked through the team API.                         |
| Session refresh                     | Expiring the test session's cached timestamp triggered genuine provider refresh through the hosted app, replacement cookies and a new future expiry.                                        |
| Local sign-out                      | Local sign-out cleared workspace access (401), the signed-out refresh token could not be replayed, and a separate session for the same test identity remained valid (200).                  |
| Account deactivation                | Deactivating the synthetic user through the team API denied both workspace and account bootstrap in its already-open session (403).                                                         |
| Cleanup                             | The synthetic account is inactive, outstanding invitations are revoked, and the test sessions were signed out locally. Accepted invitation/account audit history remains intact.            |

No SMTP messages were sent by this run. Administrative confirmation exercised verified-identity and invitation authorization; it does **not** establish signup/recovery inbox delivery. Existing real account passwords and access assignments were not changed.

## Canonical production upload and abuse boundaries

Target: `https://ecarteo.fr`, Supabase project `hghlfdhzfxllcooaglzg`. The run completed at **15:12:24 UTC / 16:12:24 Paris**. All 11 recorded checks passed, with none skipped. The checks used synthetic bytes and an isolated technical QA reference. No customer report or attached customer evidence was created.

| Check                          | Observed result                                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing role access           | Quality, operator and client accounts authenticated on the canonical production origin.                                                                                                                                      |
| Origin protection              | Missing Origin, foreign Origin and cross-site fetch metadata were rejected (403) by both the command and attachment routes: six checks.                                                                                      |
| Anonymous/type/body boundaries | Anonymous upload returned 401; a non-multipart upload returned 415; an authentication JSON body over 8 KiB returned 413.                                                                                                     |
| Authentication rate limit      | Ten failed login requests for a new, nonexistent synthetic address returned 400. The eleventh returned 429. No existing account was throttled and no email was sent.                                                         |
| Maximum accepted file          | Exactly **10,485,760 bytes (10 MiB)** uploaded successfully through the live production attachment endpoint. The scoped private Storage object and recorded SHA-256 matched the submitted bytes.                             |
| Private access                 | The client could not upload (403), read the staged file (404) or delete another user's staged file (404). Its public Storage URL was denied (400).                                                                           |
| File rejection                 | A 10 MiB + 1 byte file returned 400; a multipart body over 11 MiB returned 413. Empty files, unsupported extensions, mismatched MIME/extension and an invalid PNG signature were rejected (400).                             |
| Pending-upload cap             | Thirty tiny pending uploads succeeded; the thirty-first returned `UPLOAD_LIMIT` (429). Storage listing contained exactly 30 objects, proving the rejected upload's object had been removed.                                  |
| Cleanup                        | Every accepted staged object was deleted through the owning operator's API. Exact-ID checks found no remaining temporary mission, evidence, staged-upload row or Storage object. Database integrity guards remained enabled. |

The maximum-file checksum was `eb6183addde05c2196ce25e6fa34a4baf20f9bf30d33892f452a9a1e88c9a472`. The download comparison used a narrowly scoped trusted Storage read of the pending object; it did not claim that an unpublished staged file was downloadable through the customer attachment route. Earlier report/PDF and attached-evidence journey acceptance remains a separate record.

One approved technical reference remains intentionally because approved scenarios are immutable:

- Scenario: **QA ONLY — upload acceptance 2026-11-20 846a65a6** (`63cebea8-ec0d-4c2a-aacf-9910be568cfc`).
- Organization: **QA ONLY — technical acceptance 846a65a6** (`737b45be-3dff-4e3e-8b7c-e2c864edaffc`).
- The scenario's normal creation/approval command receipts remain as audit history. The temporary working mission was removed after proving it had no evidence, events or staged objects. No immutable history was bypassed or deleted.

## Evidence and limits

Sanitized results are retained on the setup computer outside Git at `/private/tmp/ecarteo-hosted-qa-20261120/staging-auth-results.json` and `production-upload-results.json`. Private journals contain only the synthetic fixture identifiers needed for accountability; no passwords, authentication cookies or invitation tokens are included in this document.

The focused existing auth/session/account test run passed **51 tests**, with **12 disposable-PostgreSQL integration cases skipped** because that run had no isolated local database URL. Real hosted acceptance above supplies the explicitly listed provider and deployed-origin evidence; it is not a substitute for every skipped local integration case. No browser automation was run by these scripts, no real user's password was reset, and no customer messages were sent.
