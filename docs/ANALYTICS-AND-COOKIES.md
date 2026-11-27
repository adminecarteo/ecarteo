# Public website analytics and cookies

Écartéo's public website is `https://ecarteo.fr/`. Its GA4 web stream measurement ID is **G-X9BFFJ9M78**. The shared public marketing shell owns the cookie controls, so the independent Render static frontend and the Next.js public pages use the same implementation.

## Visitor controls

- **Accepter** enables optional Google Analytics measurement.
- **Refuser** keeps analytics disabled and remembers the refusal.
- **Personnaliser** opens preferences; analytics starts unchecked for a new visitor. Essential storage remains enabled.
- **Gérer les cookies**, in the public footer, reopens preferences to change or withdraw consent.

French and English are supported. The versioned first-party preference expires after 180 days. If browser storage is unavailable, a choice applies to the current document and the next visit asks again. Clearing site data also resets the choice.

The implementation uses basic consent behaviour: no Google script, analytics request or analytics cookie before acceptance. Refusal does not send cookieless analytics pings. Withdrawal disables collection and removes the site's `_ga` cookies. The authentication session and language preference are separate and are not removed by this control.

Only six public pages send page views: `/`, `/methode`, `/offres`, `/mentions-legales`, `/confidentialite`, and `/conditions`. The exact production origin is required; localhost, staging and Render provider addresses do not send measurements. Login, registration forms, authentication callbacks, the audit workspace and APIs are excluded from page-view tracking. Public navigation uses document loads to keep the tag out of the authenticated application. A separate, short-lived completion document may send the registration event described below; it sends no page view.

Page views use fixed public titles and canonical paths. Query strings, fragments and referrers are omitted; campaign attribution from UTM parameters is therefore not collected by this implementation. Account identities, audit information and authentication tokens are not passed as event parameters. Google advertising signals and advertising personalization are disabled. This document describes the implementation, not a certification of regulatory compliance or the owner's Google account configuration.

## Verify in GA4 Realtime

An Analytics account with access to the existing Écartéo property is required. A measurement ID permits collection but does not grant access to reports.

1. Sign in at [Google Analytics](https://analytics.google.com/) with the account that owns Écartéo. Select the existing property, rather than creating another one.
2. Under **Admin → Data collection and modification → Data streams**, open the Écartéo web stream and check **G-X9BFFJ9M78** and `https://ecarteo.fr`.
3. Open **Reports → Realtime** (or **Realtime overview**, depending on the navigation shown). Remove any report comparison that would exclude the test browser.
4. In a new private browser window, open `https://ecarteo.fr/`. Choose **Refuser**. No analytics event should be sent from that visit. Existing visitors may still appear in the report.
5. Use **Gérer les cookies**, enable **Mesure d’audience**, and save. Alternatively, use another fresh private window and choose **Accepter**.
6. Visit `https://ecarteo.fr/methode`. In Realtime, look for `page_view` under event counts and **Écartéo — Méthode** among page titles. Allow a short processing delay. Record the test time and the observed event. Realtime covers recent activity; ordinary reports can take longer.
7. Return to **Gérer les cookies**, disable analytics, and save. Subsequent navigation should stop sending events. An earlier accepted visit may remain visible in Realtime during its reporting window.

If the event is absent, check that the stream ID matches, the browser accepted analytics, a content blocker is not blocking Google, and a property data filter is not excluding the test traffic. Do not disable consent to troubleshoot. A successful browser collection request establishes dispatch, not receipt in an inaccessible Realtime report.

The property owner should also review Enhanced Measurement and collection/retention settings. This installation sends explicit page views; browser-history measurement is not required for the document-based public navigation. No Google property settings were changed through this repository.

References: [Google consent modes](https://developers.google.com/tag-platform/security/concepts/consent-mode), [manual page views](https://developers.google.com/analytics/devguides/collection/ga4/views), [Realtime report](https://support.google.com/analytics/answer/9271392?hl=en).

## Completed registrations

The explicit signup email-confirmation handler first verifies the OTP with Supabase. A private database ledger records newly activated customer profiles; existing accounts are not backfilled. Only an activation created during that successful verification can issue a ten-minute, HttpOnly receipt. Recovery, login, form submission, failed verification and the check-inbox screen do not issue a receipt.

The handler redirects to the clean `/registration-complete` document, with no token or account information in its URL. Its same-origin POST endpoint verifies the authenticated account and atomically consumes the receipt. The existing consent record must have been accepted before activation and must remain unexpired and accepted when claimed and immediately before dispatch. Refused, missing, withdrawn, invalid or expired consent produces no Google request. A refusal consumes the opportunity; accepting later does not replay it.

When eligible, the completion document briefly loads the existing stream's tag with automatic page views disabled and sends only `sign_up`, with `method: "email"`. Page context is a fixed completion title and URL with an empty referrer. No account ID, name, email, form contents, receipt, verification token or URL parameters are included. The public GA cookie identifier is reused when available. Navigation into the private workspace is a full document load, leaving the tag behind.

Each account has one ledger row and only one atomic dispatch claim. Refreshes, concurrent requests, reopened links, resends and later logins cannot obtain another claim. Dispatch is **at most once**, not a delivery guarantee: a blocked Google script, browser closure or network failure can undercount, and an uncertain dispatch is never retried. Analytics errors cannot undo activation; the completion document continues to the workspace after at most three seconds. The server-only ledger stores the activation/settlement state until its account is deleted; it is not exposed through Supabase's public API.

Deploy `202611270008_registration_analytics.sql` before the backend version using it, then deploy both the backend and the static marketing frontend (for the updated French/English consent and privacy wording). No new secret or GA property setting is required. The completion page is private/no-store, noindex/nofollow, no-referrer and absent from the sitemap. It is not a marketing prerender route.

## Registration DebugView acceptance test

1. In the existing Écartéo property, verify the stream measurement ID **G-X9BFFJ9M78**, then open **Admin → Data display → DebugView**.
2. In an isolated test browser on `https://ecarteo.fr/`, accept analytics. For this test session only, set `sessionStorage.setItem('ecarteo.analytics.debug', '1')` using the browser's developer tools. The application omits `debug_mode` in ordinary sessions.
3. Register a new, clearly labelled test customer using an inbox you control. Form submission and the check-inbox screen must send no `sign_up`. Complete the actual signup email link in the same browser context. The clean completion document should send one `sign_up` with `method: email`, then open the workspace.
4. Select that test device in DebugView. Inspect the event and capture its name, method and count. A network request is dispatch evidence; only seeing the event inside the correct property verifies GA receipt.
5. Refresh, revisit the completion URL, reopen the used email link, resend the confirmation and log in later. None should add another `sign_up` for that account.
6. In a second isolated browser, refuse analytics and complete another new test registration. It must activate normally with no Google script or `sign_up`. Also check missing/expired/withdrawn consent, an incomplete signup and an invalid confirmation link.
7. Remove the session debug flag, close the isolated test browser and deactivate the labelled test accounts. The property owner can then mark `sign_up` as a key event; this application does not change that setting.

Automated coverage separates actual local Supabase/Mailpit activation and database concurrency tests from intercepted Google browser tests. The latter do not claim to prove receipt in the live GA property.

References: [GA4 recommended sign_up event](https://developers.google.com/analytics/devguides/collection/ga4/reference/events#sign_up), [DebugView and debug_mode](https://support.google.com/analytics/answer/7201382?hl=en).
