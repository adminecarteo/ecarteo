# Public website analytics and cookies

Écartéo's public website is `https://ecarteo.fr/`. Its GA4 web stream measurement ID is **G-X9BFFJ9M78**. The shared public marketing shell owns the cookie controls, so the independent Render static frontend and the Next.js public pages use the same implementation.

## Visitor controls

- **Accepter** enables optional Google Analytics measurement.
- **Refuser** keeps analytics disabled and remembers the refusal.
- **Personnaliser** opens preferences; analytics starts unchecked for a new visitor. Essential storage remains enabled.
- **Gérer les cookies**, in the public footer, reopens preferences to change or withdraw consent.

French and English are supported. The versioned first-party preference expires after 180 days. If browser storage is unavailable, a choice applies to the current document and the next visit asks again. Clearing site data also resets the choice.

The implementation uses basic consent behaviour: no Google script, analytics request or analytics cookie before acceptance. Refusal does not send cookieless analytics pings. Withdrawal disables collection and removes the site's `_ga` cookies. The authentication session and language preference are separate and are not removed by this control.

Only the six public pages are eligible: `/`, `/methode`, `/offres`, `/mentions-legales`, `/confidentialite`, and `/conditions`. The exact production origin is required; localhost, staging and Render provider addresses do not send measurements. Login, registration, authentication callbacks, the audit workspace and APIs are excluded. Public navigation uses document loads to keep the tag out of the authenticated application.

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
