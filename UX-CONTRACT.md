# Écartéo interaction contract

## Authoritative product model

The supplied dossier and prototype define a central Écartéo audit service with three roles: quality manager, assigned operator and customer. The user's SaaS request adds public discovery, verified signup/login and a protected customer workspace. Independent signup creates a separate client organization; it never provisions staff. Quality-issued, email-bound invitations let confirmed identities join the intended organization or staff role without creating another organization. Customer billing administrators are designated through trusted provisioning, not editable user metadata.

No checkout is implied by account creation. Service-led offers remain available by quotation; optional Stripe subscriptions appear only when approved prices and provider credentials are configured. Account creation does not schedule or execute an audit. Real customer workspaces start empty. Customers submit audit requests; quality staff review them, convert an accepted scope to an editable draft, approve the protocol and assign the work.

## Canonical UI Map

| Capability     | Canonical owner                                                  | Source of truth                          | Allowed variants                        | Verification                          |
| -------------- | ---------------------------------------------------------------- | ---------------------------------------- | --------------------------------------- | ------------------------------------- |
| Select/Listbox | Native select through `Field`                                    | DESIGN.md                                | Native OS popup                         | Hosted console E2E                    |
| Date           | Labeled native date input                                        | Domain scheduling                        | Browser-owned calendar                  | Domain + hosted E2E                   |
| Form           | `Field` in `src/components/ui.tsx`; account fields in `AuthForm` | Domain and auth Zod schemas              | Console and account surfaces            | Unit, HTTP and browser tests          |
| Scrollbar      | `src/app/globals.css`                                            | DESIGN.md                                | Table/list scroll geometry              | Mobile layout checks                  |
| Toast          | `ConsoleProvider`                                                | This contract                            | Success/info, inline critical errors    | Console transport/E2E                 |
| CRUD           | Authenticated API + transactional workspace adapter              | `applyCommand` and SQL/RLS               | Create/approve/execute/publish/complete | Real disposable PostgreSQL tests      |
| Brand          | `src/components/brand-mark.tsx`                                  | Supplied HTML identity                   | Navy/white on light/dark                | Cross-surface visual comparison       |
| Authentication | `AuthForm`, server auth and proxy                                | Supabase verified user + trusted profile | Login/signup/recovery/reset             | HTTP tests + live-provider acceptance |

## Routes and navigation

Public routes are `/`, `/methode`, `/offres`. Account routes are `/login`, `/signup`, `/forgot-password`, `/reset-password`. `/app` requires a server-verified confirmed user and active profile. APIs independently repeat verification. The proxy refreshes cookies; it is not the authorization boundary.

`/app/team` is quality-only, `/app/requests` serves client and quality request workflows, and `/app/billing` requires a client billing administrator. `/app/join` allows a confirmed identity without an existing profile to redeem an invitation. Invitation tokens use the URL fragment and are never persisted in browser storage; the original invitation must be reopened after account confirmation.

Console view, entity and client filter are `/app` search parameters. Shareable filters never carry credentials. Return URLs are constrained to `/app`; external or malformed destinations are rejected. Native links navigate; buttons perform actions. The client role cannot reveal staff routes by editing query parameters.

After create, assign or publish, navigation opens the owning object. Persistent records are loaded from the server; browser IndexedDB sample storage is not used by any production route. Locale/theme are local preferences only. Unsaved drafts are session-scoped to authenticated user/role/tenant, cleared before mounting features for another identity, and removed on signout/session expiry. They are still browser-accessible content, not a confidential storage vault.

Console history uses server-side keyset pages and search; dashboard aggregates cover the authorized scope. Conditional refreshes avoid resending unchanged pages. A selected audit loads its associated evidence/actions/events together, so large individual audits and production directory sizes still need capacity testing.

## Mutation behavior

Every command validates its runtime shape and derives the actor from the verified UUID and trusted profile. PostgreSQL locks a tenant for each transaction, enforces domain/role/assignment/state rules, appends events and commits idempotency receipts with the mutation. Identical uncertain retries reuse a key; a changed payload with the same key conflicts. Stale note/scoring edits cannot silently overwrite newer drafts.

Only one client mutation is in flight at a time. Loading/refresh and error states preserve the workspace geometry. Failed saves keep editable values. Network/5xx outcomes are treated as uncertain until a refresh/retry resolves them. Session expiry hides data and requests real login. Changing role, disabling a profile or signing out never relies only on navigation visibility.

Published reports are immutable and stored with client-safe scenario content. Internal scripts/personas remain in staff-only working snapshots. Action completion is live and separate. Clients cannot query working scenarios, missions or internal logs, even through direct Supabase access.

Corrections are dated, append-only report supplements, displayed/exported alongside the original report. Privacy requests and administrative exports do not bypass immutable-record protections. Billing uses signed raw-body webhooks and durable creation/event records; a browser return from checkout does not prove payment.

## Accounts and feedback

Forms use `noValidate` with field-linked validation errors and focus the first invalid input. Passwords support managers/paste, remain masked by default and have keyboard-accessible reveal controls. No password enters URLs, logs, localStorage or sessionStorage. Email confirmation is required. Generic login/recovery responses avoid account enumeration. Auth attempts are durably throttled by normalized email, with provider/infrastructure rate limits as additional boundaries.

If configuration is absent, show a clear activation state and disable account submission. Never simulate successful login or create a browser-local production account. Confirmation links have constrained token types and destinations. Password change verifies a live session; if subsequent session revocation fails, show a partial-success state and retry revocation without changing the password again.

Product dialogs use Radix, focus management, Escape and focus restoration. No native alert/confirm/prompt. Toasts acknowledge progress, while critical errors remain inline. Busy buttons retain width and prevent duplicate activation.

## Files

PNG/JPEG/WebP/PDF/TXT/EML, maximum 10 MB. Validate extension/MIME/size and image/PDF signatures on the server. HTML, SVG and executable uploads are rejected. Objects use server-generated tenant/mission/evidence paths in a private bucket. An upload is staged until an authorized evidence command binds it; file metadata must match the reservation. Failed deterministic commands clean staging, uncertain commands retain it for safe retry. Committed attachments cannot be removed through the staging endpoint.

Downloads check fresh permission and return attachment disposition/no-sniff headers. Browser image previews use revocable Blob URLs. Storage and SQL do not share a transaction, so compensating cleanup and scheduled expired-staging maintenance are required. The maintenance script never selects published evidence. Contractual retention and erasure remain a launch decision.

## Locale, accessibility and verification

French/English public, account, console, team, request and billing pages share one language preference. The FR/EN control persists a non-sensitive cookie, server-rendered pages use that preference, and switching language preserves entered form values. Customer-written content is not automatically translated. Local account emails contain both languages. Locally bundled Inter and IBM Plex Mono. Date display uses Europe/Paris. Target WCAG 2.2 AA: native semantics, associated labels, focus, live status, color-independent severity and reachable mobile controls. Reduced motion and forced colors are supported.

Latin/Chinese reports use direct PDF download with a lazily loaded Han font when needed. Arabic data triggers an explicit printable-report button using bundled Amiri and browser shaping. The print button waits for fonts, opens no external service and exposes no report data in the URL. PDF viewer extraction of RTL word order can vary; application text-copy preserves original logical text. See `docs/PDF-LANGUAGES.md`.

Public navigation, password visibility, missing-provider states, origin rejection and narrow layouts are browser-tested. Unit auth tests mock the provider, and transactional tests use real PostgreSQL with Auth/Storage schema stand-ins. Separately, authenticated workflows have passed against real local Supabase Auth/Storage services. Local acceptance does not verify hosted email delivery, production infrastructure or Stripe payments. Authenticated browser tests still skip explicitly when their dedicated credentials are absent. See `docs/VERIFICATION.md` for the exact executed checks and `docs/DEPLOYMENT.md` for hosted staging acceptance.
