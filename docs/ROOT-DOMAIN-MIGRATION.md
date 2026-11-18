# Move production to ecarteo.fr

The approved destination is `https://ecarteo.fr`. This supersedes the earlier proposal to redirect the root website to `app.ecarteo.fr`. The existing production origin remains `https://app.ecarteo.fr` until the coordinated cutover below is complete. Do not install the earlier root-to-app `.htaccess` block.

The user requires strictly free resources. Render documents two included Hobby custom domains and automatically adds `www` when adding an apex. Do not temporarily register all three hostnames on Render or assume the automatic alias is exempt from billing.

## Final hosting layout

| Host             | Destination               | Purpose                                                  |
| ---------------- | ------------------------- | -------------------------------------------------------- |
| `ecarteo.fr`     | Render production         | Website and application                                  |
| `www.ecarteo.fr` | Render production         | Redirect to the root                                     |
| `app.ecarteo.fr` | Existing one.com webspace | HTTPS 301 to the root, retaining paths and query strings |

No database, account, password, mail provider or nameserver migration is needed. Users must sign in again on the new hostname because their existing application cookies belong to `app.ecarteo.fr`.

## 1. DNS manager: prepare the old hostname redirect

The one.com Control Panel is managed externally. Webmail access is not sufficient. Complete this preparation before changing the live DNS:

1. Select `ecarteo.fr` in the one.com Control Panel. Back up the current DNS and any hosting files you edit privately.
2. On the new hosting platform, open **Domain → Subdomains → Add subdomain**, enter `app`, and note its folder. If that menu is absent, the legacy platform activates a subdomain from a folder named `app` in the main webspace, containing a lowercase `index.html` file. Preserve an existing folder and its contents rather than replacing it.
3. Keep the current `app` CNAME to `ecarteo-production.onrender.com` during preparation. If creating the subdomain would overwrite that record, stop and coordinate the cutover instead of changing it early.
4. Inside the folder serving `app.ecarteo.fr`, create/edit `.htaccess` with this block before existing rewrite rules:

   ```apache
   # BEGIN Ecarteo old-host redirect
   RewriteEngine On
   RewriteCond %{HTTP_HOST} ^app\.ecarteo\.fr(?::(?:80|443))?$ [NC]
   RewriteCond %{REQUEST_METHOD} ^(?:GET|HEAD)$
   RewriteCond %{REQUEST_URI} !^/\.well-known/acme-challenge/
   RewriteRule ^ https://ecarteo.fr%{REQUEST_URI} [R=301,L,NE]
   # END Ecarteo old-host redirect
   ```

5. Keep one.com's HTTPS service active for `app.ecarteo.fr`. Do not alter mail DNS, nameservers, or certificate-validation records.
6. Report that the folder/redirect is ready, without changing live web DNS yet.

Validate the prepared server with normal TLS verification before retiring the existing Render hostname:

```sh
curl --resolve app.ecarteo.fr:443:46.30.215.246 -sS -D - -o /dev/null \
  'https://app.ecarteo.fr/auth/confirm?token_hash=synthetic-test&type=recovery'
curl --resolve app.ecarteo.fr:443:46.30.215.246 -sS -D - -o /dev/null \
  'https://app.ecarteo.fr/?utm_source=qa&utm_campaign=launch%20test&utm_content=cta%2Bprimary'
```

Both must return 301 to the corresponding root URL, preserving the path and parameter values. The existing one.com IPv4 address above was verified on 18 November 2026; recheck it against the Control Panel at cutover. A TLS-valid 404 before folder preparation is not acceptance.

## 2. Coordinate the free cutover

This sequence trades a possible short maintenance window for keeping Render at two domains. Schedule it with the DNS manager. Do not delete the working `app` domain merely to prepare for a future, unscheduled DNS change.

1. Confirm the one.com redirect above works and the manager is ready. Reduce only the relevant web-record TTLs ahead of time if practical.
2. Ensure the reviewed migration code is deployed. It activates the old-host redirect only when production fullstack `APP_URL` is exactly `https://ecarteo.fr`. API/upload routes are excluded; unsafe methods are not replayed.
3. Remove only `app.ecarteo.fr` from the production Render service. Immediately add `ecarteo.fr`; Render automatically creates the `www` redirect. Verify the domain count is two. Never delete the service or database.
4. The DNS manager changes only the web records:

   | Type  | Host in one.com | Value                                               |
   | ----- | --------------- | --------------------------------------------------- |
   | A     | blank / apex    | `216.24.57.1`                                       |
   | CNAME | `www`           | `ecarteo-production.onrender.com`                   |
   | A     | `app`           | `46.30.215.246` (confirm one.com webspace IP first) |

   Replace conflicting A/CNAME records for those exact hosts. Remove old AAAA records for the apex and `www`, because Render uses IPv4. Leave MX, SPF, DKIM, DMARC, NS and unrelated records intact. Keep any valid one.com `app` IPv6 record only after verifying it serves the same prepared redirect.

5. Verify both Render domains and wait for valid TLS. If Render supplies ownership TXT records, provide the exact returned names/values to the manager; do not invent them.
6. Coordinate production origin changes after DNS and certificates are ready:
   - Render `APP_URL=https://ecarteo.fr`, followed by deployment/restart of the reviewed release.
   - Supabase production `hghlfdhzfxllcooaglzg`: Site URL `https://ecarteo.fr`; allow exact root `/auth/callback` and `/auth/callback?next=/reset-password` URLs. Retain the equivalent old-app callbacks during the transition so in-flight links can redirect. Existing email templates use `.SiteURL`.
   - GitHub repository variable `PRODUCTION_APP_ORIGIN=https://ecarteo.fr` after the root service is healthy.
   - Update the private production configuration and credential handoff URL fields without changing secrets.

Use a minimal scoped Supabase config or the dashboard. Do not push the repository's local `supabase/config.toml`, which contains localhost settings. Leave SMTP, confirmation requirements, database settings and all staging configuration unchanged.

## 3. Acceptance and rollback

Verify HTTP and HTTPS on the apex, `www` and old `app`, with tracking parameters. The final URL must be the root with equivalent query values and no loop or URL masking. Test root health, authenticated readiness, client/admin login, signup confirmation, recovery and new-password login through an approved mailbox. Old `/auth/confirm` links must redirect before token redemption so cookies are set on the root. Run the production maintenance preview after updating its repository variable.

Do not declare completion from DNS resolution alone. Record the deployed commit, Render domain status, TLS result, redirect hops and auth acceptance result.

If cutover fails, coordinate rollback rather than independently changing one layer: restore the previous APP_URL and Supabase URL settings, restore the saved web DNS, and restore the old `app` Render hostname after removing the new pair so the free allowance is respected. Restore the previous maintenance origin. Keep the working production data intact.

## References

- [Render custom domains](https://render.com/docs/custom-domains)
- [Render DNS records](https://render.com/docs/configure-other-dns)
- [one.com subdomain creation](https://help.one.com/hc/en-us/articles/115005595645-How-to-create-a-subdomain-manually)
- [one.com .htaccess editing](https://help.one.com/hc/en-us/articles/115005586209-How-can-I-redirect-a-visitor-to-another-page-via-the-htaccess-file)
