# Optional subscriptions and invoices

Écartéo continues to support audit services agreed by quotation. Online subscriptions are an optional, implemented capability. No Stripe account, product, price, subscription, payment or invoice was created by this task. The merchant must approve its offers, tax treatment, cancellation rules and customer terms before enabling checkout. Billing does not automatically schedule audits or restrict access to existing reports.

## What is implemented

- `/app/billing` for organization billing administrators, with configured offers and subscription status.
- Stripe-hosted subscription Checkout; the server selects an allowlisted Price, quantity one and its own customer ID. Browser-submitted prices, amounts, tenants and redirects are rejected.
- A short-lived Stripe Customer Portal session for payment methods, cancellation, subscription changes and invoice history/downloads, according to the portal settings you enable.
- Raw-body signature verification, timestamp tolerance, environment-mode checks and durable event receipts on `/api/billing/webhook`.
- Fresh provider subscription reads during webhook processing, serialized per organization. Delayed events cannot restore an old subscription snapshot.
- Private database tables with no browser grants. Every billing action rechecks the active, confirmed profile and `is_client_admin` flag. Staff do not impersonate a customer's payment session.
- Persistent creation reservations and idempotency keys prevent duplicate customer and Checkout creation during concurrent clicks or network retries. An unresolved creation older than 23 hours fails closed for administrative reconciliation.

Payment details never enter Écartéo's application forms or database. Stripe stores invoice documents. The application stores provider identifiers and a limited subscription-status mirror, not webhook payloads or card details. A successful browser return is not proof of payment.

## 1. Configure staging first

1. Create/access your Stripe account and use a sandbox/test environment. Complete the business account configuration separately before live activation.
2. Create the approved recurring products and Prices in Stripe. This implementation supports active, fixed, per-unit recurring Prices with licensed usage; metered/tiered billing is rejected. Decide which taxes and tax-inclusive/exclusive Prices apply with the person responsible for your commercial setup. The integration collects a billing address and tax ID; it does not automatically enable Stripe Tax.
3. Add server-only environment values to staging:

   ```dotenv
   STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_YOUR_KEY
   STRIPE_WEBHOOK_SECRET=whsec_REPLACE_WITH_ENDPOINT_SECRET
   STRIPE_BILLING_PLANS='[{"id":"your-plan-key","name":"Your approved offer name","priceId":"price_REPLACE"}]'
   ```

   The sample is structural only; it does not define an offer or price. Use the actual Price ID returned by Stripe. Plan IDs must be unique lowercase keys. Maximum 12 plans. Omitting either key disables online billing; omitting the plan catalog leaves the portal available for existing customers but creates no checkout offers. Never use `NEXT_PUBLIC_` for these variables.

4. Ensure migration `202611090004_billing.sql` is applied after `202611090003_accounts_requests.sql`.
5. In Écartéo's team administration, nominate the intended client billing administrator. New independently registered organization creators receive the flag; existing profiles are not silently promoted. Invited users receive it only when quality staff explicitly select that permission.
6. Configure the Stripe Customer Portal in the same test environment: branding, support details, approved cancellation/change behavior, permitted products/Prices, invoice history and customer payment updates. The return URL is set by the server from `APP_URL`; never accept a customer-supplied one.

## 2. Register the webhook

1. In Stripe Workbench → Webhooks, create an event destination for **your account** using **Snapshot** payloads. This endpoint implements snapshot events, not thin events or Stripe Connect accounts.
2. Use the API version matching the installed Stripe SDK. This implementation uses `stripe@23.1.0`, whose pinned version is **`2026-10-28.endive`**. Keep SDK and webhook version aligned during upgrades.
3. Set the exact HTTPS endpoint to `https://YOUR-STAGING-DOMAIN/api/billing/webhook`.
4. Select only:

   ```text
   checkout.session.completed
   checkout.session.expired
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   customer.deleted
   ```

5. Store this destination's signing secret in `STRIPE_WEBHOOK_SECRET`, then redeploy/restart the app. An endpoint-specific secret is different from an API key or Stripe CLI forwarding secret.
6. Leave the raw request body intact. Do not place login, CSRF middleware, JSON rewriting, caching or a human challenge in front of this route. Its signature is its authentication. Set a reasonable request rate limit that accommodates Stripe retries.

For local provider testing, use Stripe CLI forwarding in your test environment:

```sh
stripe listen --forward-to http://127.0.0.1:3000/api/billing/webhook
```

Use the temporary `whsec_...` printed by that process **only** for local testing. This task has not run the CLI or contacted your Stripe account.

## 3. Run payment acceptance tests

1. Sign in as a confirmed client billing administrator and open `/app/billing`.
2. Confirm the displayed name, currency, amount and interval match the approved Stripe Price.
3. Start checkout using Stripe's published test-payment details. Check the success, decline and additional-authentication cases. Never enter a real card in test mode.
4. Return to the app and refresh. The subscription must appear only after a verified webhook commits. A changed `?checkout=returned` query must never mark an account paid.
5. Open the portal, verify invoices, update the test payment method and exercise the cancellation/change options you enabled. Verify resulting webhooks update the app.
6. Repeat the same Checkout click concurrently: one pending session/customer should exist. An existing active, past-due, incomplete or paused subscription must direct the customer to management, not create another subscription.
7. Confirm a second organization's administrator and a normal client member cannot open the first organization's billing session. Disable the administrator and confirm all billing calls fail.
8. Resend a webhook, reorder subscription updates, corrupt a signature, and send test events to a live-configured app: duplicates are harmless, current provider state wins, invalid signatures/modes return 400.
9. Temporarily make the staging database unavailable: webhook processing must return a retryable 5xx, and retries must later commit once.
10. Verify that your host/firewall preserves the Stripe request body and does not cache authenticated billing responses.

Automated local coverage uses real PostgreSQL plus a Stripe test double, and real SDK webhook-signature validation with locally generated fixtures. It does not prove Stripe delivery, live payment behavior, portal configuration or merchant readiness.

## 4. Handle an unresolved reservation

A network response or database commit can fail after Stripe creates a resource. The server retries with the same idempotency key for up to 23 hours; it then deliberately requires review because Stripe may prune older keys.

1. Use a trusted database session to inspect only the affected organization's `app_private.billing_customers` and `billing_checkout_sessions` rows. Never clear these rows just to remove an error.
2. In the matching Stripe environment, locate the customer using metadata `ecarteo_client_id`. Locate a Checkout session using `ecarteo_checkout_id` or the recorded session ID. Check provider request logs for idempotency keys `ecarteo-customer-<client UUID>` and `ecarteo-checkout-<reservation UUID>`.
3. Verify exactly one matching customer/session and ownership. If creation succeeded, repair the missing provider identifiers/status in a controlled database transaction, preserving the reservation and audit evidence. Resend the corresponding webhook for completed sessions.
4. If no creation happened, document the evidence and resolution before allowing a new reservation. If duplicates exist, involve the billing owner to resolve them in Stripe; this application must not guess which charge or subscription to cancel.
5. Confirm the client can resume, and investigate the original network/database failure. Do not change Price mappings or `APP_URL` while an unresolved creation is being retried: idempotent retries require identical parameters.

## 5. Activate live billing

Repeat the configuration in the production Stripe environment using live keys, live Prices and a separate live webhook secret. Never point the same app database at both test and live Stripe environments; mode mismatches fail closed. Complete the acceptance checklist in staging first, then a merchant-approved live acceptance check. Configure alerts for failed webhook deliveries, unresolved reservations and invoice payment failures. Stripe's own invoice/receipt email and retry settings must be reviewed and enabled by the merchant.

Provider references checked for this implementation: [subscription Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions?payment-ui=stripe-hosted), [Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal), [webhook verification and delivery](https://docs.stripe.com/webhooks), [Stripe Node SDK](https://github.com/stripe/stripe-node), and [idempotent requests](https://docs.stripe.com/api/idempotent_requests).
