# Production maintenance on Render

Écartéo’s **Production maintenance** workflow samples production every six hours: **04:37, 10:37, 16:37 and 22:37 UTC** on the default branch. Each sample checks the production app, PostgreSQL schema, private evidence bucket and the public landing, login and signup pages. It also previews expired staging reservations. Only the **04:37 UTC** schedule automatically cleans up one batch of up to 100 abandoned uploads; the other scheduled samples are read-only. The schedule and manual runs share one concurrency group. Review the result under [GitHub Actions](https://github.com/adminecarteo/ecarteo/actions/workflows/production-maintenance.yml).

Published as commit `c0a95f1` on 20 November 2026. The first [live manual preview](https://github.com/adminecarteo/ecarteo/actions/runs/44763079398) passed at **15:25:19 UTC**: readiness passed, all three public pages passed, and eligible/removed upload counts were both zero with `apply=false`. No test email was requested; the notification job was correctly skipped on success. This initial run verified the deployed workflow from GitHub's network. On 23 November, all 11 subsequent scheduled runs were confirmed successful, including [run 45119382613](https://github.com/adminecarteo/ecarteo/actions/runs/45119382613). Scheduled starts were sometimes delayed relative to cron. The Actions runtime update `dd041f4` also passed [manual preview 45152582771](https://github.com/adminecarteo/ecarteo/actions/runs/45152582771), with cleanup disabled and no test email.

The deployed app uses Supabase project `hghlfdhzfxllcooaglzg`. The scheduled runner makes authenticated HTTPS requests to Render. PostgreSQL and Supabase credentials stay on the server. The workflow runs on `main` and supports only scheduled and manual events. Both jobs grant only `contents: read` to check out their scripts; checkout does not retain Git credentials. The check writes counts and bounded status messages to the Actions log. It never logs response bodies, customer data or tokens. Public page requests receive no authorization token or session cookie.

## Configure the production service

1. Open the production web service in the [Render dashboard](https://dashboard.render.com). Confirm the Supabase project URL and the service’s assigned HTTPS origin.
2. In the service’s **Environment**, set `OPS_HEALTH_TOKEN` and `OPS_CLEANUP_TOKEN` to two independently generated secrets. Generate 32 random bytes for each in a password manager or with `openssl rand -hex 32` in a private terminal. Keep the two values in the organization’s secret store.
3. Deploy the release containing the maintenance endpoint. Confirm the release is live in Render.
4. In the [repository’s Actions settings](https://github.com/adminecarteo/ecarteo/settings/secrets/actions), create these repository settings. Enter each token in the Secrets tab.

| Kind     | Name                       | Value                        |
| -------- | -------------------------- | ---------------------------- |
| Secret   | `PRODUCTION_HEALTH_TOKEN`  | Render’s `OPS_HEALTH_TOKEN`  |
| Secret   | `PRODUCTION_CLEANUP_TOKEN` | Render’s `OPS_CLEANUP_TOKEN` |
| Variable | `PRODUCTION_APP_ORIGIN`    | `https://ecarteo.fr`         |

The repository variable was switched to the root after HTTPS and application readiness passed on 18 November 2026. The read-only [maintenance preview](https://github.com/adminecarteo/ecarteo/actions/runs/44315814516), run with `apply=false`, succeeded from GitHub using normal DNS. See [migration evidence](ROOT-DOMAIN-MIGRATION.md) for the separate local DNS-cache limitation.

## Smoke test

1. Go to **Actions → Production maintenance → Run workflow**. Choose `main`, leave **Remove eligible expired staged uploads** unchecked and run it.
2. Open the run. Expect `Production readiness passed.`, `Public entry pages passed: /, /login, /signup.` and the eligible count. An empty production database can return zero. The manual preview performs read-only checks.
3. To process a backlog, run it again with the checkbox selected. Each run can remove up to 100 matching objects from the private evidence bucket. Repeat when the run reports a remaining backlog. Run a final preview to verify zero eligible reservations.

The equivalent manual CLI preview uses your designated GitHub account:

```sh
gh workflow run production-maintenance.yml --ref main --repo adminecarteo/ecarteo -f apply=false
gh run list --workflow production-maintenance.yml --repo adminecarteo/ecarteo --limit 5
```

## Failure notifications

Production status, 20 November 2026: the GitHub SMTP settings and TLS login were verified. [Run 44713006657](https://github.com/adminecarteo/ecarteo/actions/runs/44713006657) passed readiness/cleanup preview and the explicit notification test. The notification reported `smtp_accepted` for `admin-dev@ecarteo.fr` at **09:42:54 UTC**. On 20 November, the owner confirmed receipt in the designated mailbox by supplying the received bilingual message and its exact run `44713006657` link. Inbox delivery acceptance for this test is complete; the precise receipt time was not recorded. This acceptance covers the configured GitHub workflow, not the unavailable off-site backup host or a continuous error-monitoring service.

The workflow contains a separate email notification job for readiness, public page or cleanup failures. The script has a 270-second request deadline, the HTTP check step a five-minute deadline and the job a six-minute ceiling. A normal check timeout fails the check and permits notification. Notifications have their own two-minute deadline so they are not dependent on remaining check-job time. A normal successful run, a skipped check or a cancelled workflow sends nothing. A runner or whole-workflow cancellation can still prevent notification; review Actions directly if a scheduled result is missing. A continuing outage can send one failure message per sample. The approved responder is `admin-dev@ecarteo.fr`. Notifications use a separate GitHub Actions secret; saving SMTP settings in Supabase does not configure GitHub automatically.

In the repository's Actions settings, configure the following. Store the password in **Secrets**, never in Variables, a workflow file or a command-line argument.

| Kind     | Name                  | Value                                      |
| -------- | --------------------- | ------------------------------------------ |
| Secret   | `ALERT_SMTP_PASSWORD` | The sender mailbox's current SMTP password |
| Variable | `ALERT_SMTP_HOST`     | `send.one.com`                             |
| Variable | `ALERT_SMTP_PORT`     | `587`                                      |
| Variable | `ALERT_SMTP_USERNAME` | `admin-dev@ecarteo.fr`                     |
| Variable | `ALERT_FROM`          | `admin-dev@ecarteo.fr`                     |
| Variable | `ALERT_TO`            | `admin-dev@ecarteo.fr`                     |

On the owner's existing setup Mac, an ignored private helper is available as `.env.launch-alerts.command`. It verifies the repository-scoped GitHub account is `adminecarteo`, confirms the recipient and asks for the mailbox password using a hidden Terminal prompt. It verifies SMTP authentication over TLS before placing the password in the encrypted GitHub repository secret. It does not save the password locally, change Supabase, send an email or dispatch a workflow. This helper is local to that machine and is not part of a checkout. Alternatively, enter the values directly in GitHub's settings.

After the configuration and workflow are published, perform an explicit delivery test:

1. Run **Production maintenance** on `main` with **Remove eligible expired staged uploads** unchecked and **Send a clearly labelled notification test to the configured responder** checked.
2. Confirm readiness and the cleanup preview pass. The notification step should report `smtp_accepted` with event `alert_test`.
3. Open `admin-dev@ecarteo.fr` and verify receipt of the message titled **[Écartéo production] Alert delivery test / Test de notification**, including the link to that exact Actions run. Check spam if needed. Record the run and receipt time. An SMTP success proves provider acceptance, not inbox delivery.

The equivalent explicit dispatch is:

```sh
gh workflow run production-maintenance.yml --ref main --repo adminecarteo/ecarteo -f apply=false -f test_alert=true
```

Messages contain a fixed event description, the public app URL and the Actions run URL. They exclude customer information, raw errors, request URLs and secrets. The sender requires verified TLS on port 587 (STARTTLS) or 465 (implicit TLS); it never falls back to an unencrypted connection. A missing SMTP setting or failed send fails the notification step. Review the Actions result directly until delivery is verified, and after changing the mailbox password update this secret as well as Supabase's SMTP setting.

Offline verification, which sends no email:

```sh
python3 -B -m unittest discover -s tests -p test_operations_alert.py
npx vitest run tests/production-monitor.test.ts tests/backup-receipt.test.ts
```

The tests cover TLS-before-authentication, failed TLS blocking login, a single bounded recipient, restricted notification content and backup freshness/integrity failures. Monitor tests simulate a cold start, failed readiness/public routes, read-only samples, explicit cleanup, remaining backlogs and deadline expiry without hitting production or sending email. They also verify that a configuration failure exits nonzero with sanitized output, allowing the failure notification job to run. These tests do not establish real SMTP delivery or an active backup schedule. Continuous HTTP error monitoring and the private-host backup checks require their own configured runner. See [Operations and recovery](OPERATIONS.md).

## Recover from a failure

- A readiness failure halts cleanup. Review the service status, the latest deploy and the `readiness_failed` event in Render. Verify the private readiness token matches GitHub. A cold service receives one bounded retry.
- A `public_entry_page_failed` result means at least one of `/`, `/login` or `/signup` did not return HTTP 200 with an HTML content type, or the request failed. Check those routes in the browser and review the latest deployment. These checks do not submit forms, sign in, run JavaScript or certify that every user journey works.
- A cleanup 404 indicates that the endpoint, token or deployed version needs attention. Verify the deployed commit and rotate the cleanup token on Render and GitHub together if necessary.
- A cleanup 503 leaves staging reservations available for a retry. Look for `staged_cleanup_failed` in Render, check the storage connection, then run the manual preview and retry. Counts are safe to share internally.
- To pause scheduled maintenance for a restore, use **Disable workflow** from its Actions menu. Wait for any current run to finish. Re-enable the workflow and preview the backlog after recovery. Database and Storage backup instructions are in [Operations and recovery](OPERATIONS.md).

Only pending upload reservations older than 24 hours qualify. The database excludes files already linked to evidence and locks the selected reservations. Storage deletion uses their server-generated paths. The reservation clears after the Storage API confirms removal. Requests cannot supply an object path, age threshold or tenant. Other orphaned Storage objects require the separate reconciliation procedure in [Operations and recovery](OPERATIONS.md).

## Sampling, cost and availability limits

This is six-hour sampling, not continuous monitoring. A failure between samples may remain undetected until the next run, and GitHub can delay or skip scheduled work. There is no independent monitor watching the GitHub scheduler itself. During an incident, inspect the app and provider dashboards directly.

Render Free services may sleep after 15 idle minutes and take about a minute to wake. The monitor permits one bounded readiness retry; its six-hour interval is not a keepalive and does not prevent that sleep. It cannot guarantee uninterrupted availability, transactional email delivery, every 5xx response or authenticated browser journeys. [Render Free service limits](https://render.com/docs/free)

The repository `adminecarteo/ecarteo` was verified **public** on 20 November 2026. Standard GitHub-hosted Ubuntu runners for public repositories are free; this workflow installs no dependencies and uploads no artifacts or backups. It creates no paid resource. Keep standard runners and re-evaluate billing before changing repository visibility, runner class or storage usage. Private-repository runs would consume the owner's shared included Actions usage, so a future visibility change needs a confirmed zero-spend/stop-usage budget before retaining the schedule. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

The four scheduled checks each have a six-minute job ceiling; notifications add up to two minutes per failed or explicit test run, excluding scheduling/termination overhead. These limits bound execution rather than promise availability. No paid upgrade or artificial keepalive is configured.

GitHub can disable schedules in inactive public repositories. Check the latest successful run after a long quiet period and after maintenance. [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
