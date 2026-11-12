# Database and production backend verification

Tests use fictional data and must run only in a disposable local/CI database. **Never run bootstrap.sql against Supabase or an existing database.** It creates minimal Auth/Storage stand-ins, not a substitute provider. It fails when those schemas already exist.

Create an empty vanilla PostgreSQL database and set a local test URL, for example:

```sh
export ECARTEO_TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/ecarteo_test'
psql "$ECARTEO_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql
for migration in supabase/migrations/*.sql; do
  psql "$ECARTEO_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" || exit 1
done
psql "$ECARTEO_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/isolation.sql
npm test
```

`tests/workspace-server.test.ts` runs the production adapter against PostgreSQL only when `ECARTEO_TEST_DATABASE_URL` is explicitly set. Its integration suite rejects non-local database hosts. With no test URL, normal `npm test` safely skips those database-dependent cases while still checking the runtime command schema. Storage service calls are mocked in memory; no real uploads or emails occur. The SQL isolation file uses a rollback transaction; the server integration suite commits fictional data so concurrency and transaction behavior are real. Discard the database after the run.

For a local Supabase project, apply migrations through its CLI and run `isolation.sql` against that local instance; **omit bootstrap.sql**, because Supabase supplies the real Auth/Storage schemas. Run server tests in a separately disposable instance with test Auth identities before using any production data.

## Cases covered

- Anonymous, anonymous-Auth, unprovisioned and disabled profiles cannot read protected rows.
- Client A cannot read Client B reports, evidence, actions or files.
- Operators are restricted by UUID assignment even when names are identical.
- Quality has the specified global operational read scope.
- Authenticated browser writes and self-role promotion fail.
- Published report, mission, scenario and evidence records are immutable.
- Completed missions require a report in the same database transaction.
- Private objects require exact visible evidence metadata; path guessing and orphans convey no access.
- Published projections omit internal scripts/personas, including direct authenticated SQL reads.
- Concurrent command retries create one receipt/result. Changed payloads cannot reuse the same key.
- Stale observations and assessments cannot overwrite more recent edits.
- Customer action completion does not rewrite the report or internal mission snapshot.
- File staging binds bytes and metadata to the authenticated owner and mission.
- Confirmed signup creates only a new client role/tenant and ignores hostile role metadata.
- Auth rate limits are atomic across concurrent requests and store only hashed emails.
- Report correction supplements obey tenant RLS, hide administrative case IDs, remain immutable, and reject cross-tenant case references.
- Privacy case creation requires explicit apply; tenant export excludes unrelated organizations and requires disclosure review; operations journals cannot be modified.

The additional server suites cover team administration/invitations, request conversion, billing webhook idempotency and bounded workspace reads. All database suites need the same disposable loopback test URL and all migrations; normal runs skip database suites without that URL.

## Required real-provider checks

After configuring the actual Supabase project, repeat signup, confirmation email, sign-in, password recovery, disabled-account behavior and session expiration through HTTP. Test two customer tokens and two operator tokens against every read/mutation/download route and direct PostgREST reads. Verify Storage upload limits, successful download, unauthorized path denial, staged cleanup and backup restoration. Verify redirects and HTTPS cookies on the final application domain.

Provider JWT verification, email delivery, Supabase Storage behavior and deployed network controls are outside the local stand-in tests and must not be represented as already verified.
