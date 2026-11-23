# Render support draft — cached HTTP homepage redirects drop query strings

Prepared 23 November 2026. **Draft only; not sent.** Contains public URLs, service identifiers and synthetic tracking values only.

## Request

Please invalidate and investigate the automatic HTTP-to-HTTPS homepage redirect cache for `ecarteo.fr` and `www.ecarteo.fr`. Distinct query strings currently receive the same cached bare `Location`. We need the complete path and query string preserved in permanent redirects, without URL masking.

## Deployment context

- Static frontend: `srv-dc247ilg1s2s73esu650`; backend: `srv-dbtfv3ec6qcc73942dng`.
- Root and its automatic `www` companion moved from the web service to the static frontend at **14:26:58 UTC**. Exactly two custom domains are attached; both are verified, and normal HTTPS validation passed at **14:28:43 UTC**.
- Both services run source `09ca7c03eaceecebc4ac2a3c0e7035b41a217c7c`. Static redeploy `dep-dc24tah7lnhs7394dlt0` completed at **14:33:42 UTC** to invalidate the CDN cache after the move.
- That redeploy corrected HTTPS `www` redirects: two different synthetic queries now return their corresponding query strings with `CF-Cache-Status: BYPASS`. The HTTP homepage variants remained cached.
- The old web service is Free with cache profile `no-cache`; we have not invoked the web-service-cache purge endpoint on the static service or changed any cache plan.

## Reproduction and evidence

```sh
curl --silent --show-error --dump-header - --output /dev/null \
  'http://ecarteo.fr/?utm_source=qa-first&nonce=202611231435-first'
curl --silent --show-error --dump-header - --output /dev/null \
  'http://ecarteo.fr/?utm_source=qa-second&nonce=202611231435-second'
curl --silent --show-error --dump-header - --output /dev/null \
  'http://www.ecarteo.fr/?utm_source=qa-first&nonce=202611231435-first'
```

Observed after the successful static redeploy:

| Request                 | Status | Location                  | Cache | Age | CF-Ray                 |
| ----------------------- | ------ | ------------------------- | ----- | --- | ---------------------- |
| HTTP apex, first query  | 301    | `https://ecarteo.fr/`     | HIT   | 486 | `a5f0e62aefb0c3be-CDG` |
| HTTP apex, second query | 301    | `https://ecarteo.fr/`     | HIT   | 486 | `a5f0e62b6cdb33c4-CDG` |
| HTTP www, first query   | 301    | `https://www.ecarteo.fr/` | HIT   | 484 | `a5f0e62c493cde24-CDG` |

At **14:40:43 UTC**, the apex HTTP response still reported `HIT`, `Age: 816`, and a bare location, even with request `Cache-Control: no-cache, no-store, max-age=0` and `Pragma: no-cache` (CF-Ray `a5f0ee3d7cab9ef2-CDG`). A separate request containing only a non-secret locale/test cookie behaved the same. These responses have no response `Cache-Control` header; `Vary` is `accept-encoding`.

Control cases:

- `https://ecarteo.fr/?utm_source=...` returns the static page directly and retains the browser URL.
- `https://www.ecarteo.fr/?utm_source=...` now redirects to the corresponding root URL with its query intact and `BYPASS`.
- The same queries on `/methode` are preserved through HTTP and www redirects, with `BYPASS` and no `Age`.
- Private application requests retain `private, no-store`; authenticated cache isolation, three-role login and logout passed. No customer or authentication tokens were included in redirect probes.

Please confirm the supported way to purge these HTTP redirect entries and ensure each request's query string is retained, including after a bare-homepage redirect has been cached. The elapsed `Age` does not establish an expiry time; we have not assumed one.

Until corrected, use the canonical **`https://ecarteo.fr/`** address for campaign links. This avoids the affected HTTP redirect; it does not claim that those redirects are fixed.
