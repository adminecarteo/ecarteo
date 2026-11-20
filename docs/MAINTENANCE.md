# Production maintenance on Render

Écartéo’s **Production maintenance** workflow runs once a day at 04:37 UTC on the default branch. It checks the production app, PostgreSQL schema and private evidence bucket. If the checks pass, it previews expired staging reservations and cleans up one batch of up to 100 abandoned uploads. The schedule and manual runs share one concurrency group. Review the result under [GitHub Actions](https://github.com/adminecarteo/ecarteo/actions/workflows/production-maintenance.yml).

The deployed app uses Supabase project `hghlfdhzfxllcooaglzg`. The scheduled runner makes authenticated HTTPS requests to Render. PostgreSQL and Supabase credentials stay on the server. The workflow runs on `main` and supports only scheduled and manual events. The check job grants no GitHub token permissions. The separate notification job grants only `contents: read` to check out its script; checkout does not retain Git credentials. The check writes counts and readiness status to the Actions log.

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
2. Open the run. Expect `Production readiness passed.` and the eligible count. An empty production database can return zero. The manual preview performs read-only checks.
3. To process a backlog, run it again with the checkbox selected. Each run can remove up to 100 matching objects from the private evidence bucket. Repeat when the run reports a remaining backlog. Run a final preview to verify zero eligible reservations.

The equivalent manual CLI preview uses your designated GitHub account:

```sh
gh workflow run production-maintenance.yml --ref main --repo adminecarteo/ecarteo -f apply=false
gh run list --workflow production-maintenance.yml --repo adminecarteo/ecarteo --limit 5
```

## Failure notifications

Production status, 20 November 2026: the GitHub SMTP settings and TLS login were verified. [Run 44713006657](https://github.com/adminecarteo/ecarteo/actions/runs/44713006657) passed readiness/cleanup preview and the explicit notification test. The notification reported `smtp_accepted` for `admin-dev@ecarteo.fr` at **09:42:54 UTC**. On 20 November, the owner confirmed receipt in the designated mailbox by supplying the received bilingual message and its exact run `44713006657` link. Inbox delivery acceptance for this test is complete; the precise receipt time was not recorded. This acceptance covers the configured GitHub workflow, not the unavailable off-site backup host or a continuous error-monitoring service.

The workflow contains a separate email notification job for readiness or cleanup failures. The HTTP check step has a five-minute deadline within the job's six-minute ceiling; reaching the step deadline fails the check and permits notification. Notifications have their own two-minute deadline so they are not dependent on remaining check-job time. A normal successful run, a skipped check or a cancelled workflow sends nothing. A runner or whole-workflow cancellation can still prevent notification; review Actions directly if a scheduled result is missing. The approved responder is `admin-dev@ecarteo.fr`. Notifications use a separate GitHub Actions secret; saving SMTP settings in Supabase does not configure GitHub automatically.

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
npx vitest run tests/backup-receipt.test.ts
```

The tests cover TLS-before-authentication, failed TLS blocking login, a single bounded recipient, restricted notification content and backup freshness/integrity failures. They do not establish real SMTP delivery or an active backup schedule. The notification step only covers this workflow; continuous HTTP error monitoring and the private-host backup checks require their own configured runner. See [Operations and recovery](OPERATIONS.md).

## Recover from a failure

- A readiness failure halts cleanup. Review the service status, the latest deploy and the `readiness_failed` event in Render. Verify the private readiness token matches GitHub. A cold service receives one bounded retry.
- A cleanup 404 indicates that the endpoint, token or deployed version needs attention. Verify the deployed commit and rotate the cleanup token on Render and GitHub together if necessary.
- A cleanup 503 leaves staging reservations available for a retry. Look for `staged_cleanup_failed` in Render, check the storage connection, then run the manual preview and retry. Counts are safe to share internally.
- To pause scheduled maintenance for a restore, use **Disable workflow** from its Actions menu. Wait for any current run to finish. Re-enable the workflow and preview the backlog after recovery. Database and Storage backup instructions are in [Operations and recovery](OPERATIONS.md).

Only pending upload reservations older than 24 hours qualify. The database excludes files already linked to evidence and locks the selected reservations. Storage deletion uses their server-generated paths. The reservation clears after the Storage API confirms removal. Requests cannot supply an object path, age threshold or tenant. Other orphaned Storage objects require the separate reconciliation procedure in [Operations and recovery](OPERATIONS.md).

This is a daily readiness sample. Between runs, Render’s service dashboard exposes current service health. Free web services may sleep after 15 idle minutes and take about a minute to wake. GitHub may delay scheduled runs and may disable schedules in inactive public repositories. Check the latest successful run after a long quiet period. [Render Free service limits](https://render.com/docs/free) · [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
