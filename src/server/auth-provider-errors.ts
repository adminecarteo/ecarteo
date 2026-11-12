/** Classify failures without treating a provider outage as a rejected identity. */
export function isAuthProviderUnavailable(
  error: { name?: string; status?: number } | null | undefined,
  responseStatus?: number,
): boolean {
  // PostgREST carries status on its response; Auth carries it on the error.
  // Both use status 0 for network failures. An undecodable Auth response may
  // omit status entirely, so it must not imply invalid credentials/access.
  const status = responseStatus ?? error?.status;
  return (
    status === 0 ||
    (status !== undefined && status >= 500) ||
    (error != null && (error.name === 'AuthRetryableFetchError' || status == null))
  );
}
