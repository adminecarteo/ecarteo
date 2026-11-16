# Production maintenance on Render

Écartéo’s **Production maintenance** workflow runs once a day at 04:37 UTC on the default branch. It checks the production app, PostgreSQL schema and private evidence bucket. If the checks pass, it previews expired staging reservations and cleans up one batch of up to 100 abandoned uploads. The schedule and manual runs share one concurrency group. Review the result under [GitHub Actions](https://github.com/adminecarteo/ecarteo/actions/workflows/production-maintenance.yml).

The deployed app uses Supabase project `hghlfdhzfxllcooaglzg`. The scheduled runner makes authenticated HTTPS requests to Render. PostgreSQL and Supabase credentials stay on the server. The workflow grants no GitHub token permissions, runs on `main`, and supports only scheduled and manual events. It writes counts and readiness status to the Actions log.

## Configure the production service

1. Open the production web service in the [Render dashboard](https://dashboard.render.com). Confirm the Supabase project URL and the service’s assigned HTTPS origin.
2. In the service’s **Environment**, set `OPS_HEALTH_TOKEN` and `OPS_CLEANUP_TOKEN` to two independently generated secrets. Generate 32 random bytes for each in a password manager or with `openssl rand -hex 32` in a private terminal. Keep the two values in the organization’s secret store.
3. Deploy the release containing the maintenance endpoint. Confirm the release is live in Render.
4. In the [repository’s Actions settings](https://github.com/adminecarteo/ecarteo/settings/secrets/actions), create these repository settings. Enter each token in the Secrets tab.

| Kind     | Name                       | Value                                     |
| -------- | -------------------------- | ----------------------------------------- |
| Secret   | `PRODUCTION_HEALTH_TOKEN`  | Render’s `OPS_HEALTH_TOKEN`               |
| Secret   | `PRODUCTION_CLEANUP_TOKEN` | Render’s `OPS_CLEANUP_TOKEN`              |
| Variable | `PRODUCTION_APP_ORIGIN`    | `https://ecarteo-production.onrender.com` |

## Smoke test

1. Go to **Actions → Production maintenance → Run workflow**. Choose `main`, leave **Remove eligible expired staged uploads** unchecked and run it.
2. Open the run. Expect `Production readiness passed.` and the eligible count. An empty production database can return zero. The manual preview performs read-only checks.
3. To process a backlog, run it again with the checkbox selected. Each run can remove up to 100 matching objects from the private evidence bucket. Repeat when the run reports a remaining backlog. Run a final preview to verify zero eligible reservations.

The equivalent manual CLI preview uses your designated GitHub account:

```sh
gh workflow run production-maintenance.yml --ref main --repo adminecarteo/ecarteo -f apply=false
gh run list --workflow production-maintenance.yml --repo adminecarteo/ecarteo --limit 5
```

## Recover from a failure

- A readiness failure halts cleanup. Review the service status, the latest deploy and the `readiness_failed` event in Render. Verify the private readiness token matches GitHub. A cold service receives one bounded retry.
- A cleanup 404 indicates that the endpoint, token or deployed version needs attention. Verify the deployed commit and rotate the cleanup token on Render and GitHub together if necessary.
- A cleanup 503 leaves staging reservations available for a retry. Look for `staged_cleanup_failed` in Render, check the storage connection, then run the manual preview and retry. Counts are safe to share internally.
- To pause scheduled maintenance for a restore, use **Disable workflow** from its Actions menu. Wait for any current run to finish. Re-enable the workflow and preview the backlog after recovery. Database and Storage backup instructions are in [Operations and recovery](OPERATIONS.md).

Only pending upload reservations older than 24 hours qualify. The database excludes files already linked to evidence and locks the selected reservations. Storage deletion uses their server-generated paths. The reservation clears after the Storage API confirms removal. Requests cannot supply an object path, age threshold or tenant. Other orphaned Storage objects require the separate reconciliation procedure in [Operations and recovery](OPERATIONS.md).

This is a daily readiness sample. Between runs, Render’s service dashboard exposes current service health. Free web services may sleep after 15 idle minutes and take about a minute to wake. GitHub may delay scheduled runs and may disable schedules in inactive public repositories. Check the latest successful run after a long quiet period. [Render Free service limits](https://render.com/docs/free) · [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
